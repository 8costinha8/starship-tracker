/* Vehicle journey memory: ONE engine for every vehicle (ships and boosters alike, e.g. S42 and B22).
   Per-vehicle state lives in road.json under road.journeys[V]:
     { location: "Megabay 1" | "Megabay 2" | "Massey's" | "cryo stand" | "pad" | "static fire stand" | null,
       open_test: "cryo" | "static" | null, next_test: "cryo" | "static" | "launch" | null,
       last_test: { test, at } | null, engines: bool, stacked: bool, done: { cryo, static }, pending: [line ids], likely: { test, id } | null, at }
   Routing (route/step), all phrase lists in data/phrases.json:
     - ambiguous move ("S42 leaves Megabay 2 for Massey's") → that vehicle's Pad card, marked likely, until a test is
       evidenced; then the pending likely lines move into the test card.
     - "returned to Megabay" / "lifted onto stand" follow the open or just-finished test; with no test → Pad card.
     - raw observations are rewritten to what they imply, marked likely ("Frost on both tanks: Ship 42 likely in another
       cryo test."); a confirming post rewrites THAT line ("Ship 42 completed another cryo test.") and swaps its link.
     - frost: Massey's / cryo or test stand → cryo; stacked on the pad (WDR, rehearsal) → Pad, never cryo; static fire
       stand (or a booster alone on the launch mount) with engines fitted → static fire prep.
     - strict vehicle match: a post naming only another vehicle, the other vehicle type, or another flight's hardware → null.
   Pure functions; nothing here sends anything. */
const fs = require("fs"), path = require("path");
const PHRASES = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "phrases.json"), "utf8"));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (list) => new RegExp(`(?:^|[^a-z0-9])(?:${list.map((p) => esc(p.toLowerCase())).sort((a, b) => b.length - a.length).join("|")})(?![a-z0-9])`, "i");
const R = Object.fromEntries(Object.entries(PHRASES).filter(([k, v]) => Array.isArray(v)).map(([k, v]) => [k, rx(v)]));
const LOCS = Object.entries(PHRASES.locations).map(([name, list]) => [name, list]);
const HEDGED_DONE = /\b(?:appears?|seems?|looks? like|likely|probably|possibly|apparently|may|might|could|should)\b(?:\s+\w+){0,4}?\s+(?:completed?|finished|done)\b/i;
const vehOf = (t) => { const o = new Set(); for (const m of String(t || "").matchAll(/\b(?:(B|S)(\d{2,3})|(Booster|Ship)\s+(\d{2,3}))\b/gi)) o.add(((m[1] || m[3])[0]).toUpperCase() + (m[2] || m[4])); return [...o]; };
const nameOf = (v) => (/^S/.test(v) ? `Ship ${v.slice(1)}` : `Booster ${v.slice(1)}`);
const LABEL = { cryo: "cryo test", static: "static fire", launch: "launch campaign" };
const JUST_MS = 4 * 864e5; // a test finished within 4 days is "just finished"

function blank() { return { location: null, open_test: null, next_test: "cryo", last_test: null, engines: false, stacked: false, done: { cryo: 0, static: 0 }, pending: [], likely: null, at: null }; }

