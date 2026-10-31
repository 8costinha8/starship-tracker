/* Offline replay of the tracked vehicles' history through scripts/journey.js. Reads road.json, writes NOTHING unless
   --save-state (then only road.journeys). No network, no pushes: nothing here can send.
   node scripts/journey-replay.js [--json] [--save-state] */
const fs = require("fs"), path = require("path"), J = require("./journey.js");
const ROOT = path.join(__dirname, "..");
const CATS = ["cryo", "raptor", "static", "pad"];
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const fromLabel = (d, year = 2026) => { const m = String(d || "").match(/(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+([A-Z][a-z]{2})/); return m ? new Date(Date.UTC(year, MON[m[2]], +m[1], 12)).toISOString() : null; };
const vehOfEntry = (road, h) => { const tv = J.vehOf(h.text).filter((v) => (road.vehicles || []).includes(v)); if (tv.length) return tv; if (J.vehOf(h.text).length) return []; const hw = String(h.hardware || "").toUpperCase(); return (road.vehicles || []).includes(hw) ? [hw] : []; };
const mine = (road, h) => !(Number.isInteger(h.flight) && h.flight !== road.flight);
// every post of vehicle v on the tracked flight: entries + their Earlier update rows, oldest first
function posts(road, v) {
  const out = [];
  for (const c of road.categories || []) if (CATS.includes(c.id)) for (const h of c.history || []) {
    if (!mine(road, h)) continue;
    const hv = vehOfEntry(road, h);
    if (hv.includes(v)) out.push({ id: h.id || `${c.id}:${h.text}`, kind: "entry", from: c.id, text: h.text, date: h.date, at: (h.x_post && h.x_post.created_at) || h.at || fromLabel(h.date), url: h.url || (h.x_post && h.x_post.url) || null, ref: h });
    (h.updates || []).forEach((u, i) => { const uv = J.vehOf(u.text); if (uv.length ? uv.includes(v) : hv.includes(v)) out.push({ id: `${h.id || c.id}#${i}`, kind: "update", from: c.id, text: u.text, date: u.date, at: u.at || fromLabel(u.date), url: u.url || null, ref: u }); });
  }
  return out.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
}
function replay(road, v) {
  let st = J.blank(); const lines = new Map(), rows = [];
  for (const p of posts(road, v)) {
    const r = J.step(st, p.text, { v, at: p.at, id: p.id, road }); st = r.state;
    const line = { ...p, to: r.card === null && r.why !== "other vehicle" ? p.from : r.card, likely: r.likely, text_after: r.text || p.text, done: r.evidence && r.card === r.evidence && J.signals(p.text).doneReal };
    if (r.moveToTest) for (const id of r.moveToTest.ids) { const l = lines.get(id); if (l) { l.to = r.moveToTest.to; l.moved_by = p.id; } }
    if (r.confirms) { const l = lines.get(r.confirms); if (l) { l.text_after = r.text || p.text; l.url_after = p.url; l.likely = false; l.done = true; l.confirmed_by = p.id; line.folded = true; } }
    lines.set(p.id, line); rows.push(line);
  }
  // a trip that ended back in the bay with no test: its likely move lines stay Pad activity (no longer "likely")
  for (const l of rows) if (l.to === "pad" && l.likely && !st.pending.includes(l.id) && !/^Frost/.test(l.text_after)) l.likely = false;
  return { v, state: st, rows };
}
// The Road with the replayed filing applied (in memory): vehicle posts become one entry each in their routed card.
function applied(road, results) {
  const r = JSON.parse(JSON.stringify(road)), vs = results.map((x) => x.v);
  for (const c of r.categories) if (CATS.includes(c.id)) c.history = (c.history || []).filter((h) => !mine(r, h) || !vehOfEntry(r, h).some((v) => vs.includes(v)))
    .map((h) => ({ ...h, updates: (h.updates || []).filter((u) => !J.vehOf(u.text).some((v) => vs.includes(v))) }));
  for (const res of results) for (const l of res.rows) {
    if (!l.to || l.folded) continue;
    const c = r.categories.find((x) => x.id === l.to);
    c.history.push({ id: `j-${l.id}`, date: l.date, at: l.at, text: l.text_after + (l.likely ? "" : ""), likely: l.likely || undefined, url: l.url_after || l.url, hardware: res.v, flight: r.flight, trust: "trusted", ...(l.kind === "entry" && l.ref.media_override ? { media_override: l.ref.media_override } : {}), ...(l.done ? { complete: true, milestone: { phase: "completed" } } : {}) });
  }
  return r;
}
// app.js rtfCards, extracted exactly as test-earlier-scope does
function rtfCards() {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const line = (re) => app.match(re)[0], block = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
  const fnBody = (n) => app.slice(app.indexOf(`function ${n}(`), app.indexOf("\n}\n", app.indexOf(`function ${n}(`)) + 2);
  const src = [line(/const isRealEntry = [^\n]+/), fnBody("flightOf"), line(/const sfIso = [^\n]+/), line(/const isDoneCard = [^\n]+/), line(/const cardIso = [^\n]+\n[^\n]+/), line(/const logHw = [^\n]+/), line(/const urlOf = [^\n]+/), block("const RTF_PLACEHOLDER", "function rtfRows(")].join("\n");
  return eval(`(() => { const window = {}; const entryDate = (h) => h.date || ""; const isYouTube = (u) => /youtu\\.?be/i.test(String(u || "")); ${src}\n return rtfCards; })()`);
}
function card(road, cid, v) {
  const p = rtfCards()(road).find((x) => x.id === `rtf-${cid}-${v}`) || {}; const h = p.h;
  return h ? { main: (h.likely ? "(likely) " : "") + h.text, earlier: (h.updates || []).map((u) => `${u.date || ""} — ${u.text}`) } : { main: "(empty)", earlier: [] };
}
if (require.main === module) {
  const road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  const results = (road.vehicles || []).map((v) => replay(road, v));
  const after = applied(road, results);
  const rep = { moves: [], cards: {}, states: {} };
  for (const res of results) { rep.states[res.v] = res.state; for (const l of res.rows) if (l.to !== l.from || l.text_after !== l.text) rep.moves.push({ v: res.v, date: l.date, from: l.from, to: l.to, text: l.text, text_after: l.text_after !== l.text ? l.text_after : undefined, likely: l.likely || undefined, folded: l.folded || undefined }); }
  for (const v of road.vehicles) for (const cid of CATS) rep.cards[`${cid}-${v}`] = { before: card(road, cid, v), after: card(after, cid, v) };
  if (process.argv.includes("--save-state")) { const cur = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")); cur.journeys = rep.states; fs.writeFileSync(path.join(ROOT, "road.json"), JSON.stringify(cur, null, 2) + "\n"); }
  console.log(JSON.stringify(rep, null, 1));
}
module.exports = { posts, replay, applied, card, rtfCards };
