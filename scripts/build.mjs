#!/usr/bin/env node
// Build the static fulfillment-reviews site.
//
//   node scripts/build.mjs [--run-root <dir>] [--limit 20] [--slug <dir-name>]... [--max-px 1600] (design assets: 3200 px lossless PNG; evidence photos: 1200 px) [--no-upload]
//
// Reads the brand-design run root (read-only), picks the newest N runs that have a
// review canvas, stages each canvas's assets under .staging/<slug>/ (git-ignored),
// downsizes images, uploads them to Vercel Blob keyed by content hash (skipping keys
// already in data/blob-index.json), and writes public/<slug>/index.html with the
// references rewritten to the blob URLs. Small text/vector assets stay in public/.
// data/sites.json is written and public/index.html is rendered from it.
//
// No npm dependencies. Image downsizing shells out to scripts/shrink.py (Pillow).
// The blob token comes from BLOB_READ_WRITE_TOKEN or .env.local and is never printed.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderIndex } from "./index-page.mjs";
import { loadToken, putBlob } from "./blob.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DEFAULT_RUN_ROOT =
  "/Users/travisse/Programming/projects/brand-design-spike-2026-07-06/runs-prod-2026-09-18";

// Pipeline stage order, used to derive a human status from state.cursor.
const STAGES = ["request", "evidence", "decision", "gates", "variants", "links", "overrides", "write", "proofs", "figma", "slack", "notion"];

// Assets of these types stay in public/ when under this size; everything else goes to Blob.
const LOCAL_TYPES = new Set([".html", ".json", ".css", ".js", ".svg"]);
const LOCAL_MAX_BYTES = 200 * 1024;

function parseArgs(argv) {
  const args = { runRoot: DEFAULT_RUN_ROOT, limit: 20, slugs: [], maxPx: 1600, out: path.join(ROOT, "public"), upload: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--run-root") args.runRoot = path.resolve(next());
    else if (a === "--limit") args.limit = Number(next());
    else if (a === "--slug") args.slugs.push(next());
    else if (a === "--max-px") args.maxPx = Number(next());
    else if (a === "--out") args.out = path.resolve(next());
    else if (a === "--no-upload") args.upload = false;
    else if (a === "--help" || a === "-h") { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 14).join("\n")); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function exists(p) { try { fs.statSync(p); return true; } catch { return false; } }
function sha256(p) { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function mb(n) { return (n / 1e6).toFixed(1) + " MB"; }

function listRuns(runRoot) {
  const runs = [];
  for (const name of fs.readdirSync(runRoot)) {
    const dir = path.join(runRoot, name);
    const runJson = path.join(dir, "run.json");
    const canvas = path.join(dir, "review", "review-canvas.html");
    if (!exists(runJson) || !exists(canvas)) continue;
    let run;
    try { run = readJson(runJson); } catch (e) { console.warn(`skip ${name}: run.json unreadable (${e.message})`); continue; }
    runs.push({ slug: name, dir, run, createdAt: run?.request?.created_at || run?.created_at || "" });
  }
  runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return runs;
}

function selectRuns(all, { limit, slugs }) {
  const chosen = all.slice(0, limit);
  for (const slug of slugs) {
    if (chosen.some((r) => r.slug === slug)) continue;
    const r = all.find((x) => x.slug === slug);
    if (!r) { console.warn(`--slug ${slug}: no run.json + review/review-canvas.html found, skipped`); continue; }
    chosen.push(r);
  }
  chosen.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return chosen;
}

function statusFor(cursor, picked) {
  const i = STAGES.indexOf(cursor);
  if (i < 0) return { key: "unknown", label: "Unknown" };
  if (i < STAGES.indexOf("write")) return picked ? { key: "picked", label: "Pick recorded" } : { key: "awaiting", label: "Awaiting pick" };
  if (i < STAGES.indexOf("slack")) return { key: "applied", label: "Branding applied" };
  return { key: "closed", label: "Closed out" };
}

// Recommended letter: variants.fable_default_letter (Fable's default cell), falling back to
// variants.review_canvas.fable_default_letter. Picked letter: variants.selection.letter
// (Travisse's recorded pick), then variants.applied_letter, then write.inherited_branding.letter
// (sister locations that inherit a pick made on another run).
function letters(run) {
  const v = run.variants || {};
  const w = run.write || {};
  const recommended = v.fable_default_letter ?? v.review_canvas?.fable_default_letter ?? null;
  const picked = v.selection?.letter ?? v.applied_letter ?? w.inherited_branding?.letter ?? null;
  return { recommended, picked };
}

// Last updated: the newest state.stages.*.written_at in run.json. Every pipeline step that
// changes the run writes its stage timestamp, so this tracks real progress; file mtimes also
// move on cosmetic rewrites. Falls back to run.json updated_at, then the run.json mtime.
function lastUpdated(r) {
  let best = null;
  for (const st of Object.values(r.run.state?.stages || {})) {
    const t = st?.written_at;
    if (t && (!best || t > best)) best = t;
  }
  if (!best) best = r.run.updated_at || null;
  if (!best) best = fs.statSync(path.join(r.dir, "run.json")).mtime.toISOString();
  return best;
}

const ADMIN_ANCHOR = /<a\b[^>]*href="https?:\/\/new\.boostly\.com\/[^"]*"[^>]*>[\s\S]*?<\/a>\s*/g;
// Run-internal text artifacts that are not for the public site: the link-discovery report is a
// multi-MB crawl dump of third-party pages (with their CSRF/session strings), and prompts.md holds
// local absolute paths and API usage. Their anchors are removed; nothing else references them.
const INTERNAL_ANCHOR = /<a\b[^>]*href="(?:\.\.\/)*[^"]*\.(?:json|md|txt|log)"[^>]*>[\s\S]*?<\/a>\s*/g;

