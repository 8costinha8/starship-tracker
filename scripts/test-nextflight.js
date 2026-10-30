// Dummy next flight (Flight 17, B24/S44) built in a fixture only — road.json is never read for writing or changed.
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode
// Checks the Road/Flight Log rules generalise beyond B22/S42.  node scripts/test-nextflight.js
const fs = require("fs"), path = require("path");
const road = require("./check-road.js"), c = require("./cleanup.js");
const ROOT = path.join(__dirname, "..");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const liveRaw = fs.readFileSync(path.join(ROOT, "road.json"), "utf8"), live = JSON.parse(liveRaw);
const grab = (re) => (app.match(re) || [""])[0];
const fn = (name) => { const i = app.indexOf(`function ${name}(`); return app.slice(i, app.indexOf("\n}\n", i) + 3); };
const A = eval(`(() => { const fmtDay = (d) => String(d || ""); const entryDate = (h) => h.date;
  ${grab(/const MON3 = [^\n]+/)}\n${grab(/function ukParts[^\n]+/)}\n${fn("ukStamp")}\n${grab(/const sfIso = [^\n]+/)}\n${fn("feedTime")}\n${grab(/const upIso = [^\n]+/)}
  ${grab(/const isDoneCard = [^\n]+/)}\n${app.slice(app.indexOf("const cardIso = "), app.indexOf("const cardDate = "))}${grab(/const cardDate = [^\n]+/)}\n${fn("roadUpdates")}
  ${grab(/const statusIdOf = [^\n]+/)}\n${fn("entryIndex")}\n${grab(/const updateTarget = [^\n]+/)}\n${grab(/const extOf = [^\n]+/)}
  ${grab(/const logDone = [^\n]+/)}\n${grab(/const ROLLUP_IDS = [^\n]+/)}\n${grab(/const logHw = [^\n]+/)}\n${fn("rollupStatus")}
  return { cardDate, roadUpdates, entryIndex, updateTarget, extOf, rollupStatus }; })()`);
