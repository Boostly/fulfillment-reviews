// Signage sheets + Print files sections, and the standalone page for runs without a review canvas.
//
// Print files (Karissa 2026-10-19): when <run>/print-handoff/ exists, the page carries one link to
// the location's Google Drive print folder (the per-location folder boostly-print-handoff creates
// under the vendor master folder, recorded as drive.folder_link in print-handoff/handoff.json).
// The PDFs themselves are never uploaded to or hosted on this site. No Drive folder yet: the
// section reads "Print files: not uploaded yet".
//
// Links-only siblings (no review canvas, e.g. the Park Avenue BBQ Grille locations that inherit the
// Boynton Beach branding) get a standalone page built from run.json alone when
// signage.direct.status is "built": location name, branding note, links summary, signage sheets and
// print files. Nothing is fabricated: no variant sheet, no candidates, no canvas sections.
//
// Public page: no ship-to data (street, postal code), no Boostly admin links, no internal ids.

import fs from "node:fs";
import path from "node:path";

function exists(p) { try { fs.statSync(p); return true; } catch { return false; } }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// null when the run has no print-handoff/ (no section); { url: null } when the folder is not on
// Drive yet; { url } with the Drive folder link otherwise.
export function printFolder(r) {
  const dir = path.join(r.dir, "print-handoff");
  if (!exists(dir)) return null;
  let url = null;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, "handoff.json"), "utf8")).drive || {};
    url = d.folder_link || (d.folder_id ? `https://drive.google.com/drive/folders/${d.folder_id}` : null);
  } catch {}
  if (url && !/^https:\/\/drive\.google\.com\//.test(url)) url = null;
  return { url };
}

// signage/shots copy first (design tier), the print-handoff original as fallback.
export function signagePreview(r) {
  const d = r.run.signage?.direct;
  if (!d?.preview_png) return null;
  const cands = [path.join(r.dir, "signage", "shots", "review-sheets.png"), path.join(r.dir, String(d.preview_png))];
  const f = cands.find(exists);
  return f ? "../" + path.relative(r.dir, f).split(path.sep).join("/") : null;
}

export function signageSectionHtml(r, ref) {
  const d = r.run.signage?.direct || {};
  const kinds = d.kinds ? Object.entries(d.kinds).map(([k, n]) => `${k} ${n}`).join(", ") : null;
  const sub = `${d.approved ? "Approved" : "Awaiting your approval"}. Every print page as it goes to customstickers.com${d.pages ? ` (${d.pages} pages${kinds ? `: ${kinds}` : ""})` : ""}. Click to open full size.`;
  return `<section id="signage-sheets">
<h2>Signage sheets</h2><p class="sub">${esc(sub)}</p>
<div class="shot"><a href="${ref}" target="_blank"><img src="${ref}" alt="signage print sheets"></a></div>
</section>
`;
}

export function printFilesSectionHtml(folder) {
  const body = folder.url
    ? `<p><a class="ext" href="${esc(folder.url)}" target="_blank" rel="noopener">Print files (Google Drive folder) &#8599;</a></p>
<p class="sub">The six vector PDFs and logos sent to customstickers.com for this location.</p>`
    : `<p><b>Print files:</b> not uploaded yet.</p>`;
  return `<section id="print-files">
<h2>Print files</h2>
${body}
</section>
`;
}

// Adds Signage sheets (only when the canvas predates the inline section) and Print files to a
// review canvas, plus their TOC entries. Inserted right after the signage sheets section, or after
// the overview when the canvas has none.
export function injectIntoCanvas(html, r, folder) {
  const preview = signagePreview(r);
  const hasSheets = /<section id="signage-sheets"/.test(html);
  if (/<section id="print-files"/.test(html)) return html;
  let block = "";
  const toc = [];
  if (!hasSheets && preview) { block += signageSectionHtml(r, preview); toc.push(["signage-sheets", "Signage sheets"]); }
  if (folder) { block += printFilesSectionHtml(folder); toc.push(["print-files", "Print files"]); }
  if (!block) return html;
  const anchorId = hasSheets ? "signage-sheets" : "header";
  const start = html.indexOf(`<section id="${anchorId}"`);
  const end = start >= 0 ? html.indexOf("</section>", start) : -1;
  if (end < 0) {
    html = html.replace(/<\/body>/i, `${block}</body>`);
  } else {
    const at = end + "</section>".length;
    html = html.slice(0, at) + "\n" + block + html.slice(at);
  }
  const lis = toc.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("\n");
  const tocAnchor = new RegExp(`(<li><a href="#${anchorId}"[^>]*>[^<]*</a></li>)`);
  if (tocAnchor.test(html)) html = html.replace(tocAnchor, `$1\n${lis}`);
  return html;
}

// ---- standalone page (no review canvas) -------------------------------------------------------

function host(u) { try { const x = new URL(u); return (x.host.replace(/^www\./, "") + x.pathname).replace(/\/$/, "/"); } catch { return String(u); } }
const CAT_LABELS = { x_twitter: "X", order: "Ordering", gift_cards: "Gift cards", careers_jobs: "Careers", loyalty_rewards: "Loyalty", ios_app: "iOS app", android_app: "Android app", other_custom: "Other" };
function catLabel(c) { return String(c || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => CAT_LABELS[s] || s.replace(/_/g, " ")).join(", ").replace(/^./, (m) => m.toUpperCase()); }

