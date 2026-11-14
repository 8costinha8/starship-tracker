// Past-flight Road groups on Page 2 (pastRoadFlights / pastRoadGroup in app.js).
// Same system for every launched flight: road.archive[n].summary → pastSummary → group bar + cards.
// No network, no pushes: node tests/test-past-road.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };

const start = app.indexOf("// A launched flight's milestone summary");
const end = app.indexOf("// --- end past-road helpers ---");
check(start > 0 && end > start, "app.js has the past-summary + past-road helper block");
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { pastSummary, pastRoadFlights, pastRoadGroup }; })()`);
const FLIGHTS = [{ n: 13, date: "2026-07-24T22:51:00Z", pad: "Pad 2" }, { n: 14, date: "2026-09-28T12:48:59Z", pad: "Pad 2" }];

// live data: Flight 14 is generated, above the current flight, from the archive only
const road = JSON.parse(JSON.stringify(live));
check(road.flight === 15, "live Road is Flight 15");
check(JSON.stringify(H.pastRoadFlights(road, FLIGHTS)) === "[14]", "live road.json → one past group: Flight 14");
const g = H.pastRoadGroup(road, 14, FLIGHTS, []);
check(g.items.length === 6 && g.items.every((i) => i.status === "done"), "Flight 14 bar: 6 of 6 done (liftoff closes every box)");
const order = [...new Set(g.cards.map((c) => c.box))];
check(JSON.stringify(order) === JSON.stringify(["cryo", "raptor", "static", "pad", "faa", "date"]), "cards in order Cryo, Raptor, Static fires, Pad activity, FAA licence, Launch date: " + order.join(","));
check(/full stack|launch pad/i.test(g.cards.find((c) => c.box === "pad").vehicle), "Pad activity: the launch pad / full stack card first");
const dc = g.cards.find((c) => c.box === "date");
check(dc && dc.iso === "2026-09-28T12:48:59Z" && dc.text === "Flight 14 lifted off from Pad 2.", "Launch date card from the logged liftoff: " + (dc && dc.text));
check(g.cards.filter((c) => c.box !== "date").every((c) => c.iso === null), "summary cards carry no invented date");
const arch = road.archive["14"].summary.items;
for (const c of g.cards.filter((c) => !["pad", "faa", "date"].includes(c.box))) check(arch.some((a) => a.box === c.box && a.vehicle === c.vehicle && a.text === c.text), `card text is the archived line: ${c.vehicle} · ${c.text}`);
check(g.cards.find((c) => c.box === "faa").text === "Launch licence issued 26 Sep", "FAA card: licence date from the archive");
check(g.cards.find((c) => c.box === "pad").text === "Stacked 23 Sep · Wet dress 24 Sep", "Pad card: stack + WDR dates from the archive");

// system, not a one-off: a second archived flight appears too, oldest first; nothing for flights without data
{ const r = JSON.parse(JSON.stringify(live));
  r.archive["13"] = { entries: [], summary: { items: [{ box: "cryo", vehicle: "Ship 40", text: "Cryo test 1 Jun" }, { box: "static", vehicle: "Booster 20", text: "1 static fire · 2 Jun" }] } };
  check(JSON.stringify(H.pastRoadFlights(r, FLIGHTS)) === "[13,14]", "two archived flights → groups 13 then 14");
  const g13 = H.pastRoadGroup(r, 13, FLIGHTS, []);
  check(g13.cards.some((c) => c.vehicle === "Ship 40") && g13.cards.some((c) => c.box === "date" && /Flight 13 lifted off/.test(c.text)), "Flight 13 group built from its own archive + liftoff");
  r.archive["12"] = { entries: [], summary: { items: [] } };
  check(!H.pastRoadFlights(r, FLIGHTS.concat({ n: 12, date: "2026-05-01T00:00:00Z" })).includes(12), "empty archive → no invented group"); }
{ const r = JSON.parse(JSON.stringify(live)); r.archive["16"] = r.archive["14"];
  check(!H.pastRoadFlights(r, FLIGHTS.concat({ n: 16, date: "2026-12-01T00:00:00Z" })).includes(16), "never a group for the current or a later flight"); }
{ const r = JSON.parse(JSON.stringify(live));
  check(!H.pastRoadFlights(r, [{ n: 14, date: null }]).includes(14), "a flight with no logged liftoff is not shown as past"); }
check(!H.pastRoadFlights(live, FLIGHTS, [14]).includes(14), "a flight still listed as its own section below is not doubled");
// rollover: the checker carries the archive to the next Road (check-road.js rolloverRoad / handover.js), so after
// Flight 15 rolls over both 14 and 15 are past groups when 15 has a frozen summary
{ const r = JSON.parse(JSON.stringify(live)); r.flight = 16; r.archive["15"] = { entries: [], summary: { items: [{ box: "cryo", vehicle: "Ship 42", text: "3 cryo tests · last 9 Oct" }] } };
  check(JSON.stringify(H.pastRoadFlights(r, FLIGHTS.concat({ n: 15, date: "2026-11-13T22:47:36Z", pad: "Pad 2" }))) === "[14,15]", "after the rollover to 16: past groups 14, 15"); }
// checker code keeps road.archive (read only, scripts/ untouched)
const cr = fs.readFileSync(path.join(ROOT, "scripts/check-road.js"), "utf8"), ho = fs.readFileSync(path.join(ROOT, "scripts/handover.js"), "utf8");
check(/if \(old\.archive\) road\.archive = old\.archive;/.test(cr), "check-road.js rolloverRoad carries road.archive to the fresh Road");
check(/A hand-written summary is never replaced/.test(cr) && /if \(!a\.summary\)/.test(cr), "check-road.js archiveLaunched never replaces an existing summary");
check(/const arch = JSON\.parse\(JSON\.stringify\(old\.archive \|\| \{\}\)\)/.test(ho), "handover.js carries road.archive");
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
