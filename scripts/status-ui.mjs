// Status board UI shared by the index and every location page.
//
// The build bakes each location's status fields (from <run-root>/checklist/checklist.json,
// checklist/notes.json and <run>/review/status.json) into the page. The same fields are also
// published to Vercel Blob every 5 minutes by review-checklist.py --publish-status (public read,
// 60 s cache), and the pages overlay that live copy on load so the board stays current between
// site builds. Nothing here carries ship-to data; the checklist publisher strips it.

export const STATUS_CSS = `
  .ss { font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #161616; }
  .ss .pill { display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; border: 1px solid transparent; vertical-align: middle; }
  .ss .pill.awaiting, .ss .pill.picked, .ss .pill.inherits { background: #fff4e0; color: #b26a00; border-color: #f1dcb0; }
  .ss .pill.applied { background: #e8f0ff; color: #1f5eff; border-color: #c7d8ff; }
  .ss .pill.closed { background: #e6f4ea; color: #1b7a3d; border-color: #bfe0c9; }
  .ss .pill.unknown { background: #eee; color: #5c5c5c; }
  .ss .need { display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 6px; background: #fdecec; color: #b3261e; border: 1px solid #f3c2bd; margin: 2px 6px 2px 0; white-space: nowrap; }
  .ss .need.soft { background: #f3f3f0; color: #5c5c5c; border-color: #e3e3df; }
  .ss .hold { display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 6px; background: #fff4e0; color: #b26a00; border: 1px solid #f1dcb0; margin: 2px 6px 2px 0; }
  .ss .steps { display: inline-flex; gap: 3px; vertical-align: middle; margin-right: 8px; }
  .ss .steps i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; background: #e3e3df; }
  .ss .steps i.on { background: #1b7a3d; }
  .ss .steps i.next { background: #fff; border: 2px solid #b26a00; box-sizing: border-box; }
  .ss .next { color: #5c5c5c; font-size: 13px; }
  .ss .meta { color: #5c5c5c; font-size: 13px; }
  .ss .note { color: #161616; font-size: 13px; margin-top: 4px; max-width: 90ch; }
  .ss .stage { font-size: 12px; color: #5c5c5c; text-transform: uppercase; letter-spacing: .05em; }
  .ss .pstage { display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; padding: 2px 7px; border-radius: 4px; background: #eef2f7; color: #334155; border: 1px solid #d5dde8; margin-right: 6px; }
  .ss .pnext { font-size: 13px; color: #161616; margin-right: 8px; }
  .ss .pwho { font-size: 12px; color: #5c5c5c; }
  /* "What's next" (2026-10-21): one primary chip, smaller muted secondary chips. Chips wrap inside their cell. */
  .ss .wn { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; min-width: 0; }
  .ss .wn .need, .ss .wn .hold, .ss .wn .prog-chip, .ss .wn .done-chip, .ss .wn .sec { white-space: normal; overflow-wrap: anywhere; max-width: 100%; margin: 0; }
  .ss .wn a { color: inherit; }
  .ss .prog-chip { display: inline-block; font-size: 12px; padding: 3px 9px; border-radius: 6px; background: #eef2f7; color: #334155; border: 1px solid #d5dde8; }
  .ss .done-chip { display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 6px; background: #e6f4ea; color: #1b7a3d; border: 1px solid #bfe0c9; }
  .ss .sec { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 5px; background: #f3f3f0; color: #5c5c5c; border: 1px solid #e3e3df; }
  .ss .sec.owed { color: #b3261e; border-color: #f3c2bd; background: #fdf5f4; }
  .ss details.note-d { margin-top: 4px; font-size: 12px; color: #5c5c5c; }
  .ss details.note-d summary { cursor: pointer; display: inline; list-style: none; text-decoration: underline dotted; }
  .ss details.note-d summary::-webkit-details-marker { display: none; }
  .ss details.note-d .note { margin-top: 4px; overflow-wrap: anywhere; }
  .site-status { position: sticky; top: 8px; z-index: 20; background: #fffdf7; border: 1px solid #ecdfb8; border-radius: 10px; padding: 10px 14px; margin: 0 0 20px; display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .site-status .grp { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
  .site-status .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #5c5c5c; }
  .site-status .live { margin-left: auto; font-size: 12px; color: #5c5c5c; }
  .site-status .live.off { color: #b26a00; }
  @media (max-width: 1000px) { .site-status { position: static; } }
`;