function linksSummary(run) {
  const l = run.links || {};
  const ex = Array.isArray(l.execution) ? l.execution : [];
  const written = [], already = [], held = [], notWritten = [];
  for (const e of ex) {
    const op = e.operation || {};
    const row = { cat: catLabel(op.category), url: op.url || null };
    if (e.outcome === "applied") written.push(row);
    else if (e.outcome === "held" || op.action === "hold") held.push(row);
    else if (e.outcome === "skipped_existing" && op.action === "ready") already.push(row);
    else notWritten.push(row);
  }
  for (const h of Array.isArray(l.held) ? l.held : []) {
    const row = { cat: catLabel(h.category), url: h.url || null };
    if (!held.some((x) => x.cat === row.cat)) held.push(row);
  }
  return { written, already, held, notWritten, any: ex.length > 0 };
}

function rowsHtml(rows) {
  return rows.map((x) => `<li><b>${esc(x.cat)}</b>${x.url ? ` <a class="ext" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(host(x.url))}</a>` : ""}</li>`).join("\n");
}

function brandingNote(run, runRoot) {
  const w = run.write || {};
  const eb = w.existing_branding || {};
  const src = w.branding_source_run ? path.basename(String(w.branding_source_run)) : null;
  let srcName = null;
  if (src) { try { const s = JSON.parse(fs.readFileSync(path.join(runRoot, src, "run.json"), "utf8")); srcName = s.request?.location_name || s.request?.identity?.location_name || null; } catch {} }
  const parts = [];
  if (w.existing_kept || w.inherited) parts.push(esc(`Existing ${eb.scope === "account" ? "account " : ""}branding kept${w.inherited ? " and inherited" : ""}; no branding colors or logo were written for this location.`));
  else if (w.written_this_run) parts.push("Branding was written for this location in this run.");
  if (src) parts.push(`Branding source: ${srcName ? esc(srcName) + " " : ""}(<a href="/${esc(src)}/">review page</a>). This location has no review canvas of its own (links and signage only).`);
  const swatches = [["Primary", eb.web_primary_color], ["Secondary", eb.web_secondary_color], ["Text", eb.web_text_color], ["Print text secondary", eb.print_text_secondary_color]]
    .filter(([, c]) => /^#[0-9a-f]{3,8}$/i.test(String(c || "")))
    .map(([l, c]) => `<span class="sw"><i style="background:${c}"></i>${esc(l)} ${esc(c)}</span>`).join(" ");
  return { html: parts.map((p) => `<p>${p}</p>`).join("\n"), swatches };
}

export function standalonePage(r, runRoot, folder) {
  const run = r.run;
  const req = run.request || {};
  const id = req.identity || {};
  const name = req.location_name || id.location_name || r.slug;
  const place = [id.city, id.state].filter(Boolean).join(", ");
  const b = brandingNote(run, runRoot);
  const ls = linksSummary(run);
  const preview = signagePreview(r);
  const toc = [["header", "Overview"], ["links", "Links"]];
  if (preview) toc.push(["signage-sheets", "Signage sheets"]);
  if (folder) toc.push(["print-files", "Print files"]);
  const linksHtml = !ls.any ? `<p class="sub">No link results recorded in run.json.</p>` : `
<p class="sum">${ls.written.length} written, ${ls.already.length} already on the location, ${ls.held.length} held for review, ${ls.notWritten.length} rejected or none found.</p>
${ls.written.length ? `<h3>Written</h3><ul class="lk">${rowsHtml(ls.written)}</ul>` : ""}
${ls.already.length ? `<h3>Already on the location</h3><ul class="lk">${rowsHtml(ls.already)}</ul>` : ""}
${ls.held.length ? `<h3>Held for review</h3><ul class="lk">${rowsHtml(ls.held)}</ul>` : ""}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} review</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fafaf8; color: #161616; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  nav.toc { position: fixed; top: 16px; left: 16px; width: 180px; font-size: 14px; }
  nav.toc ol { list-style: none; padding: 0; margin: 0; } nav.toc li { margin: 4px 0; }
  nav.toc a { color: #1f5eff; text-decoration: none; } nav.toc a.top { display: block; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px 228px; }
  h1 { font-size: 30px; margin: 0 0 4px; } h2 { font-size: 22px; margin: 0 0 6px; } h3 { font-size: 15px; margin: 14px 0 4px; }
  section { margin: 0 0 40px; } .sub, .place { color: #5c5c5c; margin: 0 0 8px; } .sum { font-weight: 700; }
  ul.lk { margin: 0; padding-left: 20px; } ul.lk li { margin: 2px 0; } a.ext { color: #1f5eff; }
  .sw { display: inline-flex; align-items: center; gap: 6px; margin: 4px 14px 4px 0; font-size: 14px; } .sw i { width: 18px; height: 18px; border-radius: 4px; border: 1px solid #ccc; display: inline-block; }
  .shot img { display: block; max-width: 100%; height: auto; border: 1px solid #ddd; background: #fff; }
  @media (max-width: 1000px) { nav.toc { position: static; width: auto; padding: 16px 16px 0; } nav.toc ol { display: flex; flex-wrap: wrap; gap: 4px 14px; } main { padding: 16px; } }
</style></head>
<body>
<main>
<nav class="toc" id="toc"><ol>
${toc.map(([i, l]) => `<li><a href="#${i}">${l}</a></li>`).join("\n")}
</ol></nav>
<section id="header">
<h1>${esc(name)}</h1>${place ? `<p class="place">${esc(place)}</p>` : ""}
<h2 style="margin-top:16px">Branding</h2>
${b.html}
${b.swatches ? `<p>${b.swatches}</p>` : ""}
</section>
<section id="links">
<h2>Links</h2>${linksHtml}
</section>
${preview ? signageSectionHtml(r, preview) : ""}${folder ? printFilesSectionHtml(folder) : ""}
</main>
</body></html>
`;
}
