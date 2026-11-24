// Test-site trips over ALL the live data (road.json + data/vehicles.json): every flight on the Road (current flight and each
// upcoming flight from the fleet registry), every vehicle. Runs app.js's own rtfCards / fleetRoad (pulled out at run time,
// scripts/render-check.js appFns) with scripts/move-route.js, and checks:
//   no standalone move card — no card leads with a move that a test at that site brackets (it belongs to the test's card)
//   every move of such a trip is still on that test's card (a row, or merged into a row) — nothing is lost
//   trip cards read oldest first, and their headline is the test (not a move)
// Usage: node scripts/test-trip-live.js [tree]
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const SC = __dirname;
globalThis.RoadMoveRoute = globalThis.PadTrip = require(path.join(SC, "move-route.js")); // one rule module (routing + trips)
try { globalThis.RoadRules = require(path.join(SC, "road-rules.js")); } catch {}
const P = globalThis.PadTrip;
const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
// same loader as render-check.js, asking for the fleet functions too
function load(want) {
  const lines = src.split("\n"), starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); if (m) starts.push({ name: m[1], i }); });
  const decl = (name) => { const k = starts.findIndex((s) => s.name === name); if (k < 0) return null; let end = lines.length;
    for (let j = starts[k].i + 1; j < lines.length; j++) if (/^(?:\S)/.test(lines[j]) && !/^[}\])]/.test(lines[j])) { end = j; break; } return lines.slice(starts[k].i, end).join("\n"); };
  const have = new Set(), parts = []; const add = (n) => { if (have.has(n)) return true; const d = decl(n); if (!d) return false; have.add(n); parts.unshift(d); return true; };
  want.forEach(add);
  const window = { RoadPick: require(path.join(SC, "road-pick.js")), RoadMoveRoute: globalThis.RoadMoveRoute, RoadRules: globalThis.RoadRules, PadTrip: P, RoadFlightLog: null, RoadCleanup: null, addEventListener() {}, dispatchEvent() {}, location: { search: "" } };
  const React = { createElement() { return null; } }, document = {}, localStorage = { getItem() { return null; } };
  for (let tries = 0; tries < 400; tries++) {
    try { return new Function("window", "React", "document", "localStorage", `${parts.join("\n")}\nreturn { ${want.join(", ")} };`)(window, React, document, localStorage); }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/) || String(e.message).match(/Cannot access '(\w+)' before initialization/); if (!m) throw e;
      if (/before initialization/.test(e.message)) { const i = parts.findIndex((p) => new RegExp(`^(?:const|let|function)\\s+${m[1]}\\b`).test(p)); const [p] = parts.splice(i, 1); parts.unshift(p); continue; }
      if (!add(m[1])) throw new Error(`no top-level ${m[1]} in app.js`); }
  }
  throw new Error("could not load app.js");
}
const WANT = ["rtfCards", "fleetRoad", "roadForFlight", "rtfRows"], EXTRA = [];
let A = load(WANT);
// names referenced lazily inside the functions surface only when called: load them and call again
const app = new Proxy({}, { get: (_, k) => (...args) => { for (let i = 0; i < 200; i++) { try { return A[k](...args); } catch (e) { const m = e instanceof ReferenceError && String(e.message).match(/^(\w+) is not defined/); if (!m || EXTRA.includes(m[1])) throw e; EXTRA.push(m[1]); A = load([...WANT, ...EXTRA]); } } } });
const road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
let fleet = null; try { fleet = JSON.parse(fs.readFileSync(path.join(ROOT, "data/vehicles.json"), "utf8")); } catch {}
let fails = 0, n = 0; const check = (ok, m) => { n++; if (!ok) { console.log("❌ " + m); fails++; } };
const sid = (u) => (String(u || "").match(/status\/(\d+)/) || [])[1] || null;
const flights = [road.flight, ...new Set(Object.values((fleet && fleet.vehicles) || {}).map((v) => v.flight).filter((f) => Number.isInteger(f) && f > road.flight))];
const MOVE = new Set(["to_site", "from_site", "leave_prod"]);
let trips = 0, moves = 0, cardsN = 0;
for (const fl of flights) {
  const raw = fl === road.flight ? road : app.fleetRoad({ ...app.roadForFlight(road, fl), trip_feed: road.feed_items || [] }, fleet, fl);
  const cards = app.rtfCards(raw).filter((c) => c && c.h && c.h.id); cardsN += cards.length;
  const vs = new Set(raw.categories.flatMap((c) => (c.history || []).map((h) => String(h.hardware || "")).filter((v) => /^[SB]\d+$/.test(v))));
  for (const v of vs) for (const t of P.tripsOf(P.postsOf(raw, v))) {
    if (!P.headlineOf(t)) continue; trips++;
    const vc = cards.filter((c) => c.h.id.endsWith("-" + v));
    const home = vc.find((c) => [c.h, ...(c.h.updates || [])].some((x) => x.test_trip) || (c.h.test_trip));
    for (const m of t.members.filter((p) => MOVE.has(p.kind))) {
      moves++; const id = sid(m.post.url), what = `F${fl} ${v} ${m.post.at.slice(0, 16)} "${String(m.post.text).slice(0, 60)}"`;
      const lead = vc.find((c) => sid(c.h.url) === id && !c.h.test_trip);
      check(!lead, `no standalone move card: ${what} leads ${lead && lead.h.id}`);
      const onCard = vc.some((c) => (c.h.updates || []).some((u) => sid(u.url) === id || (u.merged || []).some((x) => sid(x.url) === id)) || sid(c.h.url) === id);
      check(onCard, `the move stays on its test's card: ${what}`);
    }
    const tc = vc.find((c) => c.h.test_trip && c.h.test_trip.start === new Date(t.start).toISOString());
    if (tc) { const st = (tc.h.updates || []).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((u) => P.stepOf(u)).filter((x) => x != null && x !== 3);
      check(st.every((x, i) => !i || st[i - 1] <= x), `F${fl} ${v} trip steps never go backwards (left bay → road → site → test → return): ${st.join(" ")}`);
      const snowT = (u) => { const m = /status\/(\d{15,})/.exec(u.url || ""); return m ? Number((BigInt(m[1]) >> 22n) + 1288834974657n) : null; };
      const off = [tc.h, ...(tc.h.updates || [])].flatMap((u) => [u, ...(u.merged || [])]).filter((u) => u.at && snowT(u) != null && Math.abs(Date.parse(u.at) - snowT(u)) > 90e3);
      check(!off.length, `F${fl} ${v} trip rows: post time = the X post id's time (${off.map((u) => u.url.split("/").pop() + " " + u.at).join(", ") || "all match"})`);
      check(tc.h.trip_order === "chrono", `F${fl} ${v} trip card reads oldest first`); check(!MOVE.has(P.tripKind(tc.h.card_text || tc.h.text).kind), `F${fl} ${v} trip card leads with the test, not a move: "${tc.h.text}"`); }
  }
}
// B24 (F17): every post Tusk listed on 24 Nov is on the Booster 24 cryo card; fv-768cebc29b is not its own card
if (fleet && fleet.vehicles && fleet.vehicles.B24) {
  const fl = fleet.vehicles.B24.flight, raw = app.fleetRoad({ ...app.roadForFlight(road, fl), trip_feed: road.feed_items || [] }, fleet, fl);
  const cards = app.rtfCards(raw).filter((c) => c && c.h && c.h.id), b = cards.filter((c) => /-B24$/.test(c.h.id));
  const cryo = b.find((c) => c.h.id === "rtf-cryo-B24");
  check(b.length === 1 && !!cryo, `Booster 24 has ONE card, its cryo card (got ${b.map((c) => c.h.id).join(", ")})`);
  const all = cryo ? [cryo.h, ...(cryo.h.updates || [])].flatMap((u) => [sid(u.url), ...(u.merged || []).map((x) => sid(x.url)), ...((u.sources || []).map((x) => sid(x.url)))]) : [];
  for (const id of ["2123658897949159619", "2123774597967540724", "2124637434797346916", "2124765411627643131", "2125104765050974276", "2125115713677594697", "2125117229482279118", "2125222150252675155"])
    check(all.includes(id), `B24 cryo card covers post ${id}`);
  check(!cards.some((c) => c.h.id !== "rtf-cryo-B24" && sid(c.h.url) === "2125114870563762434"), "fv-768cebc29b (B24 left Massey's) is not its own card");
}
console.log(`${n - fails}/${n} checks passed (${flights.length} flights, ${trips} trips, ${moves} trip moves, ${cardsN} cards)`);
process.exit(fails ? 1 : 0);
