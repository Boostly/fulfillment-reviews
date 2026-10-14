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
  .ss .pill.awaiting, .ss .pill.picked { background: #fff4e0; color: #b26a00; border-color: #f1dcb0; }
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
  .site-status { position: sticky; top: 8px; z-index: 20; background: #fffdf7; border: 1px solid #ecdfb8; border-radius: 10px; padding: 10px 14px; margin: 0 0 20px; display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .site-status .grp { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
  .site-status .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #5c5c5c; }
  .site-status .live { margin-left: auto; font-size: 12px; color: #5c5c5c; }
  .site-status .live.off { color: #b26a00; }
  @media (max-width: 1000px) { .site-status { position: static; } }
`;

// Client code. Exposes window.BoostlyStatus = { overlay(url, onItems), stepsHtml, needsHtml, strip }.
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
    (s.needs_you || []).forEach(function (n) { out += '<span class="need">' + esc(n.replace("(s)", "s")) + '</span>'; });
    (s.gaps || []).forEach(function (g) { out += '<span class="need soft">' + esc(g) + '</span>'; });
    if (s.hold) out += '<span class="hold" title="' + esc(s.hold) + '">HOLD</span>';
    if (!out && s.done) out += '<span class="need soft">review complete</span>';
    else if (!out && !s.steps) out += '<span class="need soft">' + (s.status === "closed" ? "closed out" : "not on the open-request list") + '</span>';
    else if (!out && s.status !== "closed") out += '<span class="need soft">with the agents, nothing for you</span>';
    return out;
  }
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
    var stage = stageLabel(s.boostly_status);
    el.innerHTML =
      '<div class="grp"><span class="pill ' + esc(s.status) + '">' + esc(s.status_label) + '</span>' + (stage ? '<span class="stage">' + esc(stage) + '</span>' : "") + '</div>' +
      '<div class="grp">' + stepsHtml(s.steps) + '</div>' +
      '<div class="grp"><span class="lbl">Needs you</span>' + needsHtml(s) + '</div>' +
      (metaHtml(s) ? '<div class="grp meta">' + metaHtml(s) + '</div>' : "") +
      (progressHtml(s) ? '<div class="grp prog">' + progressHtml(s) + '</div>' : "") +
      (s.note ? '<div class="note" style="flex-basis:100%">' + esc(s.note) + '</div>' : "") +
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
  return { esc: esc, stepsHtml: stepsHtml, needsHtml: needsHtml, metaHtml: metaHtml, progressHtml: progressHtml, strip: strip, merge: merge, overlay: overlay, overlayOne: overlayOne, fmtTime: fmtTime, stageLabel: stageLabel };
})();
`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Status fields of one manifest entry, as embedded in its page and in the index.
export function statusFields(e) {
  return {
    slug: e.slug, status: e.status, status_label: e.status_label, boostly_status: e.boostly_status ?? null,
    steps: e.steps ?? null, needs_you: e.needs_you ?? null, gaps: e.gaps ?? null, hold: e.hold ?? null,
    done: e.done ?? null, note: e.note ?? null, review_status: e.review_status ?? null, progress: e.progress ?? null, figma_url: e.figma_url ?? null,
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
    s.progress = p.progress; if (p.review_status) s.review_status = p.review_status;
    window.BoostlyStatus.strip(el, s, "live " + window.BoostlyStatus.fmtTime(p.generated_at));
  });
})();
</script>`;
}