// Client code. Exposes window.BoostlyStatus = { whatsNext, nextHtml, noteHtml, overlay(url, onItems), strip, ... }.
export const STATUS_JS = `
window.BoostlyStatus = (function () {
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function stepsHtml(steps) {
    if (!steps || !steps.length) return "";
    var done = 0, nextIdx = -1, html = "";
    for (var i = 0; i < steps.length; i++) { if (steps[i][1]) done++; else if (nextIdx < 0) nextIdx = i; }
    for (var j = 0; j < steps.length; j++) html += '<i class="' + (steps[j][1] ? "on" : (j === nextIdx ? "next" : "")) + '" title="' + esc(steps[j][0]) + (steps[j][1] ? " (done)" : "") + '"></i>';
    var next = nextIdx < 0 ? "all steps done" : "next: " + steps[nextIdx][0].charAt(0).toLowerCase() + steps[nextIdx][0].slice(1);
    return '<span class="steps" title="' + done + " of " + steps.length + ' steps done">' + html + '</span><span class="next">' + done + "/" + steps.length + ", " + esc(next) + '</span>';
  }
  function needsHtml(s) {
    var out = "";
    // "approve the signage" points at the page's Print files section (the Drive PDFs are what gets approved).
    (s.needs_you || []).forEach(function (n) {
      var t = esc(n.replace("(s)", "s"));
      if (n.indexOf("approve the signage") === 0) t = '<a href="' + esc(s.review_url || "") + '#print-files">' + t + '</a>';
      out += '<span class="need">' + t + '</span>';
    });
    (s.gaps || []).forEach(function (g) { out += '<span class="need soft">' + esc(g) + '</span>'; });
    if (s.hold) out += '<span class="hold" title="' + esc(s.hold) + '">HOLD</span>';
    if (!out && s.done) out += '<span class="need soft">review complete</span>';
    else if (!out && !s.steps) out += '<span class="need soft">' + (s.status === "closed" ? "closed out" : "not on the open-request list") + '</span>';
    else if (!out && s.status !== "closed") out += '<span class="need soft">with the agents, nothing for you</span>';
    return out;
  }
  // "What's next" (Travisse 2026-10-21): the one derivation behind the index column, its summary counts and
  // sort, and the strip on each location page. Owed items come from needs_you in this priority; with nothing
  // owed: an editing claim under 2 h -> in progress; done; a run-progress stage that is not blocked on
  // Travisse -> in progress; hold; else the blocked_on / waiting_on / with-the-agents fallbacks.
  var RANK = { pick: 1, signage: 2, links: 3, store: 4, other: 5 };
  var CLAIM_MS = 2 * 3600 * 1000;
  function owed(s) {
    if (s.done) return [];
    var out = [];
    (s.needs_you || []).forEach(function (n) {
      var low = String(n).toLowerCase(), m;
      if (low.indexOf("pick a letter") === 0) out.push({ kind: "pick", text: "pick a letter" + (s.rec ? " (Fable default " + s.rec + ")" : "") });
      else if (/^approve the (figma )?signage/.test(low)) {
        var figma = low.indexOf("figma") !== -1 && s.figma_url;
        var href = s.print_url || (figma ? s.figma_url : (s.review_url || "") + "#print-files");
        out.push({ kind: "signage", text: "approve signage", href: href, ext: !!(s.print_url || figma) });
      }
      else if ((m = low.match(/(\\d+)\\s+link decision/))) out.push({ kind: "links", text: "finish link review (" + m[1] + " held)", href: (s.review_url || "") + "#links" });
      else if (low.indexOf("link decision") !== -1) out.push({ kind: "links", text: "finish link review", href: (s.review_url || "") + "#links" });
      else if (low.indexOf("store details") !== -1) out.push({ kind: "store", text: "confirm store details" });
      else out.push({ kind: "other", text: String(n).replace("(s)", "s") });
    });
    return out.sort(function (a, b) { return RANK[a.kind] - RANK[b.kind]; });
  }
  function isDone(s) {
    var rs = s.review_status || {}, p = s.progress || {};
    return !!(s.done || s.status === "closed" || rs.status === "done" || p.stage === "done");
  }
  function claimed(s) {
    var ed = (s.progress && s.progress.editing) || s.editing, t = ed && Date.parse(ed.since);
    return !!(t && Date.now() - t < CLAIM_MS);
  }
  function progressText(s) {
    var p = s.progress || {};
    return "in progress: " + (p.stage || "working") + (p.next_step && p.stage !== "done" ? ", next " + p.next_step : "");
  }
  function whatsNext(s) {
    var o = owed(s), p = s.progress || {}, primary, rest = [];
    if (o.length) { primary = o[0]; rest = o.slice(1); }
    else if (claimed(s)) primary = { kind: "progress", text: progressText(s) };
    else if (isDone(s)) primary = { kind: "done", text: "done" };
    else if (p.stage && p.stage !== "done" && !p.blocked_on) primary = { kind: "progress", text: progressText(s) };
    else if (s.hold) primary = { kind: "hold", text: "hold: " + s.hold };
    else if (p.blocked_on) primary = { kind: "other", text: p.blocked_on };
    else if (s.review_status && s.review_status.waiting_on) primary = { kind: "progress", text: "waiting on " + s.review_status.waiting_on };
    else primary = { kind: "progress", text: s.steps ? "with the agents, nothing for you" : "not on the open-request list" };
    if (s.hold && primary.kind !== "hold") rest.push({ kind: "hold", text: "hold: " + s.hold });
    (s.gaps || []).forEach(function (g) { rest.push({ kind: "gap", text: g }); });
    return { primary: primary, rest: rest, owed: o, rank: o.length ? RANK[o[0].kind] : (s.hold && !isDone(s) ? 6 : 9) };
  }
  function clip(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + "\u2026" : t; }
  function chipLink(c, inner) { return c.href ? '<a href="' + esc(c.href) + '"' + (c.ext ? ' target="_blank" rel="noopener"' : "") + '>' + inner + '</a>' : inner; }
  function nextHtml(s) {
    var w = whatsNext(s), c = w.primary, cls = { progress: "prog-chip", done: "done-chip", hold: "hold" }[c.kind] || "need";
    var out = '<span class="' + cls + '" title="' + esc(c.text) + '">' + chipLink(c, esc(clip(c.text, 90))) + '</span>';
    w.rest.forEach(function (r) {
      out += '<span class="sec' + (RANK[r.kind] ? " owed" : "") + '" title="' + esc(r.text) + '">' + chipLink(r, esc(clip(r.text, 60))) + '</span>';
    });
    return '<div class="wn">' + out + '</div>';
  }
  function noteHtml(s) { return s.note ? '<details class="note-d"><summary>note</summary><div class="note">' + esc(s.note) + '</div></details>' : ""; }
  function stageLabel(st) { return st ? String(st).replace(/_/g, " ").replace(/^./, function (c) { return c.toUpperCase(); }) : ""; }
  function metaHtml(s) {
    var rs = s.review_status || {}, parts = [];
    if (rs.waiting_on && rs.status !== "done") parts.push("waiting on " + esc(rs.waiting_on));
    if (rs.ease) parts.push("ease " + esc(rs.ease) + "/5");
    return parts.join(" \\u00b7 ");
  }
  function progressHtml(s) {
    var p = s.progress;
    if (!p || !p.stage) return "";
    var out = '<span class="pstage" title="pipeline stage">' + esc(p.stage) + '</span>';
    if (p.next_step && p.stage !== "done") out += '<span class="pnext"> next: ' + esc(p.next_step) + '</span>';
    if (p.blocked_on) out += '<span class="need" title="what Travisse owes">' + esc(p.blocked_on) + '</span>';
    var who = [p.by, p.host ? "on " + p.host : "", p.updated_at ? fmtTime(p.updated_at) : ""].filter(Boolean).join(" ");
    if (who) out += '<span class="pwho" title="last stamped by">' + esc(who) + '</span>';
    return out;
  }
  function strip(el, s, live) {
    if (!el) return;
    // Same derivation and chips as the index's "What's next" column (2026-10-21); the note sits behind a toggle.
    var p = s.progress || {}, who = [p.by, p.host ? "on " + p.host : "", p.updated_at ? fmtTime(p.updated_at) : ""].filter(Boolean).join(" ");
    el.innerHTML =
      '<div class="grp"><span class="lbl">What\\'s next</span>' + nextHtml(s) + '</div>' +
      (who ? '<span class="pwho" title="last stamped by">' + esc(who) + '</span>' : "") +
      (s.note ? '<div style="flex-basis:100%">' + noteHtml(s) + '</div>' : "") +
      '<span class="live' + (live ? "" : " off") + '">' + (live ? "live " + esc(live) : "as of the last site build") + '</span>';
  }
  function merge(s, it) {
    s.boostly_status = it.status || s.boostly_status; s.steps = it.steps || s.steps; s.needs_you = it.needs_you || s.needs_you;
    s.gaps = it.gaps || s.gaps; s.hold = it.hold == null ? s.hold : it.hold; s.done = it.done == null ? s.done : it.done;
    s.note = it.note == null ? s.note : it.note; s.review_status = it.review_status || s.review_status;
    if (it.progress && (!s.progress || String(it.progress.updated_at || "") >= String(s.progress.updated_at || ""))) s.progress = it.progress;
    if (it.figma_url && !s.figma_url) s.figma_url = it.figma_url;
    return s;
  }
  function overlay(url, cb) {
    if (!url || !window.fetch) { cb(null); return; }
    fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { cb(j && j.items ? j : null); })
      .catch(function () { cb(null); });
  }
  function overlayOne(url, cb) {
    if (!url || !window.fetch) { cb(null); return; }
    fetch(url + "?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).then(cb).catch(function () { cb(null); });
  }
  function fmtTime(iso) { var t = Date.parse(iso); return isNaN(t) ? "" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }).format(new Date(t)); }
  return { whatsNext: whatsNext, nextHtml: nextHtml, noteHtml: noteHtml, owed: owed, isDone: isDone, esc: esc, stepsHtml: stepsHtml, needsHtml: needsHtml, metaHtml: metaHtml, progressHtml: progressHtml, strip: strip, merge: merge, overlay: overlay, overlayOne: overlayOne, fmtTime: fmtTime, stageLabel: stageLabel };
})();
`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Status fields of one manifest entry, as embedded in its page and in the index.
export function statusFields(e) {
  return {
    slug: e.slug, status: e.status, status_label: e.status_label, boostly_status: e.boostly_status ?? null,
    steps: e.steps ?? null, needs_you: e.needs_you ?? null, gaps: e.gaps ?? null, hold: e.hold ?? null,
    done: e.done ?? null, note: e.note ?? null, review_status: e.review_status ?? null, progress: e.progress ?? null, figma_url: e.figma_url ?? null,
    review_url: e.review_url ?? null,
    // for the "What's next" chips: Fable's default letter and the Drive print folder
    rec: e.recommended_letter ?? null, print_url: e.print_handoff_url ?? null,
  };
}

