// Renders public/index.html from the sites manifest (data/sites.json). The manifest is embedded
// in the page and a small inline script handles search, sort and the status filter.
//
// Since 2026-10-13 the index is also the status board (it replaced the Notion review queue and
// the Apple Note): each row shows the pipeline steps, what Travisse owes, the one-line note,
// waiting-on and ease. Those fields are baked from the manifest and overlaid on load from the
// live board JSON that review-checklist.py publishes to Blob every 5 minutes.

import { STATUS_CSS, STATUS_JS, statusFields } from "./status-ui.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderIndex(manifest) {
  const sites = manifest.sites.map((s) => ({
    ...statusFields(s),
    name: s.name, city: s.city, state: s.state,
    requested_at: s.requested_at, updated_at: s.updated_at,
    rec: s.recommended_letter, pick: s.picked_letter,
    review_url: s.review_url, print_url: s.print_handoff_url,
  }));
  const data = JSON.stringify(sites).replace(/<\//g, "<\\/");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Boostly In-Store Fulfillment Reviews</title>
<style>
  :root { --bg: #f6f6f4; --card: #fff; --ink: #161616; --ink-2: #5c5c5c; --line: #e3e3df; --accent: #1f5eff; --accent-ink: #fff; --ok: #1b7a3d; --warn: #b26a00; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  main { max-width: 1280px; margin: 0 auto; padding: 40px 16px 80px; }
  header { margin-bottom: 20px; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
  header p { margin: 0; color: var(--ink-2); max-width: 80ch; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 14px 0 0; font-size: 14px; color: var(--ink-2); }
  .summary b { color: var(--ink); font-size: 16px; }
  .summary .live { color: var(--ink-2); }
  .summary .live.off { color: var(--warn); }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 18px 0 14px; }
  .controls input[type=search] { flex: 1 1 260px; min-width: 200px; font: inherit; padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); }
  .controls input[type=search]:focus, .controls select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  .controls select { font: inherit; padding: 9px 32px 9px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c5c5c'/%3E%3C/svg%3E") no-repeat right 12px center; color: var(--ink); -webkit-appearance: none; appearance: none; }
  .controls label { font-size: 12px; color: var(--ink-2); text-transform: uppercase; letter-spacing: .05em; display: flex; flex-direction: column; gap: 4px; }
  .count { color: var(--ink-2); font-size: 13px; margin: 0 0 10px; }
  .count b { color: var(--ink); }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  thead th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-2); font-weight: 600; padding: 12px 14px; border-bottom: 1px solid var(--line); background: #fafaf8; white-space: nowrap; }
  thead th.sortable { cursor: pointer; user-select: none; }
  thead th.sortable:hover { color: var(--ink); }
  thead th.sorted::after { content: " \\2193"; color: var(--accent); }
  td { padding: 13px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  tr.needs td { background: #fffdf7; }
  .name { font-weight: 600; color: var(--ink); text-decoration: none; }
  .name:hover { color: var(--accent); text-decoration: underline; }
  .place { color: var(--ink-2); font-size: 13px; margin-top: 2px; }
  .date { white-space: nowrap; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .date .lbl { display: none; }
  .letters { white-space: nowrap; }
  .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-2); margin: 0 6px 0 0; }
  .lbl + .letter, .lbl + .muted { margin-right: 14px; }
  .letter { display: inline-block; min-width: 26px; text-align: center; font-weight: 700; font-size: 13px; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--line); background: #fafaf8; }
  .letter.pick { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .muted { color: #b5b5b0; }
  .links { white-space: nowrap; text-align: right; }
  .btn { display: inline-block; font-size: 13px; font-weight: 600; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line); color: var(--ink); text-decoration: none; margin-left: 6px; background: var(--card); }
  .btn:hover { border-color: #c9c9c4; background: #fafaf8; }
  .btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .btn.primary:hover { background: #164ad0; }
  .st .stage { display: block; margin-top: 4px; }
  .st .meta { display: block; margin-top: 4px; }
  .prog .next { display: block; margin-top: 3px; }
  .empty { padding: 40px 14px; text-align: center; color: var(--ink-2); }
  footer { margin-top: 20px; color: var(--ink-2); font-size: 12px; }
  ${STATUS_CSS}
  @media (max-width: 860px) {
    main { padding-top: 24px; }
    .controls label { flex: 1 1 45%; }
    table, thead, tbody, tr, td { display: block; }
    thead { display: none; }
    tr { padding: 12px 14px; border-bottom: 1px solid var(--line); }
    td { padding: 3px 0; border: 0; }
    .date { display: inline-block; margin-right: 14px; font-size: 13px; }
    .date .lbl { display: inline; }
    .links { text-align: left; margin-top: 6px; white-space: normal; }
    .btn { margin: 4px 6px 0 0; }
  }
</style>
</head>
<body class="ss">
<main>
  <header>
    <h1>Boostly In-Store Fulfillment Reviews</h1>
    <p>Branding review pages and the status board for Tap Card, sticker, and signage orders. Each page shows the evidence, the variant sheet, the recommended and picked cells, and the signage previews for one location. Rows marked "Needs you" wait on a decision.</p>
    <div class="summary" id="summary"></div>
  </header>
  <div class="controls">
    <input type="search" id="q" placeholder="Search by location, city, state, or note" autocomplete="off" aria-label="Search locations">
    <label>Show
      <select id="status">
        <option value="">All locations</option>
        <option value="needs">Needs a decision</option>
        <option value="open">Open (not closed out)</option>
        <option value="awaiting">Awaiting pick</option>
        <option value="picked">Pick recorded</option>
        <option value="inherits">Inherits branding (pending)</option>
        <option value="applied">Branding applied</option>
        <option value="closed">Closed out</option>
      </select>
    </label>
    <label>Sort by
      <select id="sort">
        <option value="needs">Needs you first, then last updated</option>
        <option value="updated">Last updated, newest first</option>
        <option value="updated_asc">Last updated, oldest first</option>
        <option value="requested">Request date, newest first</option>
        <option value="requested_asc">Request date, oldest first</option>
        <option value="ease">Ease, easiest first</option>
        <option value="name">Location name, A to Z</option>
      </select>
    </label>
  </div>
  <p class="count" id="count"></p>
  <table>
    <thead><tr><th class="sortable" data-sort="name">Location</th><th class="sortable" data-sort="requested">Requested</th><th class="sortable" data-sort="updated">Updated</th><th>Status</th><th>Progress</th><th>Needs you</th><th>Variant</th><th></th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <footer>Built ${esc(fmtDate(manifest.generated_at))}. "Rec" is the default cell the pipeline recommended; "Pick" is the cell chosen for production. Progress is the pipeline checklist for the location (hover a square for the step). The board refreshes from the open-request list every 5 minutes; a location leaves the open list once it reaches physical fulfillment. Figma opens the generated production sheets; Print files opens the vendor hand-off folder.</footer>
</main>
<script id="sites" type="application/json">${data}</script>
<script>${STATUS_JS}</script>
<script>
(function () {
  var S = window.BoostlyStatus, esc = S.esc;
  var sites = JSON.parse(document.getElementById("sites").textContent);
  var LIVE_URL = ${JSON.stringify(manifest.live_status_url || "")};
  var q = document.getElementById("q"), statusSel = document.getElementById("status"), sortSel = document.getElementById("sort");
  var rows = document.getElementById("rows"), count = document.getElementById("count"), summary = document.getElementById("summary");
  var fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Denver" });
  var liveLabel = null;
  function parse(iso) { if (!iso) return 0; var t = Date.parse(/Z$|[+-]\\d\\d:\\d\\d$/.test(iso) ? iso : iso + "Z"); return isNaN(t) ? 0 : t; }
  function fdate(iso) { var t = parse(iso); return t ? fmt.format(new Date(t)) : ""; }
  function letter(l, kind) { return l ? '<span class="letter ' + kind + '">' + esc(l) + '</span>' : '<span class="muted">&ndash;</span>'; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); }
  function needs(s) { return !!((s.needs_you && s.needs_you.length) || s.hold) && !s.done; }
  function prep() {
    sites.forEach(function (s) {
      s._hay = norm([s.name, s.city, s.state, s.slug, s.note, (s.needs_you || []).join(" "), (s.review_status || {}).waiting_on].join(" "));
      s._req = parse(s.requested_at); s._upd = parse(s.updated_at); s._needs = needs(s);
      s._ease = (s.review_status && s.review_status.ease) || 99;
    });
  }
  var sorters = {
    needs: function (a, b) { return (b._needs - a._needs) || (b._upd - a._upd); },
    updated: function (a, b) { return b._upd - a._upd; },
    updated_asc: function (a, b) { return a._upd - b._upd; },
    requested: function (a, b) { return b._req - a._req; },
    requested_asc: function (a, b) { return a._req - b._req; },
    ease: function (a, b) { return (a._ease - b._ease) || (b._upd - a._upd); },
    name: function (a, b) { return a.name.localeCompare(b.name); }
  };
  function row(s) {
    var place = [s.city, s.state].filter(Boolean).join(", ");
    var stage = S.stageLabel(s.boostly_status), meta = S.metaHtml(s);
    var links = '<a class="btn primary" href="' + esc(s.review_url) + '">Review page</a>'
      + (s.figma_url ? '<a class="btn" href="' + esc(s.figma_url) + '" target="_blank" rel="noopener">Figma</a>' : "")
      + (s.print_url ? '<a class="btn" href="' + esc(s.print_url) + '" target="_blank" rel="noopener">Print files</a>' : "");
    return '<tr class="' + (s._needs ? "needs" : "") + '">'
      + '<td class="loc"><a href="' + esc(s.review_url) + '" class="name">' + esc(s.name) + '</a><div class="place">' + esc(place) + '</div>' + (s.note ? '<div class="note">' + esc(s.note) + '</div>' : "") + '</td>'
      + '<td class="date"><span class="lbl">Requested</span>' + esc(fdate(s.requested_at)) + '</td>'
      + '<td class="date"><span class="lbl">Updated</span>' + esc(fdate(s.updated_at)) + '</td>'
      + '<td class="st"><span class="pill ' + esc(s.status) + '">' + esc(s.status_label) + '</span>' + (stage ? '<span class="stage">' + esc(stage) + '</span>' : "") + (meta ? '<span class="meta">' + meta + '</span>' : "") + '</td>'
      + '<td class="prog">' + (s.steps ? S.stepsHtml(s.steps) : '<span class="muted">&ndash;</span>') + '</td>'
      + '<td class="needs-cell">' + S.needsHtml(s) + '</td>'
      + '<td class="letters"><span class="lbl">Rec</span>' + letter(s.rec, "rec") + '<span class="lbl">Pick</span>' + letter(s.pick, "pick") + '</td>'
      + '<td class="links">' + links + '</td></tr>';
  }
  function has(s, key) { return (s.needs_you || []).some(function (n) { return n.indexOf(key) !== -1; }) && !s.done; }
  function renderSummary() {
    var picks = sites.filter(function (s) { return has(s, "pick a letter"); }).length;
    var figs = sites.filter(function (s) { return has(s, "approve the Figma"); }).length;
    var links = sites.filter(function (s) { return has(s, "link decision"); }).length;
    var store = sites.filter(function (s) { return has(s, "store details"); }).length;
    var open = sites.filter(function (s) { return s.status !== "closed"; }).length;
    summary.innerHTML = '<span><b>' + picks + '</b> picks</span><span><b>' + figs + '</b> Figma approvals</span><span><b>' + links + '</b> link decisions</span><span><b>' + store + '</b> store details</span><span><b>' + open + '</b> open</span>'
      + '<span class="live' + (liveLabel ? "" : " off") + '">' + (liveLabel ? "live " + esc(liveLabel) : "status as of the last site build") + '</span>';
  }
  function render() {
    var terms = norm(q.value).split(/\\s+/).filter(Boolean), st = statusSel.value, sort = sortSel.value;
    var list = sites.filter(function (s) {
      if (st === "needs") { if (!s._needs) return false; }
      else if (st === "open") { if (s.status === "closed") return false; }
      else if (st && s.status !== st) return false;
      return terms.every(function (t) { return s._hay.indexOf(t) !== -1; });
    }).sort(sorters[sort] || sorters.needs);
    rows.innerHTML = list.length ? list.map(row).join("") : '<tr><td class="empty" colspan="8">No locations match.</td></tr>';
    count.innerHTML = "<b>" + list.length + "</b> of " + sites.length + " locations";
    Array.prototype.forEach.call(document.querySelectorAll("th.sortable"), function (th) { th.classList.toggle("sorted", sort.replace(/_asc$/, "") === th.dataset.sort); });
    renderSummary();
  }
  prep();
  q.addEventListener("input", render); statusSel.addEventListener("change", render); sortSel.addEventListener("change", render);
  Array.prototype.forEach.call(document.querySelectorAll("th.sortable"), function (th) {
    th.addEventListener("click", function () { var k = th.dataset.sort; sortSel.value = (sortSel.value === k && k !== "name") ? k + "_asc" : k; render(); });
  });
  render();
  S.overlay(LIVE_URL, function (j) {
    if (!j) return;
    var bySlug = {}; j.items.forEach(function (it) { if (it.run_dir) bySlug[it.run_dir] = it; });
    sites.forEach(function (s) { if (bySlug[s.slug]) S.merge(s, bySlug[s.slug]); });
    liveLabel = S.fmtTime(j.generated_at) + (j.stale ? " (stale: live request query failed)" : "");
    prep(); render();
  });
})();
</script>
</body>
</html>
`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Denver" });
}
