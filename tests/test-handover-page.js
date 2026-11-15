// Post-handover Road rules (15 Nov, every flight, not an F15 patch). No network, no pushes: node tests/test-handover-page.js
// A  a flight with road.archive[n] keeps its past Road on Page 1 (15 Nov: Page 2 shows only flights N and N+1); nothing of it is left on Page 2
// B  a launched / complete flight's Liftoff push never renders live (no "in the air · Watch now", real liftoff time)
// D  "The story's up in the app." becomes the logged Style A story, or is dropped
// E  the hidden Flight Log leaves the page flow while Road is open (no blank screen-heights under Road)
// H  past Roads: liftoff closes every box, never "Licence pending"; manual override wins
// I  Page 1's past Road reads road.archive[n] (same entries, text, photos as the archive summary)
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const start = app.indexOf("// A launched flight's milestone summary"), end = app.indexOf("// --- end past-road helpers ---");
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { pastSummary, pastRoadFlights, pastRoadGroup, liftoffIsoFor, roadPageRows, settledFeedPost, pastCondensed }; })()`);
const FLIGHTS = [{ n: 14, date: "2026-09-28T12:48:59Z", pad: "Pad 2", story: "Flight 14 story." }, { n: 15, date: "2026-11-13T22:47:36Z", pad: "Pad 2", story: "Booster 22 skipped the tower catch and splashed down in the Gulf, while Ship 42 pressed on to orbit." }];
const base = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
// fixture: the state right after a handover N → N+1 (archive for 14 and 15, Road is 16, F15 launch-day pushes still in feed_items)
const road = JSON.parse(JSON.stringify(base));
road.flight = 16; road.archive = { 14: base.archive["14"], 15: base.archive["15"] || base.archive["14"] };
road.mission_alerts = { flight: 15, liftoff_actual: null };

// A — row split (the shape rtfRows returns: current section first, then other flights' sections)
{ const sec = (n, next) => ({ section: { n, next: !!next, flown: next ? null : { outcome: "success" } } }), post = (id, flight) => ({ post: { id, flight } });
  const rows = [sec(16, true), post("a", 16), post("b", 16), sec(15), post("res15", 15), post("lift15", 15)];
  const r = H.roadPageRows(rows, 16, [14, 15]);
  check(r.cur.map((x) => x.post.id).join() === "a,b", "A: current flight's rows stay in its card");
  check(r.late.length === 0 && r.early.length === 0, "A: Flight 15's divider and pushes are folded into its past group (nothing below Flight 17)");
  const r2 = H.roadPageRows(rows, 16, [14]);
  check(r2.early.length === 3 && r2.early[0].section.n === 15 && r2.late.length === 0, "A: a launched flight without an archive keeps its section, above the current flight");
  const r3 = H.roadPageRows([sec(16, true), post("a", 16), sec(17), post("z", 17)], 16, [15]);
  check(r3.late.length === 2 && r3.early.length === 0, "A: later flights stay below the current flight");
  // F16 → F17 too: same function, no flight numbers
  const r4 = H.roadPageRows([sec(17, true), sec(16), post("lift16", 16)], 17, [14, 15, 16]);
  check(!r4.early.length && !r4.late.length, "A: next handover (16 → 17) folds Flight 16 the same way"); }
{ const FL = FLIGHTS.concat({ n: 16, date: "2027-01-10T12:00:00Z" });
  const r = JSON.parse(JSON.stringify(road)); r.flight = 17; r.archive["16"] = { entries: [], summary: { items: [{ box: "cryo", vehicle: "Ship 43", text: "Cryo tested" }] } };
  check(JSON.stringify(H.pastRoadFlights(r, FL)) === "[14,15,16]", "A: past groups after 16 → 17: 14, 15, 16 (oldest first)"); }
check(JSON.stringify(H.pastRoadFlights(road, FLIGHTS)) === "[14,15]", "A: after 15 → 16 the past groups are 14 then 15");
{ const g = H.pastRoadGroup(road, 15, FLIGHTS, []);
  check(g.items.length === 6 && g.items.every((i) => i.status === "done"), "A: Flight 15 group bar is 6 of 6 done");
  const dc = g.cards.find((c) => c.box === "date");
  check(dc && dc.iso === "2026-11-13T22:47:36Z" && dc.text === "Flight 15 lifted off from Pad 2.", "A/B: Flight 15 group's Launch date card is the real liftoff (22:47:36Z), not the 23:00 push"); }
// UpdatesFeed wiring (15 Nov, Bernardo): Page 2 shows only flights N and N+1 — no past groups, no other flights' rows
{ const uf = app.slice(app.indexOf("function UpdatesFeed("), app.indexOf("function StarshipTracker("));
  check(!/pastRoadGroup|PastPost|fsec-past|early\.map|rest\.map/.test(uf) && !/function PastPost\(/.test(app), "A: UpdatesFeed renders no past Road groups and no other flights' rows");
  check(/roadPageRows\(rows,/.test(uf) && (uf.match(/<RoadFlightSection /g) || []).length === 2 && /page2Flights\(road\)\[1\]/.test(uf), "A: exactly two groups: the current flight (its rows from roadPageRows) and page2Flights(road)[1]"); }

// B — Liftoff push of a flight that is over
{ const p = { id: "flight-x", flight: 15, when: 0, cat: { id: "feed-flight", name: "Liftoff!" }, h: { id: "flight-x", text: "Flight 15 is in the air · Watch now", publishedAt: "2026-11-13T23:00:31.652Z" } };
  const q = H.settledFeedPost(p, road, FLIGHTS, false);
  check(q.h.text === "Flight 15 lifted off." && !/watch/i.test(q.h.text), "B: logged flight's Liftoff push reads 'Flight 15 lifted off.' (no Watch now): " + q.h.text);
  check(q.h.publishedAt === "2026-11-13T22:47:36Z", "B: its time is the real liftoff, not the 23:00 push time: " + q.h.publishedAt);
  const live = H.settledFeedPost({ ...p, flight: 18 }, { ...road, mission_alerts: {} }, FLIGHTS, false);
  check(live.h.text === p.h.text, "B: a flight still in the air (not logged, not complete) stays live");
  const done = H.settledFeedPost({ ...p, flight: 18 }, { ...road, mission_alerts: { flight: 18, liftoff_actual: "2027-02-01T10:00:00Z" } }, FLIGHTS, true);
  check(done.h.text === "Flight 18 lifted off." && done.h.publishedAt === "2027-02-01T10:00:00Z", "B: missionComplete (both stages confirmed) settles it too, before the log");
  const news = { ...p, cat: { id: "feed-news", name: "Starship" } };
  check(H.settledFeedPost(news, road, FLIGHTS, true) === news, "B: news cards are untouched"); }
{ const uf = app.slice(app.indexOf("function UpdatesFeed("), app.indexOf("function StarshipTracker("));
  check(/settledFeedPost\(r\.post, road, FLIGHTS, missionComplete\(road, r\.post\.flight\)\)/.test(uf), "B: every non-current row goes through settledFeedPost with the missionComplete rule"); }

// D — "The story's up in the app."
{ const p = { id: "flight-y", flight: 15, cat: { id: "feed-flight", name: "Flight 15 — Success" }, h: { id: "flight-y", text: "The story's up in the app." } };
  const q = H.settledFeedPost(p, road, FLIGHTS, false);
  check(q && q.h.text === FLIGHTS[1].story, "D: the vague result push carries the logged Style A story");
  check(H.settledFeedPost({ ...p, flight: 14 }, road, [{ n: 14, date: "2026-09-28T12:48:59Z" }], false) === null, "D: no logged story → dropped, never invented"); }

// E — page height while Road is open
{ const css = app.match(/html\.feed-lock \.st-wrap \{[^}]*\}/);
  check(!!css && /position: fixed/.test(css[0]) && /top: var\(--lock-y/.test(css[0]), "E: html.feed-lock takes the hidden Flight Log out of the flow, pinned at its scroll offset");
  const eff = app.slice(app.indexOf("de.classList.add(\"feed-lock\")") - 400, app.indexOf("de.classList.add(\"feed-lock\")") + 300);
  check(/setProperty\("--lock-y", `\$\{-y\}px`\)/.test(eff) && /removeProperty\("--lock-y"\)/.test(eff) && /window\.scrollTo\(0, y\)/.test(eff), "E: lock offset set on open, cleared and the Flight Log scroll restored on the way back"); }

// H — licence on past Roads
{ const r = JSON.parse(JSON.stringify(road));
  r.archive["21"] = { entries: [{ box: "faa", date: "1 Mar", text: "The FAA licence was issued for Flight 20 only; Flight 21 needs a licence modification." }], summary: { items: [{ box: "cryo", vehicle: "Ship 50", text: "Cryo tested" }, { box: "faa", vehicle: "FAA licence", text: "Waiting on the FAA." }] } };
  const faa = H.pastSummary(r, 21).find((e) => e.box === "faa");
  check(faa && faa.text === "Launch licence issued" && !/pending/i.test(faa.tiers.join(" ")), "H: no issue date known → 'Launch licence issued' with no invented date: " + (faa && faa.text));
  r.box_overrides = { 21: { faa: { latest: "Licence modified 2 Mar" } } };
  check(H.pastSummary(r, 21).find((e) => e.box === "faa").text === "Licence modified 2 Mar", "H: road.box_overrides[n].faa.latest wins");
  const f15 = H.pastSummary(road, 15).find((e) => e.box === "faa");
  check(f15 && !/pending/i.test(f15.text), "H: Flight 15's past Road licence is issued: " + (f15 && f15.text));
  r.archive["22"] = { entries: [{ box: "faa", date: "5 Apr", text: "FAA approval has arrived for Starship Flight 22." }], summary: { items: [{ box: "cryo", vehicle: "Ship 51", text: "Cryo tested" }] } };
  check(H.pastSummary(r, 22).find((e) => e.box === "faa").text === "Launch licence issued 5 Apr", "H: 'approval has arrived for Flight N' uses that entry's own date");
  r.archive["23"] = { entries: [{ box: "faa", date: "6 Apr", text: "FAA approval has arrived for Starship Flight 24." }], summary: { items: [{ box: "cryo", vehicle: "Ship 52", text: "Cryo tested" }] } };
  check(H.pastSummary(r, 23).find((e) => e.box === "faa").text === "Launch licence issued", "H: another flight's approval date is never used"); }

// I — Page 1 past boxes == road.archive[n].summary (entries, text, photos); 15 Nov: no Page 2 group any more
for (const n of [14, 15]) {
  const items = road.archive[n].summary.items.filter((e) => e && e.text && e.vehicle && e.box !== "date"), p1 = H.pastCondensed(H.pastRoadGroup(road, n, FLIGHTS, []));
  const bad = [];
  for (const b of p1) {
    const src = items.filter((e) => e.box === b.box && (b.box === "pad" || b.box === "faa" || e.vehicle === b.vehicle));
    const photos = src.map((e) => e.photo && e.photo.image).filter(Boolean);
    if (!src.length) bad.push(`${b.box}/${b.vehicle}: not in the archive`);
    else if (b.box !== "pad" && b.box !== "faa" && b.text !== src[0].text) bad.push(`${b.box}/${b.vehicle}: text "${b.text}" ≠ archive "${src[0].text}"`);
    if (((b.photo && b.photo.image) || null) !== (photos[0] || null)) bad.push(`${b.box}/${b.vehicle}: photo ${b.photo && b.photo.image} ≠ archive ${photos[0]}`);
  }
  const want = new Set(items.map((e) => (e.box === "pad" || e.box === "faa" ? e.box : `${e.box}|${e.vehicle}`)));
  check(p1.length > 0 && p1.length === want.size && bad.length === 0, `I: Flight ${n}: Page 1's ${p1.length} past boxes = road.archive summary (vehicles, text, photos)${bad.length ? " — " + bad.join("; ") : ""}`);
}
{ const fc = app.slice(app.indexOf("function FlightCard("), app.indexOf("function usePastFit("));
  check(/pastRoadGroup\(road, f\.n, FLIGHTS, ROAD_HIDDEN\)/.test(fc) && /pastCondensed\(group\)/.test(fc) && /past\.map\(\(e, i\) =>/.test(fc) && !/= React\.useMemo\(\(\) => \(isLaunched\(f\.n\) \? pastSummary\(road, f\.n\) : \[\]\), \[road, f\.n\]\)/.test(fc), "I: FlightCard reads pastRoadGroup over road.archive (one list)");
  check(/cardPhotosOf\(f, past, road\)/.test(fc), "I: Page 1 card photos: vehicle photos, else the same archive entries' photos (galleryOf)"); }
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
