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
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { pastSummary, pastRoadFlights, pastRoadGroup, liftoffIsoFor }; })()`);
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
// live pill time = the actual liftoff, never the push's post time
{ const r = JSON.parse(JSON.stringify(live));
  check(r.mission_alerts && r.mission_alerts.liftoff_actual === "2026-11-13T22:47:36.000Z", "road.json Flight 15 liftoff_actual is 22:47:36Z (LL2)");
  check(H.liftoffIsoFor(r, 15, FLIGHTS, "2026-11-13T23:30:00Z") === "2026-11-13T22:47:36.000Z", "Flight 15 pill time: liftoff_actual wins over the hero T-0");
  const uk = new Date(H.liftoffIsoFor(r, 15, FLIGHTS)).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  check(/13 Nov.*22:47/.test(uk), "Flight 15 liftoff in UK time: " + uk);
  const feed = (r.feed_items || []).find((f) => /Liftoff/.test(f.title || "") && f.flight === 15);
  check(feed && feed.at !== H.liftoffIsoFor(r, 15, FLIGHTS), "the Liftoff push's own time (" + (feed && feed.at) + ") is not used");
  check(H.liftoffIsoFor(r, 14, FLIGHTS) === "2026-09-28T12:48:59Z", "Flight 14: the logged flight's own liftoff");
  const r2 = JSON.parse(JSON.stringify(r)); delete r2.mission_alerts.liftoff_actual;
  check(H.liftoffIsoFor(r2, 15, FLIGHTS, "2026-11-13T22:47:00Z") === "2026-11-13T22:47:00Z", "no liftoff_actual yet: the hero's Launch Library T-0 (in flight)");
  check(H.liftoffIsoFor(r2, 15, FLIGHTS, null) === null, "no liftoff data at all: no time (never the post time)");
  const r3 = JSON.parse(JSON.stringify(r)); r3.mission_alerts.flight = 16;
  check(H.liftoffIsoFor(r3, 15, FLIGHTS, null) === null, "another flight's liftoff_actual is never used"); }
// live pill row: whole sentence, no ellipsis; the time comes from liftIso only
{ const row = app.slice(app.indexOf("function RoadLiveRow("), app.indexOf("function RoadFlightSection("));
  check(!/cardIso|cardDate|p\.h\.at\b/.test(row) && /liftIso/.test(row), "RoadLiveRow shows liftIso, never the post's own time");
  const css = (app.match(/\.rfs-live-txt \{[^}]*\}/) || [""])[0];
  check(css && !/ellipsis|overflow:\s*hidden/.test(css), "pill text has no ellipsis / overflow clip: " + css);
  check(/\.rfs-row \{[^}]*flex-wrap: wrap/.test(app) && /\.rfs-live \{ flex: none;/.test(app), "pill never shrinks; the time wraps to its own line instead"); }
// layout tiers (Tusk fix2): measured, in Bernardo's priority order; bar never ellipsises
{ const tiers = (app.match(/const LIVE_TIERS = (\[[^\]]*\])/) || [])[1], bar = (app.match(/const BAR_TIERS = (\[[^\]]*\])/) || [])[1];
  check(tiers === '["a", "b", "bt", "c", "ct", "bt12", "ct12", "bt11", "ct11"]', "live row tiers: one-line time beside → 2-line stack beside → tighter pill → wrap below → font steps: " + tiers);
  check(bar === '["full", "short", "st", "st2"]', "bar tiers: 6 of 6 done → 6 of 6 → tighter dots/gaps → smaller title: " + bar);
  check(/function useFitTier\(/.test(app) && /ResizeObserver/.test(app.slice(app.indexOf("function useFitTier("), app.indexOf("const BAR_TIERS"))), "tiers come from measured widths (ResizeObserver + fonts.ready), not one breakpoint");
  check(!/@container \(max-width: \d+px\) \{ \.rfs/.test(app), "no fixed container breakpoints left on the flight card");
  check(!/\.feed-pill \.road-count \{[^}]*ellipsis/.test(app), "bar count has no ellipsis");
  const lf = app.slice(app.indexOf("function liveFits("), app.indexOf("function RoadFlightPill("));
  check(/txt\.scrollWidth > txt\.clientWidth/.test(lf) && /row\.scrollWidth > row\.clientWidth/.test(lf), "a tier only counts if the pill text and row do not overflow"); }
// checker code keeps road.archive (read only, scripts/ untouched)
const cr = fs.readFileSync(path.join(ROOT, "scripts/check-road.js"), "utf8"), ho = fs.readFileSync(path.join(ROOT, "scripts/handover.js"), "utf8");
check(/if \(old\.archive\) road\.archive = old\.archive;/.test(cr), "check-road.js rolloverRoad carries road.archive to the fresh Road");
check(/A hand-written summary is never replaced/.test(cr) && /if \(!a\.summary\)/.test(cr), "check-road.js archiveLaunched never replaces an existing summary");
check(/const arch = JSON\.parse\(JSON\.stringify\(old\.archive \|\| \{\}\)\)/.test(ho), "handover.js carries road.archive");
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
