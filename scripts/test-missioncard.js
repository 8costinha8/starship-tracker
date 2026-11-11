// Hand-written Flight 15 Next-flight card (road.json mission_card["15"]).
// Covers {NET} substitution from the hero Launch Library date, lastKnownNet fallback,
// and that a non-15 next flight still renders the LL2 note + missionLines.
// No network, no pushes: node scripts/test-missioncard.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const F = require("./flightlog.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };

const EXPECTED = "Flight 15 is Starship's next flight, expected NET {NET}. It's aiming for the first double catch — both the ship and booster returning to the launch site towers. The main unknown is whether the heat shield and flip maneuver hold up under reentry at that scale. Beyond that, it's a straightforward step up from Flight 14's profile.";
const FILLED = "Flight 15 is Starship's next flight, expected NET 13 November. It's aiming for the first double catch — both the ship and booster returning to the launch site towers. The main unknown is whether the heat shield and flip maneuver hold up under reentry at that scale. Beyond that, it's a straightforward step up from Flight 14's profile.";

const start = app.indexOf("// --- mission-card helpers");
const end = app.indexOf("// --- end mission-card helpers ---");
check(start > 0 && end > start, "app.js has the mission-card helper block");
const fmt = (iso, opts) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts }).replace(/\bSept\b/, "Sep");
const helpers = eval(`(() => {\n${app.slice(start, end)}\nreturn { missionCardText, lastKnownNetDay, heroNetIso, missionCardNet, fillMissionCard, showMissionCard }; })()`);

check(live.mission_card && live.mission_card["15"] === EXPECTED, "road.json mission_card[\"15\"] holds the exact template with {NET}");
check(!/Musk|Coast Guard|NSF|LabPadre|NASASpaceflight|\(\d{1,2} \w+\)/.test(live.mission_card["15"]), "stored copy has no citations, sources or stacked dates");

const road = JSON.parse(JSON.stringify(live));
const f15 = { n: 15, date: "2026-11-13T22:45:00Z", netPrecision: "HOUR", ll2Status: "TBD" };
check(helpers.missionCardNet(f15, road) === "13 November", "{NET} from hero Launch Library date 2026-11-13T22:45:00Z → '13 November'");
check(helpers.fillMissionCard(EXPECTED, f15, road) === FILLED, "filled card text is the exact four sentences with 13 November");
check(!/Musk|Coast Guard|NSF|LabPadre|\(22 Oct\)|\(9 Nov\)/.test(helpers.fillMissionCard(EXPECTED, f15, road)), "filled text has no source or stacked date");

const noDate = { n: 15, date: null };
const dc = road.categories.find((c) => c.id === "date");
dc.latest = dc.log_latest = "Flight 15 NET 13 Nov.";
check(helpers.lastKnownNetDay(road, 15) === "13 November", "lastKnownNet fallback: 'Flight 15 NET 13 Nov.' → '13 November'");
check(helpers.fillMissionCard(EXPECTED, noDate, road) === FILLED, "no hero date: lastKnownNet fills {NET} as 13 November");
check(F.boxes(road, undefined, { pending: true }).date.latest === "NET 13 Nov", "same lastKnownNet parse as the 9 Nov date-pending fix (boxes pending → 'NET 13 Nov')");

{ const r = JSON.parse(JSON.stringify(road)); const d = r.categories.find((c) => c.id === "date"); d.latest = d.log_latest = "Flight 14 NET 2 Oct.";
  check(helpers.lastKnownNetDay(r, 15) === "" && helpers.fillMissionCard(EXPECTED, noDate, r).includes("expected NET to be confirmed."), "a NET for another flight is not used; no invented date"); }
{ const r = JSON.parse(JSON.stringify(road)); const d = r.categories.find((c) => c.id === "date"); d.latest = d.log_latest = "No official Flight 15 date yet.";
  check(helpers.fillMissionCard(EXPECTED, { n: 15 }, r).includes("expected NET to be confirmed."), "pending + no NET in road.json → 'to be confirmed', not a guessed date"); }
{ const rough = { n: 15, date: "2026-12-31T00:00:00Z", netPrecision: "Q4" };
  check(helpers.heroNetIso(rough) === null && helpers.fillMissionCard(EXPECTED, rough, road) === FILLED, "a rough/placeholder LL date falls back to lastKnownNet, not 31 December"); }

check(helpers.showMissionCard(road, 15) === true, "showMissionCard: next flight 15 with a copy → true");
check(helpers.showMissionCard(road, 16) === false, "showMissionCard: next flight 16 → false even if mission_card[15] exists");
check(helpers.showMissionCard({ ...road, mission_card: {} }, 15) === false, "showMissionCard: flight 15 but no copy → false (current behaviour)");
check(helpers.missionCardText({ mission_card: { 16: "later" } }, 16) === "later" && helpers.showMissionCard({ mission_card: { 16: "later" } }, 16) === true, "a Flight 16 copy is shown when present (generic for any flight, not Flight-15-only)");

const body = (n) => { const a = app.indexOf(`function ${n}(`); return app.slice(a, app.indexOf("\nfunction ", a + 10)); };
const nf = body("NextFlightCard");
check(/showMissionCard\(road, f\.n, f, now\)/.test(nf), "NextFlightCard: hand-written copy when showMissionCard is true for that flight");
check(nf.indexOf("scrub(f.note)") > 0 && nf.indexOf("missionLines(road, f.n)") > nf.indexOf("scrub(f.note)"), "otherwise the LL2 note and missionLines still render (Flight 16+ / no copy)");
check(!/missionCardText|fillMissionCard|showMissionCard/.test(body("FlightCard")) && !/missionCardText|fillMissionCard/.test(body("FeedPost")), "Flight Log cards and the feed are unchanged");
check(nf.indexOf("missionLines(road, f.n)") < nf.indexOf("showWatch &&"), "missionLines stay on the Next flight card path only, still above Where to watch");

const checkerFiles = ["check-road.js", "x-first.js", "mission.js"];
const hits = checkerFiles.filter((f) => /mission_card/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
check(!hits.length, `checkers never read or write mission_card (${hits.join(", ") || "none"})`);

console.log(fails ? `\n${fails} FAILED` : "\n✅ All mission-card checks passed.");
process.exit(fails ? 1 : 0);
