// Page 1 current Road boxes = condensed copy of Page 2 (Bernardo's rule, every flight), and mission_alerts after a
// handover. No network, no pushes, nothing written: node tests/test-road-parity.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
// pull app.js top-level declarations by name (+ their dependencies), the same way scripts/render-check.js does
const WANT = ["roadBoxEntries", "roadBoxLatest", "rtfRows", "cardDate", "roadMediaOf", "parityEarlier", "scrub", "pillParts", "RTF_PLACEHOLDER", "upIso", "ukStamp", "feedTime", "fmtDay", "cardT", "roadUpdates", "entryDate"];
const EXTRA = new Set();
function load() {
  const lines = src.split("\n"), starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); if (m) starts.push({ name: m[1], i }); });
  const decl = (name) => { const k = starts.findIndex((s) => s.name === name); if (k < 0) return null; let end = lines.length;
    for (let j = starts[k].i + 1; j < lines.length; j++) if (/^\S/.test(lines[j]) && !/^[}\])]/.test(lines[j])) { end = j; break; } return lines.slice(starts[k].i, end).join("\n"); };
  const have = new Set(), parts = []; const add = (n) => { if (have.has(n)) return true; const d = decl(n); if (!d) return false; have.add(n); parts.unshift(d); return true; };
  WANT.forEach(add); [...EXTRA].forEach(add);
  const window = { RoadPick: require(path.join(ROOT, "scripts/road-pick.js")), addEventListener() {}, dispatchEvent() {} }, React = { createElement() { return null; } }, document = {}, localStorage = { getItem() { return null; }, removeItem() {} };
  for (let t = 0; t < 400; t++) {
    try { return new Function("window", "React", "document", "localStorage", `${parts.join("\n")}\nreturn { ${WANT.join(", ")} };`)(window, React, document, localStorage); }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/) || String(e.message).match(/Cannot access '(\w+)' before initialization/); if (!m) throw e;
      if (/before initialization/.test(e.message)) { const i = parts.findIndex((p) => new RegExp(`^(?:const|let|function)\\s+${m[1]}\\b`).test(p)); const [p] = parts.splice(i, 1); parts.unshift(p); continue; }
      if (!add(m[1])) throw new Error("no top-level " + m[1]); }
  }
}
let A; for (let t = 0; t < 200; t++) { try { A = load(); const r0 = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")); A.roadBoxEntries(r0, A.rtfRows(r0).rows); break; }
  catch (e) { const m = String(e.message).match(/^(\w+) is not defined/); if (!m || EXTRA.has(m[1])) throw e; EXTRA.add(m[1]); } }
// What Page 2 shows for the current flight (UpdatesFeed → FeedPost): card text, cardDate, picture (roadMediaOf)
function page2(road) {
  const out = []; let cur = false;
  for (const r of A.rtfRows(road).rows) { if (r.section) { cur = r.section.n === road.flight; continue; } if (!cur || !r.post) continue;
    const p = r.post, h = p.h, mo = A.roadMediaOf(h, p.cat);
    out.push({ id: p.id, box: p.cat.id, text: A.scrub(h.card_text || h.x_text || h.text), date: A.cardDate(h), image: mo && mo.image && mo.image !== A.RTF_PLACEHOLDER ? mo.image : null }); }
  return out;
}
const base = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const roads = { [`live road.json (Flight ${base.flight})`]: base };
// another flight: the same data shifted to Flight 17 with its own hardware (rule is by data, never by flight number)
{ const r = JSON.parse(JSON.stringify(base).replace(/\b(Ship|S)(\s?)43\b/g, "$1$244").replace(/\b(Booster|B)(\s?)23\b/g, "$1$224")); r.flight = 17; r.vehicles = ["B24", "S44"]; r.hardware_flights = { B24: 17, S44: 17 };
  for (const c of r.categories) for (const h of c.history || []) if (h.flight === 16) h.flight = 17; for (const f of r.feed_items || []) if (f.flight === 16) f.flight = 17; roads["shifted to Flight 17"] = r; }
for (const [label, road] of Object.entries(roads)) {
  const p1 = A.roadBoxEntries(road, A.rtfRows(road).rows), p2 = page2(road);
  const boxes = Object.keys(p1);
  const p2InBoxes = p2.filter((e) => boxes.includes(e.box));
  const flat = boxes.flatMap((b) => p1[b].map((e) => ({ ...e, box: b })));
  check(flat.length > 0, `${label}: Page 1 boxes have entries (${flat.length})`);
  check(JSON.stringify(flat.map((e) => e.id)) === JSON.stringify(boxes.flatMap((b) => p2InBoxes.filter((e) => e.box === b).map((e) => e.id))), `${label}: same entries (ids) per box as Page 2: ${flat.map((e) => e.id).join(", ")}`);
  for (const e of flat) { const q = p2.find((x) => x.id === e.id);
    check(q && q.text === e.text && q.date === e.date, `${label}: ${e.id} same text + date (${e.date} · ${e.text.slice(0, 50)})`);
    check(q && q.image === e.image, `${label}: ${e.id} same picture source (${e.image})`); }
  for (const b of boxes) { const l = A.roadBoxLatest(p1[b]); check(l == null || p1[b].some((e) => e.text === l), `${label}: ${b} box line is one of its Page 2 card texts`); }
}
// Page 1 RoadCard: no separate Flight Log text source left
{ const rc = src.slice(src.indexOf("function RoadCard("), src.indexOf("// One Page 2 card, condensed"));
  check(/roadBoxEntries\(road, road \? rtfRows\(road\)\.rows : \[\]\)/.test(rc), "RoadCard reads Page 2's entries (roadBoxEntries over rtfRows)");
  check(!/m\.flog\.latest|<FlogCard|boxLatest\(/.test(rc), "RoadCard no longer shows flightlog.js text (flog.latest / FlogCard / boxLatest)");
  check(/callout-icon[\s\S]*callout-name[\s\S]*callout-latest[\s\S]*pill\(m\)/.test(rc), "box layout kept: icon, title, summary under the title, status pill on the row"); }

// mission_alerts after the handover (scripts/check-road.js rolloverRoad + scripts/mission-alert.js rebuild)
(async () => {
  const CR = require(path.join(ROOT, "scripts/check-road.js")), MA = require(path.join(ROOT, "scripts/mission-alert.js"));
  const old = JSON.parse(JSON.stringify(base)); old.flight = 15; old.vehicles = ["B22", "S42"]; old.archive = { 14: base.archive["14"] };
  old.mission_alerts = { ...MA.emptyAlerts(15), liftoff_actual: "2026-11-13T22:47:36.000Z", liftoff_source: "ll2", dispatched: { deorbit_soon: "2026-11-14T20:18:00Z" } };
  const ro = CR.rolloverRoad(old, 15, "2026-11-13T22:47:36Z", () => {});
  const ma = ro.road.mission_alerts;
  check(ma && ma.flight === 16 && ma.liftoff_actual === null && Object.keys(ma.dispatched || {}).length === 0, "rollover: mission_alerts move to Flight 16, liftoff + dispatched cleared");
  check(ma && JSON.stringify(ma.events.map((e) => e.key)) === JSON.stringify(old.mission_alerts.events.map((e) => e.key)), "rollover: the alert template is kept");
  // the rebuild path (8f5f62d): no record on a Flight 16 Road while LL2 still lists Flight 15
  const road = { flight: 16 }; let wrote = null;
  await MA.syncFromChecker({ road, current: { n: 15, status: "done", date: "2026-11-13T22:47:36Z" }, prev: {}, now: Date.parse("2026-11-14T21:46:00Z"), writeRoad: (r) => { wrote = r; } });
  check(road.mission_alerts && road.mission_alerts.flight === 16 && road.mission_alerts.liftoff_actual === null, "rebuild after handover: a blank record for the Road's flight (16), never 'flight 15, no liftoff'");
  await MA.syncFromChecker({ road, current: { n: 15, status: "inflight", date: "2026-11-13T22:47:36Z" }, prev: {}, now: Date.parse("2026-11-14T21:50:00Z"), writeRoad: () => {} });
  check(road.mission_alerts.flight === 16 && road.mission_alerts.liftoff_actual === null, "LL2's old flight never writes its liftoff onto the new flight's record");
  const pre = { flight: 15 };
  await MA.syncFromChecker({ road: pre, current: { n: 15, status: "go" }, prev: {}, now: Date.now(), writeRoad: () => {} });
  check(pre.mission_alerts && pre.mission_alerts.flight === 15, "before the handover the record is still for LL2's current flight");
  check(base.mission_alerts && base.mission_alerts.flight === base.flight, `road.json: mission_alerts.flight (${base.mission_alerts && base.mission_alerts.flight}) = Road flight (${base.flight})`);
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