const F = 17, X = (id) => `https://x.com/Acct/status/${id}`;
const ms = (hw, phase) => ({ key: `static_fire|${F}|${hw}`, type: "static_fire", flight: F, hardware: hw, phase });
const mk = () => {
  const r = { flight: F, vehicles: ["B24", "S44"], updated: "1 Mar", updatedAt: "2027-03-01T00:00:00Z", categories: road.freshRoad(F).categories };
  const S = r.categories.find((x) => x.id === "static");
  S.history = [
    { id: "x-2200000000000000003", date: "2 Mar", at: "2027-03-02T15:10:00Z", text: "Booster 24 completed a static fire test.", src: "@Acct", trust: "trusted", hardware: "B24", flight: F, url: X("2200000000000000003"), complete: true, milestone: ms("B24", "completed"), completed_at: "2027-03-02T14:55:00Z",
      updates: [
        { date: "2 Mar", at: "2027-03-02T14:58:00Z", text: "Booster 24 conducts a static fire.", url: X("2200000000000000009"), phase: "completed" },
        { date: "2 Mar", at: "2027-03-02T11:00:00Z", text: "Road closed ahead of the static fire.", url: X("2200000000000000002"), phase: "progress" },
        { date: "25 Feb", at: "2027-02-25T09:00:00Z", text: "Booster 24 waiting to roll out.", url: X("2200000000000000001"), phase: "expected" },
        { date: "20 Feb", text: "Booster 24 could be ready within a week.", url: "https://example.com/article", src: "NSF", phase: "expected" },
        { date: "10 Feb", text: "Booster 24 could be ready within two weeks.", src: "NSF", phase: "expected" }] },
    { id: "x-2200000000000000002", date: "2 Mar", at: "2027-03-02T11:00:00Z", text: "Road closed ahead of the static fire.", src: "@Acct", trust: "trusted", hardware: null, flight: F, url: X("2200000000000000002") },
    { id: "s44p", date: "1 Mar", text: "Ship 44 could be ready for a static fire next week.", src: "NSF", trust: "trusted", hardware: "S44", flight: F, milestone: ms("S44", "expected") }];
  return r;
};
const r = mk(), S = r.categories.find((x) => x.id === "static"), card = S.history[0];
// colours: same ids and colours as the live Road
const col = (cats) => cats.map((x) => `${x.id}:${x.color}`).join();
check(col(r.categories) === col(live.categories), "fresh Flight 17 categories keep the same ids + colours as the live Road");
// one card per vehicle (Flight Log view)
const v = c.flightLogView(S, r).history.filter((h) => !(h.flight > F));
check(v.length === 2 && c.hwOf(v[0]) === "B24" && c.hwOf(v[1]) === "S44" && v[0].complete && !v[1].complete, "Flight Log: one card per vehicle (B24 completed, S44 earliest prediction)");
check(JSON.stringify(c.vehicleProgress(S, r)) === JSON.stringify({ done: 1, total: 2 }), "progress 1 of 2");
// completion time
check(/^2 Mar( 2027)? · 14:55$/.test(A.cardDate(card)), "completed card header shows completed_at (2 Mar · 14:55, GMT)");
// dots: hollow until every vehicle completes, then filled
check(A.cardDate(S.history[1]) === "2 Mar · 11:00" || A.cardDate(S.history[1]) === "2 Mar 2027 · 11:00", "open card header shows date + time too");
check(A.rollupStatus(S, r) !== "done", "section dot stays hollow while S44 hasn't fired");
const r2 = mk(), S2 = r2.categories.find((x) => x.id === "static"); S2.status = "progress";
S2.history.unshift({ id: "s44d", date: "4 Mar", text: "Ship 44 completed its static fire.", src: "@Acct", trust: "trusted", hardware: "S44", flight: F, complete: true, milestone: ms("S44", "completed") });
check(A.rollupStatus(S2, r2) === "done", "section dot fills once B24 and S44 have both completed");
// Earlier updates order + links
const rows = A.roadUpdates(card), idx = A.entryIndex(r);
const lk = rows.map((x) => { const t = A.updateTarget(x.u, idx, card.id); return t ? "card:" + t : A.extOf(x.u) ? "ext:" + A.extOf(x.u) : "none"; });
console.log("links:", lk.join(", "));
check(rows.map((x) => x.u.date).join() === "2 Mar,25 Feb,20 Feb,10 Feb" && !rows.some((x) => /conducts/.test(x.u.text)), "Earlier updates newest first; repeat completion folded on a completed card");
check(lk[0] === "card:x-2200000000000000002" && lk[1] === "ext:" + X("2200000000000000001") && lk[2] === "ext:https://example.com/article" && lk[3] === "none", "links: own card in-app; no card → its X post / article; no source → plain");
// archive on launch
const r3 = mk(); const moved = road.archiveLaunched(r3, F);
check(moved === 3 && r3.archive[F].entries.length === 3 && r3.categories.every((x) => !(x.history || []).some((h) => h.flight === F)), "launch: every Flight 17 entry moves into the Flight Log archive");
check(road.archiveLaunched(r3, F) === 0, "archiving again changes nothing");
let ok = true; try { road.validateRoad(r3); } catch (e) { ok = false; console.log(e.message); } check(ok, "archived Flight 17 road validates");
// X search terms derive from road.json — a pretend Flight 17 with B25/S45 is searched with no code edit
const cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
check(!/"(?:B|S)\d{2}"|"(?:Booster|Ship) \d{2}"/.test(cr.slice(cr.indexOf("const vwords"), cr.indexOf("\n", cr.indexOf("const vwords")))), "feed search line has no hard-coded vehicle serials");
const r17 = mk(); r17.vehicles = ["B25", "S45"]; r17.categories.forEach((x) => (x.history = []));
r17.categories.find((x) => x.id === "static").history = [{ id: "a", date: "1 Mar", text: "Booster 25 rolls to the pad.", src: "@Acct", trust: "trusted", hardware: "B25", flight: F }];
const w17 = road.searchVehicleWords(r17);
console.log("Flight 17 terms:", w17.join(", "));
check(["B25", "Booster 25", "S45", "Ship 45", "B26", "B27", "S46", "S47", "Booster 27", "Ship 47"].every((x) => w17.includes(x)), "Flight 17 (B25/S45): current vehicles + next 2 booster/ship numbers, short + long form");
const r18 = JSON.parse(JSON.stringify(r17)); road.archiveLaunched(r18, F); r18.flight = 18; r18.vehicles = ["B26", "S46"];
const w18 = road.searchVehicleWords(r18);
check(["B26", "Booster 26", "S46", "Ship 46", "B28", "S48"].every((x) => w18.includes(x)) && !w18.includes("B24"), "after Flight 17 launches and is archived, Flight 18 (B26/S46) terms follow automatically");
const r0 = { flight: 17, vehicles: [], categories: [{ id: "static", history: [] }], archive: { 16: { entries: [{ box: "static", date: "1 Feb", text: "Booster 24 completed its static fire." }] } } };
check(road.searchVehicleWords(r0).join() === "B24,Booster 24,B25,Booster 25,B26,Booster 26", "vehicles not assigned yet: the archive's highest serial still drives the next ones");
const vq = (rr) => { const v = road.searchVehicleWords(rr).map((x) => (x.includes(" ") ? `"${x}"` : x)); return `(${road.X_SEARCH_HANDLES.map((h) => `from:${h}`).join(" OR ")}) (${[...v, `"Pad 2"`, `"Flight ${rr.flight}"`, `"Flight ${rr.flight + 1}"`, `"Flight ${rr.flight + 2}"`].join(" OR ")}) -is:retweet -is:reply`; };
check(vq(live).length <= 512 && vq(r17).length <= 512, `X query stays within 512 chars (live ${vq(live).length}, Flight 17 ${vq(r17).length})`);
check(fs.readFileSync(path.join(ROOT, "road.json"), "utf8") === liveRaw, "real road.json untouched");
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