// Sticky strip injected right after the canvas's TOC nav (the TOC is fixed on wide screens and
// sticky with a negative top margin on narrow ones, so the strip must follow it in the flow). Baked from the manifest entry, then
// overlaid with the live board when it can be fetched.
export function pageStrip(entry, liveUrl) {
  const data = JSON.stringify(statusFields(entry)).replace(/<\//g, "<\\/");
  return `<div class="site-status ss" id="site-status" data-slug="${esc(entry.slug)}"></div>
<script id="site-status-data" type="application/json">${data}</script>
<script>${STATUS_JS}
(function () {
  var el = document.getElementById("site-status"), s = JSON.parse(document.getElementById("site-status-data").textContent);
  window.BoostlyStatus.strip(el, s, null);
  window.BoostlyStatus.overlay(${JSON.stringify(liveUrl || "")}, function (j) {
    if (!j) return;
    var it = null; for (var i = 0; i < j.items.length; i++) if (j.items[i].run_dir === s.slug) it = j.items[i];
    if (it) window.BoostlyStatus.strip(el, window.BoostlyStatus.merge(s, it), window.BoostlyStatus.fmtTime(j.generated_at));
    else window.BoostlyStatus.strip(el, s, window.BoostlyStatus.fmtTime(j.generated_at) + " (not on the open list)");
  });
  // per-location progress file, stamped by run-progress.mjs from whichever machine ran the step
  var liveUrl = ${JSON.stringify(liveUrl || "")};
  if (liveUrl) window.BoostlyStatus.overlayOne(liveUrl.replace(/status\/checklist\.json$/, "status/" + s.slug + ".json"), function (p) {
    if (!p || !p.progress) return;
    var cur = s.progress;
    if (cur && String(cur.updated_at || "") > String(p.progress.updated_at || "")) return;
    s.progress = p.progress; if (p.review_status) s.review_status = p.review_status; if (p.editing !== undefined) s.editing = p.editing;
    window.BoostlyStatus.strip(el, s, "live " + window.BoostlyStatus.fmtTime(p.generated_at));
  });
})();
</script>`;
}
