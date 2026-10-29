// Offline tests for archiving launched flights' Road entries + milestone summary into the Flight Log (no network).
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode
const fs = require("fs"), os = require("os"), path = require("path");
const road = require("./check-road.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const mk = () => ({ flight: 15, vehicles: ["B22", "S42"], updated: "1 Oct", updatedAt: "2026-10-01T00:00:00Z", categories: road.freshRoad(15).categories });
(() => {
  const r = mk(), C = (id) => r.categories.find((c) => c.id === id);
  C("pad").history = [{ date: "30 Sep", text: "Pad 2 cleared after Flight 14.", src: "NSF", trust: "trusted", flight: 14, at: "2026-09-30T10:00:00Z" }, { date: "9 Oct", text: "Pad 2 chopsticks tested.", src: "NSF", trust: "trusted", flight: 15 }];
  C("faa").history = [{ date: "26 Sep", text: "FAA licence for Flight 14.", src: "FAA", trust: "trusted", flight: 14, media_override: { post_id: "2103953927624356245", image: "x" } }];
  C("cryo").history = [{ date: "15 Oct", text: "Booster 23 completed a cryo proof test.", src: "@StarshipGazer", trust: "trusted", flight: 16 }, { date: "9 Oct", text: "Untagged Ship 42 cryo.", src: "NSF", trust: "trusted" }, { date: "1 Oct", kind: "check", text: "No news yet.", src: "-", trust: "trusted" }];
  const n = road.archiveLaunched(r, 14);
  check(n === 2 && r.archive[14].entries.length === 2 && C("pad").history.length === 1 && C("faa").history.length === 0, "only entries tagged for the launched flight (14) move to the archive");
  check(r.archive[14].entries[0].box === "pad" && r.archive[14].entries[1].box === "faa" && r.archive[14].entries.every((e) => e.text && e.date && !("media_override" in e) && !("x_post" in e)), "archive entries: category, date, text — no pictures; newest first");
  check(C("cryo").history.length === 3, "later flights (B23, Flight 16), untagged entries (= the Road's flight) and check lines stay");
  check(road.archiveLaunched(r, 14) === 0 && r.archive[14].entries.length === 2, "running again changes nothing (idempotent)");
  C("faa").history = [{ date: "26 Sep", text: "FAA licence for Flight 14.", src: "FAA", trust: "trusted", flight: 14 }];
  road.archiveLaunched(r, 14);
  check(r.archive[14].entries.length === 2 && C("faa").history.length === 0, "an entry already archived isn't added twice");
  road.validateRoad(r);
  const bad = JSON.parse(JSON.stringify(r)); bad.archive[14].entries.push({ box: "nope", date: "1 Oct", text: "x" }); let threw = false; try { road.validateRoad(bad); } catch { threw = true; }
  check(threw, "a malformed archive is rejected");
  // rollover keeps earlier archives and carries later-flight cards (run-level checks are in test-road RUN 5)
  const r2 = JSON.parse(JSON.stringify(r)); const m = road.archiveLaunched(r2, 15);
  check(m === 2 && r2.archive[15].entries.length === 2 && r2.archive[14].entries.length === 2 && r2.categories.find((c) => c.id === "cryo").history.map((h) => h.text).join() === "Booster 23 completed a cryo proof test.", "Flight 15 logged: its entries (tagged + untagged) archived, Flight 14's kept, the Flight 16 card stays, check lines go");
})();
(async () => {
  // a normal run archives stragglers for an already-logged flight, with no push
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  live.categories.find((c) => c.id === "pad").history.push({ date: "27 Sep", text: "Flight 14 pad prep done.", src: "NSF", trust: "trusted", flight: 14 });
  fs.writeFileSync(roadPath, JSON.stringify(live)); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
  const sent = [], commits = []; let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-10-17" }, xFirst: { sinceId: "1", seen: [] } };
  await road.run({ xFirst: true, xToken: "", mode: "dry-run", roadPath, appJsPath, sources: [], next: null, askNews: async () => [], askDates: async () => [],
    deps: { loadState: async () => stored, saveState: async (s) => { stored = s; }, push: async (n) => sent.push(n) }, commit: (f, m) => commits.push(m) });
  const out = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  check(out.archive[14].entries.some((e) => e.text === "Flight 14 pad prep done.") && !out.categories.some((c) => c.history.some((h) => h.flight === 14)) && sent.length === 0, "normal run: a launched flight's straggler entry is archived, no push");
  check(out.flight === 15 && out.categories.find((c) => c.id === "cryo").history.some((h) => h.flight === 16), "the Road keeps Flight 15 and the Flight 16 card");
  // app: block between the story and the gallery; the Road page skips launched flights
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const card = app.slice(app.indexOf("function FlightCard("), app.indexOf("function AboutPanel("));
  const iS = card.indexOf('className="story"'), iP = card.indexOf('className="past-sum"'), iG = card.indexOf('className="gallery"'), iH = card.indexOf("highlights-link");
  check(iS > 0 && iS < iP && iP < iG && iG < iH, "Flight Log card order: story → Road summary → 2 photos → highlights");
  check(/past-pill/.test(card) && /past-veh/.test(card) && !/<img|<a |href|PhotoSlot|sources/.test(card.slice(iP, iG)) && !/badge|progress/.test(card.slice(iP, iG)), "summary boxes: vehicle + small category pill, text only — no images, links or sources");
  check(/useState\(false\); \/\/ the Road list starts closed/.test(card) && /className=\{"past-toggle"/.test(card) && /e\.stopPropagation\(\); setPastOpen/.test(card) && /aria-expanded=\{pastOpen\}/.test(card), "collapsible 'Road to Flight N' pill: closed by default, toggles without toggling the flight card");
  check(/\.past-wrap \{ display: grid; grid-template-rows: 0fr; transition/.test(app) && /\.past-toggle\.open \.past-chev \{ transform: rotate\(180deg\)/.test(app), "smooth expand; chevron rotates up when open");
  check(!JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")).categories.some((c) => c.history.some((h) => h.flight === 14)), "the two misfiled Flight 14 notes are back on Flight 15");
  const fnBody = (name) => { const a = app.indexOf(`function ${name}(`); const b = app.indexOf("\nfunction ", a + 10); return app.slice(a, b); };
  check(!/past-|pastSummary/.test(fnBody("NextFlightCard")) && !/past-|pastSummary/.test(fnBody("RoadCard")), "the Next flight card and its Road card never render the Road to Flight pill");
  check(/isLaunched\(f\.n\) \? pastSummary\(road, f\.n\) : \[\]/.test(card), "the pill is only built for flights already in the log");
  { // pastSummary shows only that launched flight's summary items, never its sources
    const src = app.slice(app.indexOf("const PAST_LABEL"), app.indexOf("const isLaunched"));
    const fn = new Function("isRealEntry", "flightOf", "cardTime", src + "; return pastSummary;")();
    const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
    const f14 = fn(live, 14), f15 = fn(live, 15);
    check(f14.length >= 6 && f15.length === 0 && f14.every((e) => e.vehicle && e.text && e.label && e.color && !("sources" in e) && !("src" in e)), "Flight 14 has summary boxes; Flight 15 (next) has none; no sources reach the app");
    check(!/sources/.test(src.replace(/\/\/.*$/gm, "")), "the app never reads the internal sources list");
    const sm = live.archive[14].summary;
    check(["cryo", "raptor", "static"].every((b) => sm.items.filter((e) => e.box === b).length === 2) && Array.isArray(sm.sources) && sm.sources.length >= 6, "Flight 14: Ship + Booster boxes for cryo, Raptor, static fire, with an internal sources list"); }
  check(/isLaunched\(posts\[i\]\.flight\)\) posts\.splice/.test(app), "Road page: launched flights' sections are not shown");
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All archive checks passed."); process.exit(fails ? 1 : 0);
})();