// Locations named in the text, in order: [{ name, i }]. "Megabay 2" beats "Megabay"; Massey's beats the generic list.
function locations(text) {
  const t = String(text || "").toLowerCase(), out = [];
  for (const [name, list] of LOCS) for (const p of list) { let i = -1; const re = new RegExp(`(?:^|[^a-z0-9])${esc(p)}(?![a-z0-9])`, "g"); let m; while ((m = re.exec(t))) { i = m.index; if (!out.some((o) => Math.abs(o.i - i) < 4 || (o.i <= i + 1 && o.end >= i + p.length))) out.push({ name, i: i + (m[0].length - p.length), end: i + m[0].length }); } }
  return out.sort((a, b) => a.i - b.i);
}
function signals(text) {
  const t = String(text || "").replace(/https?:\/\/\S+/g, " ");
  const s = Object.fromEntries(Object.keys(R).map((k) => [k, R[k].test(t)]));
  const locs = locations(t);
  // from/destination: "leaves|left|departs|from X" = from; the last other place = destination
  let from = null, dest = null;
  for (const l of locs) { const before = t.toLowerCase().slice(Math.max(0, l.i - 22), l.i); if (/(?:leaves|left|leaving|departs|departed|departing|from|out of)\s+(?:the\s+)?$/.test(before)) from = from || l.name; else dest = l.name; }
  s.from = from; s.dest = dest; s.locs = locs.map((l) => l.name);
  s.hedged = s.hedge || HEDGED_DONE.test(t);
  s.doneReal = s.done && !s.hedged;
  return s;
}
// Which test a post evidences (not just a move): "cryo" | "static" | null, using place + state for frost.
function frostContext(st, s) {
  const here = s.dest || (s.locs.includes("cryo stand") ? "cryo stand" : null) || st.location;
  if (s.wdr || s.stacked || st.stacked) return "wdr";                     // stacked on the pad: WDR / rehearsal → Pad card, never cryo
  if (here === "static fire stand" && st.engines) return "static";
  if (here === "pad" && st.engines) return "static";                       // a vehicle alone on the launch mount with engines = static fire stand
  if (here === "pad") return "pad";
  if (st.open_test === "static" && st.engines) return "static";
  if (here === "Massey's" || here === "cryo stand") return "cryo";
  return st.open_test || null;
}
function evidence(st, s) {
  if (s.static) return "static";
  if (s.cryo) return "cryo";
  if (s.frost || s.load) return frostContext(st, s);
  if (s.stand && s.locs.includes("cryo stand")) return "cryo";
  return null;
}
const isTracked = (road, v) => (road.vehicles || []).map((x) => String(x).toUpperCase()).includes(v);
// Strict vehicle match: the post must be about hw (or name no vehicle at all), never another flight's or type's hardware.
function strictMatch(road, text, hw) {
  const vs = vehOf(text);
  if (!vs.length) return true;
  if (!vs.includes(hw)) return false;
  return true;
}
// A post naming several vehicles: only the clauses about v (and the unnamed clauses right after them) are about v.
function clauseFor(text, v) {
  const t = String(text || ""); if (vehOf(t).length < 2) return t;
  const parts = t.split(/(?<=[.;!?])\s+|;\s*|,\s*(?:and\s+)?(?=(?:Ship|Booster|[BS])\s?\d)|\s+and\s+(?=(?:Ship|Booster|[BS])\s?\d)/i);
  const keep = []; let on = false;
  for (const p of parts) { const pv = vehOf(p); if (pv.length) on = pv.includes(v); if (on) keep.push(p.trim()); }
  return keep.join(" ") || t;
}
function plainWords(st, s, v, test, kind) {
  const n = nameOf(v), again = test && st.done[test] > 0 ? "another" : "a";
  const what = /\bboth\b/i.test(s._t) ? "both tanks" : /\blox\b/i.test(s._t) ? "the LOX tank" : /\bch4|methane\b/i.test(s._t) ? "the methane tank" : "the tanks";
  if (kind === "frost") {
    if (test === "cryo") return `Frost on ${what}: ${n} likely in ${again} cryo test.`;
    if (test === "static") return `Frost on ${what}: ${n} likely preparing for a static fire.`;
    if (test === "wdr") return `Frost on the stack: ${n} likely in a launch rehearsal (WDR).`;
    if (test === "pad") return `Frost on ${what}: ${n} likely in propellant loading on the pad.`;
  }
  if (kind === "done") return test === "cryo" ? `${n} completed ${again} cryo test.` : `${n} completed ${st.done.static > 0 ? "another" : "its"} static fire.`;
  return null;
}
/* One post through the engine. Returns { card, likely, text, confirms, moveToTest, state } — `state` is the NEW state.
   card ∈ cryo | static | raptor | pad | null (null = not this vehicle / another flight: never shown). */
