// 24 Nov v6 (Bernardo 14:47 UK): every "Earlier updates" list on every road and every card, Page 1 and Page 2, reads NEWEST
// first (one shared order, app.js earlierNewestFirst), test-site trip cards included. Runs app.js's own functions over ALL
// the live data (road.json current flight + every archived flight, and each upcoming flight from data/vehicles.json):
//   Page 2 cards (rtfRows / upcomingFlight → RtfBuildUp order), Page 1 condensed cards (parityEarlier),
//   Road page / Flight Log entries (roadUpdates → FeedBuildUp), and each component's source uses the shared order.
// Usage: node scripts/test-earlier-order.js [tree]
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const SC = __dirname;
globalThis.RoadMoveRoute = globalThis.PadTrip = require(path.join(SC, "move-route.js"));
try { globalThis.RoadRules = require(path.join(SC, "road-rules.js")); } catch {}
try { globalThis.PhotoMarks = require(path.join(SC, "photo-marks.js")); } catch {}
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
const WANT = ["rtfRows", "upcomingFlight", "roadForFlight", "parityEarlier", "roadUpdates", "earlierNewestFirst", "earlierMs", "upIso"], EXTRA = [];
let A = load(WANT);
// names referenced lazily inside the functions surface only when called: load them and call again
const app = new Proxy({}, { get: (_, k) => (...args) => { for (let i = 0; i < 200; i++) { try { return A[k](...args); } catch (e) { const m = e instanceof ReferenceError && String(e.message).match(/^(\w+) is not defined/); if (!m || EXTRA.includes(m[1])) throw e; EXTRA.push(m[1]); A = load([...WANT, ...EXTRA]); } } } });
const road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
let fleet = null; try { fleet = JSON.parse(fs.readFileSync(path.join(ROOT, "data/vehicles.json"), "utf8")); } catch {}
let fails = 0, n = 0, lists = 0; const check = (ok, m) => { n++; if (!ok) { console.log("❌ " + m); fails++; } };
const desc = (ts) => ts.every((t, i) => !i || ts[i - 1] >= t);
const ms = (u) => app.earlierMs(u);
// the shared order itself
const s0 = app.earlierNewestFirst([{ at: "2026-11-20T06:05:00Z", t: "a" }, { at: "2026-11-24T13:36:00Z", t: "b" }, { url: "https://x.com/x/status/2123871167119569323", t: "c" }, { date: "22 Nov", t: "d" }]).map((u) => u.t).join("");
check(s0 === "bdca", `earlierNewestFirst: newest first by stored time, then the post id's time, then the day (got ${s0})`);
const flights = [...new Set([road.flight, ...Object.keys(road.archive || {}).map(Number), ...Object.values((fleet && fleet.vehicles) || {}).map((v) => v.flight).filter((f) => Number.isInteger(f) && f > road.flight)])].filter(Number.isInteger).sort((a, b) => a - b);
const seenCard = new Set();
const cardCheck = (where, h) => {
  if (!h || !(h.updates || []).length) return;
  const rows = app.earlierNewestFirst(h.updates); lists++;
  check(desc(rows.map(ms)), `${where} ${h.id}: Earlier updates newest first (${rows.map((u) => app.upIso(u) || u.date).join(" > ")})`);
  if (String(h.id || "").startsWith("rtf-")) { const pe = app.parityEarlier(h); lists++;
    check(pe.length === rows.length && pe.every((x, i) => x.text && rows[i]), `${where} ${h.id}: Page 1 condensed card has the same Earlier updates`);
    check(desc(rows.map(ms)), `${where} ${h.id}: Page 1 condensed card newest first`); }
};
for (const fl of flights) {
  let posts = [];
  if (fl > road.flight) posts = app.upcomingFlight(road, fl, fleet).posts;
  else { const r = fl === road.flight ? road : app.roadForFlight(road, fl); if (!r) continue; posts = app.rtfRows(r).posts || app.rtfRows(r).rows.filter((x) => x.post).map((x) => x.post); }
  for (const p of posts) { const h = p.h || p; const k = `${fl}|${h.id}`; if (seenCard.has(k)) continue; seenCard.add(k); cardCheck(`F${fl} Page 2`, h); }
  // Road page / Flight Log entries with their own build-up (FeedBuildUp / BuildUp)
  const r = fl === road.flight ? road : app.roadForFlight(road, fl);
  for (const c of (r && r.categories) || []) for (const h of c.history || []) if ((h.updates || []).length) { const ru = app.roadUpdates(h).map((x) => x.u); lists++;
    check(desc(ru.map((u) => Date.parse(app.upIso(u)) || 0).filter(Boolean)), `F${fl} ${c.id} ${h.id}: Road page Earlier updates newest first`); }
}
// the named cards: S43 Pad (F16), B24 and S44 cryo (F17) — newest first, headline unchanged
const f16 = app.rtfRows(road).rows.filter((x) => x.post && x.post.flight === 16).map((x) => x.post);
const s43 = f16.find((p) => p.h.id === "rtf-pad-S43");
check(s43 && /lifted on the chopsticks at Pad 2/.test(s43.h.text), "S43 Pad still leads with the chopstick lift");
const s43r = s43 ? app.earlierNewestFirst(s43.h.updates) : [];
check(s43r.length > 2 && ms(s43r[0]) > ms(s43r[s43r.length - 1]), `S43 Pad Earlier updates: newest (${s43r[0] && s43r[0].text}) first, oldest (${s43r.length && s43r[s43r.length - 1].text}) last`);
const f17 = app.upcomingFlight(road, 17, fleet).posts;
for (const v of ["B24", "S44"]) { const c = f17.find((p) => p.h.id === `rtf-cryo-${v}`); const rr = c ? app.earlierNewestFirst(c.h.updates) : [];
  check(c && rr.length >= 3 && desc(rr.map(ms)) && /Mega Bay/.test(rr[0].text), `F17 ${v} cryo: newest first, the return to the bay on top (${rr.map((u) => u.text).join(" | ")})`); }
// every Earlier updates component uses the shared order (no other sort, no trip-only reversal)
for (const [fn, re] of [["RtfBuildUp", /const rows = earlierNewestFirst\(h\.updates\);/], ["parityEarlier", /return earlierNewestFirst\(h\.updates\)/], ["roadUpdates", /const sorted = earlierNewestFirst\(ups, ms\);/], ["BuildUp", /const ups = earlierNewestFirst\(/], ["FlogCard", /const rest = earlierNewestFirst\(rest0\)/]])
  check(re.test(src), `${fn} uses the shared newest-first order`);
check(!/tripChrono|trip_order/.test(src) && !/trip_order/.test(fs.readFileSync(path.join(SC, "move-route.js"), "utf8")), "no trip-only oldest-first order left (tripChrono / trip_order)");
console.log(`\n${n - fails}/${n} checks passed (${flights.length} flights, ${lists} Earlier updates lists)`); if (fails) process.exit(1);
