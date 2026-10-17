// Offline tests for the running per-vehicle milestone summary (scripts/milestones.js) and its
// freeze into road.archive[N].summary when Flight N is logged (no network).
const road = require("./check-road.js");
const { recordMilestone, buildSummary } = require("./milestones.js");
const xf = require("./x-first.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const mk = () => ({ flight: 15, vehicles: ["B22", "S42"], updated: "1 Oct", updatedAt: "2026-10-01T00:00:00Z", categories: road.freshRoad(15).categories });

const r = mk();
const rec = (hardware, event, at) => recordMilestone(r, { hardware, event, at, src: "https://x.com/NASASpaceflight/status/1" });
check(rec("S42", "cryo_test", "2026-10-02T14:00:00Z") && rec("Ship 42", "cryo_test", "2026-10-09T14:00:00Z"), "Ship cryo tests counted (S42 and 'Ship 42' are the same vehicle)");
check(!rec("S42", "cryo_test", "2026-10-09T20:00:00Z"), "a second post about the same test (within 12h) doesn't count twice");
rec("B22", "cryo_test", "2026-09-30T10:00:00Z");
rec("S42", "engines_installed", "2026-10-12T10:00:00Z");
rec("S42", "static_fire", "2026-10-20T04:00:00Z"); rec("S42", "static_fire", "2026-10-21T04:00:00Z");
rec("B22", "static_fire", "2026-10-25T18:00:00Z");
rec(null, "stacked", "2026-11-01T12:00:00Z"); rec(null, "wdr", "2026-11-02T15:00:00Z"); rec(null, "licence", "2026-11-05T21:00:00Z");
check(!rec("B22", "rollback", "2026-10-26T10:00:00Z") && !rec("Pad 2", "cryo_test", "2026-10-26T10:00:00Z"), "noise (rollbacks, removals) and non-vehicle hardware are ignored");
check(r.milestones.S42.cryo_test.count === 2 && r.milestones.S42.static_fire.count === 2 && r.milestones.B22.cryo_test.count === 1, "per-vehicle counts kept");
const sm = buildSummary(r.milestones, r.vehicles);
const t = (box, v) => (sm.items.find((e) => e.box === box && e.vehicle === v) || {}).text;
check(t("cryo", "Ship 42") === "At least 2 cryo tests · last 9 Oct" && t("cryo", "Booster 22") === "At least 1 cryo test · last 30 Sep", "cryo box: 'at least N' + last date (UK day)");
check(t("raptor", "Ship 42") === "Engines installed · 12 Oct" && !t("raptor", "Booster 22"), "Raptor box only when the install was seen");
check(t("static", "Ship 42") === "At least 2 static fires · 20 Oct, 21 Oct" && t("static", "Booster 22") === "At least 1 static fire · 25 Oct", "static fire box: count + dates");
check(t("pad", "Full stack") === "Stacked 1 Nov · wet dress rehearsal 2 Nov" && t("faa", "Licence") === "Launch licence issued 5 Nov", "pad + licence boxes");
check(sm.items[0].vehicle === "Ship 42" && sm.items.every((e) => e.text.length < 120 && !/http/.test(e.text)), "ship first, short, no links");
road.validateRoad(Object.assign(mk(), { archive: { 15: { entries: [], summary: sm } } }));
check(true, "a built summary passes validateRoad");
// freeze at launch: the Road's own flight logged → summary frozen; a manual summary isn't replaced
const r2 = JSON.parse(JSON.stringify(r)); road.archiveLaunched(r2, 15);
check(r2.archive[15].summary && r2.archive[15].summary.items.length === sm.items.length && r2.archive[15].summary.auto, "Flight 15 logged: its running summary is frozen into archive[15].summary");
const r3 = JSON.parse(JSON.stringify(r)); r3.archive = { 15: { entries: [], summary: { items: [{ box: "cryo", vehicle: "Ship 42", text: "hand-written" }] } } }; road.archiveLaunched(r3, 15);
check(r3.archive[15].summary.items.length === 1, "a hand-written summary is never replaced");
const r4 = JSON.parse(JSON.stringify(r)); road.archiveLaunched(r4, 14);
check(!r4.archive || !r4.archive[15], "an earlier flight's logging doesn't freeze the current Road's summary");
// X-first: the classifier gets an event field and the hook records it
check(xf.CLASSIFY_SCHEMA && JSON.stringify(xf.CLASSIFY_SCHEMA).includes("static_fire") && /event \(road only/.test(xf.classifyPrompt(r, [{ id: "1", text: "x", author: { username: "NASASpaceflight" }, media: [], created_at: "2026-10-01T00:00:00Z" }], road.freshRoad(15).categories)), "classifier schema + prompt carry the milestone event");
const bad = Object.assign(mk(), { archive: { 15: { entries: [], summary: { items: [{ box: "cryo", text: "no vehicle" }] } } } }); let threw = false; try { road.validateRoad(bad); } catch { threw = true; }
check(threw, "a malformed summary is rejected");
console.log(fails ? `\n${fails} FAILED` : "\n✅ All summary checks passed."); process.exit(fails ? 1 : 0);