function stage(r, stagingDir, maxPx) {
  const reviewDir = path.join(r.dir, "review");
  const slugDir = path.join(stagingDir, r.slug);
  fs.rmSync(slugDir, { recursive: true, force: true });
  fs.mkdirSync(slugDir, { recursive: true });
  let html = fs.readFileSync(path.join(reviewDir, "review-canvas.html"), "utf8");

  const internalLinks = (html.match(INTERNAL_ANCHOR) || []).length;
  html = html.replace(INTERNAL_ANCHOR, "");
  const adminLinks = (html.match(ADMIN_ANCHOR) || []).length;
  html = html.replace(ADMIN_ANCHOR, "");

  const staged = new Map(); // source abs -> staged rel path (under slugDir)
  const missing = [];
  const outside = [];
  html = html.replace(/(src|href)="([^"]+)"/g, (m, attr, ref) => {
    if (/^(https?:|data:|#|mailto:|javascript:|\/\/)/.test(ref)) return m;
    const src = path.resolve(reviewDir, ref.split("?")[0].split("#")[0]);
    if (!src.startsWith(r.dir + path.sep)) { outside.push(ref); return m; }
    if (!exists(src) || fs.statSync(src).isDirectory()) { missing.push(ref); return m; }
    let rel = staged.get(src);
    if (!rel) {
      rel = path.relative(r.dir, src).split(path.sep).join("/").replace(/[^A-Za-z0-9_.\/-]/g, "_");
      const dst = path.join(slugDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      staged.set(src, rel);
    }
    return `${attr}="@@${rel}@@"`;
  });

  // Downsize raster images in place, tiered by what the image is (Travisse 2026-10-09: variants must
  // stay high-res on the review pages; evidence photos can go lower).
  //   design  (variants/, candidates/, signage/, fix/, review/, mockups/): 3200 px, PNG kept lossless, JPEG q92
  //   evidence (evidence/, gbp, instagram, website, brand-environment):      1200 px, JPEG q78
  //   other:                                                                 maxPx (1600), JPEG q82
  const tierFor = (rel) => {
    if (/^(variants|candidates|signage|fix|review|mockups)\//.test(rel)) return { max_px: Math.max(maxPx, 3200), quality: 92, keep_png: true };
    if (/^evidence\//.test(rel) || /gbp|instagram|website|brand-environment|contact-sheet/i.test(rel)) return { max_px: Math.min(maxPx, 1200), quality: 78 };
    return { max_px: maxPx, quality: 82 };
  };
  const rasters = [...staged.values()].filter((p) => /\.(png|jpe?g|webp)$/i.test(p)).map((p) => ({ path: path.join(slugDir, p), ...tierFor(p) }));
  let renamed = {};
  if (rasters.length) {
    const out = execFileSync("python3", [path.join(HERE, "shrink.py")], { input: JSON.stringify(rasters), maxBuffer: 64 * 1024 * 1024 }).toString();
    renamed = JSON.parse(out || "{}");
  }
  const finalRel = new Map(); // staged rel (pre-shrink) -> final rel
  for (const rel of staged.values()) {
    const abs = path.join(slugDir, rel);
    const newAbs = renamed[abs] || abs;
    finalRel.set(rel, path.relative(slugDir, newAbs).split(path.sep).join("/"));
  }

  // Small nav back to the index, injected into the canvas's own TOC.
  html = html.replace(/(<nav class="toc"[^>]*>)/, `$1<a class="top" href="/" style="margin-bottom:12px">&larr; All locations</a>`);

  return { html, slugDir, assets: [...finalRel.entries()], missing, outside, adminLinks, internalLinks };
}

async function publish(r, s, outDir, blobIndex, token, upload) {
  const pageDir = path.join(outDir, r.slug);
  fs.mkdirSync(pageDir, { recursive: true });
  let html = s.html;
  let localBytes = 0, blobBytes = 0, uploaded = 0, reused = 0;
  const jobs = [];
  for (const [origRel, rel] of s.assets) {
    const abs = path.join(s.slugDir, rel);
    const size = fs.statSync(abs).size;
    const ext = path.extname(rel).toLowerCase();
    if (LOCAL_TYPES.has(ext) && size <= LOCAL_MAX_BYTES) {
      const pub = `assets/${rel}`;
      const dst = path.join(pageDir, pub);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(abs, dst);
      localBytes += size;
      html = html.split(`"@@${origRel}@@"`).join(`"/${r.slug}/${pub}"`);
      continue;
    }
    const key = `assets/${r.slug}/${sha256(abs).slice(0, 12)}-${path.basename(rel)}`;
    jobs.push({ origRel, abs, key, size });
  }
  // Upload missing keys with bounded concurrency.
  const pending = jobs.filter((j) => !blobIndex[j.key]);
  if (pending.length && !upload) throw new Error(`${r.slug}: ${pending.length} assets need upload but --no-upload was given`);
  let idx = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (idx < pending.length) {
      const j = pending[idx++];
      const res = await putBlob(token, j.key, j.abs);
      blobIndex[j.key] = { url: res.url, bytes: res.bytes };
      uploaded++;
    }
  }));
  for (const j of jobs) {
    const entry = blobIndex[j.key];
    if (!pending.includes(j)) reused++;
    blobBytes += entry.bytes;
    html = html.split(`"@@${j.origRel}@@"`).join(`"${entry.url}"`);
  }
  if (/@@[^"]+@@/.test(html)) throw new Error(`${r.slug}: unresolved asset placeholder`);
  fs.writeFileSync(path.join(pageDir, "index.html"), html);
  return { pageBytes: Buffer.byteLength(html) + localBytes, blobBytes, blobCount: jobs.length, uploaded, reused, localCount: s.assets.length - jobs.length };
}

function siteEntry(r, p) {
  const req = r.run.request || {};
  const id = req.identity || {};
  const fig = r.run.figma || {};
  const handoffPath = path.join(r.dir, "print-handoff", "handoff.json");
  let handoffUrl = null;
  if (exists(handoffPath)) { try { handoffUrl = findKey(readJson(handoffPath), "folder_link"); } catch {} }
  const { recommended, picked } = letters(r.run);
  const status = statusFor(r.run.state?.cursor, picked);
  return {
    slug: r.slug,
    name: req.location_name || id.location_name || r.slug,
    account: req.account_name || id.account_name || null,
    city: id.city || null,
    state: id.state || null,
    requested_at: r.createdAt || null,
    updated_at: lastUpdated(r),
    cursor: r.run.state?.cursor || null,
    status: status.key,
    status_label: status.label,
    recommended_letter: recommended,
    picked_letter: picked,
    review_url: `/${r.slug}/`,
    figma_url: fig.section_url || null,
    print_handoff_url: handoffUrl,
    page_bytes: p.pageBytes,
    blob_bytes: p.blobBytes,
    blob_assets: p.blobCount,
  };
}

function findKey(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  if (key in obj && typeof obj[key] === "string") return obj[key];
  for (const v of Object.values(obj)) { const f = findKey(v, key); if (f) return f; }
  return null;
}

function dirSize(dir) {
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    total += ent.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

async function main() {
  // On Vercel the committed public/ is the deliverable; the run root does not exist there.
  if (process.env.VERCEL && exists(path.join(ROOT, "public", "index.html"))) {
    console.log("VERCEL build: public/ is prebuilt and committed, nothing to do");
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  if (!exists(args.runRoot)) throw new Error(`run root not found: ${args.runRoot}`);
  const token = loadToken(ROOT);
  if (args.upload && !token) throw new Error("BLOB_READ_WRITE_TOKEN not found in the environment or .env.local (run: vercel env pull .env.local --scope boostly)");

  const all = listRuns(args.runRoot);
  const chosen = selectRuns(all, args);
  console.log(`run root: ${args.runRoot}\nruns with a review canvas: ${all.length}; selected: ${chosen.length}`);

  const indexPath = path.join(ROOT, "data", "blob-index.json");
  const blobIndex = exists(indexPath) ? readJson(indexPath) : {};
  const stagingDir = path.join(ROOT, ".staging");
  fs.rmSync(args.out, { recursive: true, force: true });
  fs.mkdirSync(args.out, { recursive: true });

  const sites = [];
  let uploaded = 0;
  for (const r of chosen) {
    const s = stage(r, stagingDir, args.maxPx);
    const p = await publish(r, s, args.out, blobIndex, token, args.upload);
    uploaded += p.uploaded;
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(sortKeys(blobIndex), null, 1) + "\n"); // checkpoint after every page
    const entry = siteEntry(r, p);
    sites.push(entry);
    const warn = [s.missing.length ? `missing refs: ${s.missing.join(", ")}` : "", s.outside.length ? `refs outside run dir (left as-is): ${s.outside.join(", ")}` : ""].filter(Boolean).join("; ");
    console.log(`${r.slug.padEnd(42)} blob ${mb(p.blobBytes).padStart(8)} (${String(p.blobCount).padStart(2)} assets, ${p.uploaded} new)  page ${(p.pageBytes / 1024).toFixed(0).padStart(4)} KB  ${entry.status_label.padEnd(16)} rec ${entry.recommended_letter ?? "-"} pick ${entry.picked_letter ?? "-"}  stripped ${s.adminLinks} admin/${s.internalLinks} internal${warn ? "  !! " + warn : ""}`);
  }

  const manifest = { generated_at: new Date().toISOString(), count: sites.length, sites };
  fs.writeFileSync(path.join(ROOT, "data", "sites.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.mkdirSync(path.join(args.out, "data"), { recursive: true });
  fs.writeFileSync(path.join(args.out, "data", "sites.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(args.out, "index.html"), renderIndex(manifest));

  const blobTotal = Object.values(blobIndex).reduce((a, b) => a + b.bytes, 0);
  const heaviest = [...sites].sort((a, b) => b.blob_bytes - a.blob_bytes).slice(0, 3);
  console.log(`\npublic/: ${mb(dirSize(args.out))}  blob index: ${Object.keys(blobIndex).length} assets, ${mb(blobTotal)} (${uploaded} uploaded this run)\nheaviest (blob): ${heaviest.map((s) => `${s.slug} ${mb(s.blob_bytes)}`).join(", ")}`);
}

function sortKeys(o) { return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])); }

main().catch((e) => { console.error(e.message); process.exit(1); });
