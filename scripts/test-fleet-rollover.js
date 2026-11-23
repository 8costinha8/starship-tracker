/* Registry → Road: (1) Page 2 stage ticks of the next flight count registry events; (2) at rollover the new flight's
   registry events move into its Road (no duplicates, no push, flight separation kept); (3) the Page 2 credit badge
   reads author.username (regression for the "[" badge). Generic: any flight N → N+1; the data is the live registry. */
const fs = require("fs"), path = require("path"), os = require("os");
const F = require("./fleet.js"), cr = require("./check-road.js");
const { appFns } = require("./app-fns-test-helper.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
const road0 = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
// a registry with events for the flight after the Road's (synthetic vehicles: nothing here is about one flight)
const N = road0.flight, M = N + 1;
const reg = F.empty(); F.seed(reg, { road: road0, appJsText: fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), now: 0 });
const P = (id, who, at, text) => ({ post_id: String(id), url: `https://x.com/${who}/status/${id}`, created_at: at, text, author: { username: who }, media: [] });
F.ingest(reg, [P("9400000000000000001", "NASASpaceflight", "2026-11-20T10:00:00.000Z", `Starship Flight ${M}: Booster 90 and Ship 91 are the vehicles for this flight.`),
  P("9400000000000000002", "RGVaerialphotos", "2026-11-20T12:00:00.000Z", "Booster 90 headed to Massey's this morning."),
  P("9400000000000000003", "RGVaerialphotos", "2026-11-21T21:00:00.000Z", "Booster 90 began cryogenic proof testing at Massey's."),
  P("9400000000000000004", "RGVaerialphotos", "2026-11-22T07:00:00.000Z", "Booster 90 completed its first round of cryogenic proof testing at Massey's."),
  P("9400000000000000005", "BocaChicaGal", "2026-11-22T20:00:00.000Z", "Ship 91 has started cryo testing at Massey's."),
  P("9400000000000000006", "BocaChicaGal", "2026-11-23T06:00:00.000Z", "Ship 91 completed its cryo testing campaign at Massey's."),
  P("9400000000000000007", "RGVaerialphotos", "2026-11-23T08:00:00.000Z", "Booster 90's LOX tank section moved into Megabay 1.")], { road: road0, now: Date.parse("2026-11-23T09:00Z"), backfill: true });
ok(reg.vehicles.B90 && reg.vehicles.B90.flight === M && reg.vehicles.S91.flight === M, `registry: B90 + S91 on Flight ${M}`);
const evs = [...reg.vehicles.B90.events, ...reg.vehicles.S91.events];
const checks = appFns(["peekCatItems", "roadForFlight", "fleetRoad", "roadCatItems"], (A) => {
  const out = [], o = (c, m) => out.push([c, m]);
  const done = (items) => items.filter((m) => m.status === "done").length, st = (items, id) => (items.find((m) => m.id === id) || {}).status;
  // (1) next-flight stage ticks before the rollover
  const peek = A.roadForFlight(road0, M), plain = A.peekCatItems(peek), withFleet = A.peekCatItems(A.fleetRoad(peek, reg, M));
  o(done(plain) === 0 && done(withFleet) === 1 && st(withFleet, "cryo") === "done" && st(withFleet, "pad") === "progress", `Flight ${M} ticks: without the registry ${done(plain)} of ${plain.length}, with it ${done(withFleet)} of ${withFleet.length} (cryo done for both vehicles, pad in progress)`);
  const half = A.peekCatItems(A.fleetRoad(peek, { vehicles: { B90: { ...reg.vehicles.B90 }, S91: { ...reg.vehicles.S91, events: reg.vehicles.S91.events.filter((e) => e.type !== "cryo_done") } } }, M));
  o(st(half, "cryo") === "progress", "cryo is only done when every vehicle of the flight completed it");
  // (2) rollover N → M
  const ro = cr.rolloverRoad(JSON.parse(JSON.stringify(road0)), N, "2026-11-24T12:00:00.000Z", () => {}, Date.parse("2026-11-25T12:00Z"));
  const r = ro.road; const before = JSON.stringify(r);
  const mv = F.intoRoad(reg, r);
  o(r.flight === M && mv.moved === evs.filter((e) => F.ROAD_BOX[e.type]).length && mv.moved === 5, `rollover → Road ${M}: ${mv.moved} registry events moved in (production events stay cards only)`);
  o(["B90", "S91"].every((v) => r.vehicles.includes(v) && r.hardware_flights[v] === M), `Road ${M} vehicles include B90 + S91`);
  const all = r.categories.flatMap((c) => c.history || []);
  o(all.filter((h) => h.fleet_id).every((h) => h.no_push === true && h.flight === M && /^https:\/\/x\.com\//.test(h.url)), "moved entries: no_push, tagged with their flight, keep their source link");
  o(!all.some((h) => h.fleet_id && /LOX tank/.test(h.text)), "the production event (LOX tank) is not a Road entry");
  o(F.intoRoad(reg, r).moved === 0 && JSON.stringify(r.categories) === JSON.stringify(JSON.parse(JSON.stringify(r)).categories), "running it again moves nothing (no duplicates)");
  const r2 = JSON.parse(before); r2.categories.find((c) => c.id === "cryo").history = [{ id: "x", date: "22 Nov", at: "2026-11-22T07:00:00.000Z", text: "B90 done", url: "https://x.com/RGVaerialphotos/status/9400000000000000004", flight: M, hardware: "B90" }];
  o(F.intoRoad(reg, r2).moved === 4, "an event already on the Road (same post) is not added twice");
  const items = A.peekCatItems(r), cur = A.roadCatItems(r, {});
  o(st(items, "cryo") === "done" && st(cur, "cryo") === "done", `counts after rollover: Road ${M} cryo done on Page 2 (${done(items)} of ${items.length}) and in the Road box (${st(cur, "cryo")})`);
  o(!ro.road.categories.some((c) => (c.history || []).some((h) => h.flight === N && h.fleet_id)), `flight separation: no Flight ${N} entry gets registry events`);
  o(cr.validateRoad ? (() => { try { cr.validateRoad(r); return true; } catch (e) { return false; } })() : true, "the new Road passes validateRoad");
  return out;
});
for (const [c, m] of checks) ok(c, m);
// (3) badge regression: the XMedia credit badge gets the handle string, never "[object Object]"
const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const m = src.match(/function XMedia[\s\S]*?<SrcBadge author=\{([^}]+(?:\}[^}]*)*?)\} url=\{x\.url\} \/>/);
ok(!!m, "XMedia renders a SrcBadge");
const badge = m && new Function("x", `return ${m[1]};`)({ url: "https://x.com/RGVaerialphotos/status/1", author: { name: "RGV Aerial Photography", username: "RGVaerialphotos" } });
ok(badge === "RGVaerialphotos", `XMedia badge author for an { username } author = "${badge}" (first letter "${String(badge)[0]}", not "[")`);
console.log(fails ? `\n❌ ${fails} check(s) failed` : "\n✅ all checks passed"); process.exit(fails ? 1 : 0);