function step(st0, text0, { v, at = null, id = null, road = null } = {}) {
  const st = JSON.parse(JSON.stringify(st0 || blank()));
  if (road && !strictMatch(road, text0, v)) return { card: null, state: st0 || blank(), why: "other vehicle" };
  const text = clauseFor(text0, v);
  const s = signals(text); s._t = String(text || "");
  const t = Date.parse(at) || 0;
  if (s.engines_in) st.engines = true;
  if (s.engines_out && s.raptor) st.engines = false;
  if (s.stacked) st.stacked = true;
  const just = st.last_test && (!t || t - (Date.parse(st.last_test.at) || 0) <= JUST_MS) ? st.last_test.test : null; // unknown post time: the latest test
  let ev = evidence(st, s), card = null, likely = false, out = null, confirms = null, moveToTest = null;
  const moved = s.rollout || s.return;
  const afterTest = /\bafter\b[^.]*?\b(cryo|static[- ]?fire)/i.exec(text);
  if (s.pad_work && !s.static && !s.cryo) { ev = null; card = "pad"; }
  else if (s.return && afterTest) {                                        // "returned to Megabay 2 after static fire": follows that test, closes it
    card = /cryo/i.test(afterTest[1]) ? "cryo" : "static"; ev = null; st.open_test = null; st.pending = [];
  } else if (ev === "wdr" || ev === "pad") { card = "pad"; likely = !s.doneReal; if (s.frost) { out = plainWords(st, s, v, ev, "frost"); st.likely = { test: ev, id }; } ev = null; }
  else if (ev) {
    card = ev;
    const frostOnly = (s.frost || s.load) && !s.doneReal && !/\b(fired|static fire (?:test )?(?:complete|done))/i.test(text);
    if (s.doneReal && !frostOnly) {                                         // a completed test: it confirms the open likely line (same line, new link)
      if (st.likely && st.likely.test === ev) { confirms = st.likely.id; out = plainWords(st, s, v, ev, "done"); }
      st.done[ev] = (st.done[ev] || 0) + 1; st.last_test = { test: ev, at: at || st.at }; st.open_test = null; st.likely = null;
    } else {
      if (s.frost) { out = plainWords(st, s, v, ev, "frost"); likely = true; st.likely = { test: ev, id }; }
      st.open_test = ev;
    }
    if (st.pending.length) { moveToTest = { ids: st.pending.slice(), to: ev }; st.pending = []; }
  } else if (s.raptor && !s.cryo && !s.static) card = "raptor";            // engine work (incl. "returned to Megabay 1 for its engines")
  else if (s.return || (s.stand && !s.rollout) || (s.at_place && s.locs.length && !s.rollout)) {  // follows the open / just-finished test, else Pad
    const f = st.open_test || just;
    card = f || "pad";
    if (/mega ?bay|production|build site|the bay/i.test(text)) { st.open_test = null; st.pending = []; }
  } else if (moved && s.locs.length) {                                     // ambiguous move: Pad card, likely, until a test is evidenced
    card = "pad"; likely = true; if (id) st.pending.push(id);
  } else return { card: null, why: "no journey signal", state: st };   // no opinion: the caller keeps its own filing
  // location memory
  const dest = s.dest || (s.return && /mega ?bay|production|build site/i.test(text) ? (s.locs.find((l) => /Megabay/.test(l)) || "Megabay") : null);
  if (dest) st.location = dest === "Massey's" && (ev === "static" || st.open_test === "static") ? "static fire stand" : dest;
  else if (s.stand && s.locs.includes("cryo stand")) st.location = "cryo stand";
  if (ev === "static" && st.location === "Massey's") st.location = "static fire stand";
  if (ev === "static") st.engines = true;                                  // a static fire needs engines fitted
  if (s.return && /mega ?bay|production|build site/i.test(text)) st.stacked = false;
  st.next_test = !st.done.cryo ? "cryo" : !st.done.static ? "static" : "launch";
  if (st.open_test) st.next_test = st.open_test;
  st.at = at || st.at;
  return { card, likely, text: out, confirms, moveToTest, state: st, evidence: ev };
}
// Live use: route a post for hw against the saved state (does not save). Returns the step result.
function route(road, text, hw, opts = {}) { const v = String(hw || "").toUpperCase(); const st = (road.journeys && road.journeys[v]) || blank(); return step(st, text, { ...opts, v, road }); }
// Live use: route + save the new state into road.journeys[hw]. Returns the step result.
function observe(road, text, hw, opts = {}) {
  const v = String(hw || "").toUpperCase(); if (!isTracked(road, v)) return null;
  const r = route(road, text, v, opts); if (r.card === null && r.why) return r;
  road.journeys = road.journeys || {}; road.journeys[v] = r.state; return r;
}
// A confirming post rewrites the SAME likely line (text + link) wherever it sits (entry or Earlier update row).
function confirmLine(road, lineId, text, url, src) {
  for (const c of road.categories || []) for (const h of c.history || []) {
    if (h.id === lineId) { Object.assign(h, { text, x_text: text, url, ...(src ? { src } : {}) }); delete h.likely; return { box: c.id, entry: h }; }
    for (const u of h.updates || []) if (u.id === lineId || u.url === lineId) { Object.assign(u, { text, url, ...(src ? { src } : {}) }); delete u.likely; return { box: c.id, entry: h }; }
  }
  return null;
}
// Pending likely move lines (filed to Pad) → the test card, once the test is evidenced.
function moveLines(road, ids, to) {
  const moved = [], dst = (road.categories || []).find((c) => c.id === to); if (!dst) return moved;
  for (const c of road.categories || []) { if (c.id === to) continue; const keep = [];
    for (const h of c.history || []) if (ids.includes(h.id)) { delete h.likely; h.stage = to; h.journey_pin = true; dst.history.unshift(h); moved.push({ id: h.id, from: c.id, to }); } else keep.push(h);
    c.history = keep; }
  return moved;
}
module.exports = { clauseFor, PHRASES, blank, signals, locations, evidence, frostContext, step, route, observe, confirmLine, moveLines, strictMatch, vehOf, nameOf, LABEL };
