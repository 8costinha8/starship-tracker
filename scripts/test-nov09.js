/* 9 Nov batch: the Road Launch date box says just "NET 13 Nov" like the hero (display only: no push, alert, notifications.json
   entry or feed item); "X feed offline" chip on the Road card only while check-road records the X HTTP 402 in data/health.json;
   the S42 Flight Log pad line (12 Sep lift to catch height) stays on the Road pad card under the 7 Nov catch confirmation.
   Offline: node scripts/test-nov09.js */
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(__dirname, "..");
const FL = require("./flightlog.js");
const RC = require("./render-check.js");
const HEALTH = require("./health.js");
const flights = require("./check-flights.js");
const roadMod = require("./check-road.js");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
let pass = 0, fail = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); ok ? pass++ : fail++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const NET = { n: 15, date: "2026-11-13T22:45:00Z" }; // live Launch Library: TBC, MIN, 22:45 UTC (= 22:45 UK in November)
// a top-level function from app.js (same extraction idea as render-check)
const appFn = (name) => { const i = APP.indexOf(`function ${name}(`); const j = APP.indexOf("\n}\n", i); return APP.slice(i, j + 2); };

(async () => {
  // ── 1. Launch date box: "NET 13 Nov", display only
  const r0 = clone(live); delete r0.official_date; const before = JSON.stringify(r0); // 13 Nov: the no-official-date world (live carries a pinned official_date)
  const plain = FL.boxes(r0).date, withNet = FL.boxes(r0, undefined, { net: NET }).date;
  check(withNet.latest === "NET 13 Nov", `box headline with the hero NET: "${withNet.latest}"`);
  check(!/Estimated|unofficial|predict|NSF|Elon|SpaceX|\(/i.test(withNet.latest), "no 'Estimated', source or prediction label");
  check(withNet.status === plain.status && withNet.statusText === plain.statusText && JSON.stringify(withNet.cards) === JSON.stringify(plain.cards), `pill and drawer lines unchanged (${withNet.statusText})`);
  check(JSON.stringify(r0) === before, "boxes() never writes to road.json data");
  check(plain.latest === "No official Flight 15 date yet." && FL.boxes(r0, undefined, {}).date.latest === plain.latest, "checkers (no hero NET passed) see the old headline, so nothing they store or compare changes");
  check(FL.boxes(r0, undefined, { net: { n: 16, date: NET.date } }).date.latest === plain.latest, "a NET for another flight is ignored");
  const off = clone(r0); off.official_date = { at: "2026-11-13T22:45:00Z", text: "SpaceX set Flight 15 for 13 Nov." };
  check(FL.boxes(off, undefined, { net: NET }).date.latest === "SpaceX set Flight 15 for 13 Nov.", "an official date still wins over the hero NET");
  check(FL.boxes(r0, undefined, { net: { n: 15, date: "2026-11-13T23:30:00Z" } }).date.latest === "NET 13 Nov", "late-evening UK time stays on the hero's UK day");
  // the hero only hands its NET over while it shows a NET date itself
  const heroSrc = APP.slice(APP.indexOf("function heroNetFor("), APP.indexOf("\n}\n", APP.indexOf("function heroNetFor(")) + 2);
  const heroNetFor = new Function("effectiveStatus", "nowMs", `${heroSrc}; return heroNetFor;`)((f) => f.status, () => Date.parse("2026-11-09T09:30:00Z"));
  check(JSON.stringify(heroNetFor({ n: 15, status: "net", date: NET.date })) === JSON.stringify(NET) && heroNetFor({ n: 15, status: "tbc", date: NET.date }) === null && heroNetFor(null) === null, "heroNetFor: only a hero NET date is passed to the Road card");
  check(/<RoadCard [^>]*heroNet=\{heroNetFor\(liveNext, now\)\}/.test(APP) && /RoadFlightLog\.boxes\(road, undefined, \{ net: heroNet \|\| null(?:, pending: !!netPending)? \}\)/.test(APP), "app: RoadCard gets the hero NET and passes it to the Flight Log boxes");
  // no checker passes a NET: the stored data, pushes and alerts can't see the new headline
  const writers = fs.readdirSync(__dirname).filter((f) => f.endsWith(".js") && !f.startsWith("test-")).filter((f) => /\.boxes\([^)]*net\s*:/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
  check(writers.length === 0, `no checker script passes a NET to boxes() (${writers.join(", ") || "none"})`);
  const flSrc = fs.readFileSync(path.join(__dirname, "flightlog.js"), "utf8");
  check(!/\bfetch\(|writeFileSync|sendPush|queuePush|addFeedItem|notifications\.json/.test(flSrc), "flightlog.js has no fetch, write, push or feed path");

  // ── 1b. pipeline runs with the live Launch Library state: no push, no feed item, no notifications entry, no alert
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nov09-"));
  const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
  fs.writeFileSync(roadPath, JSON.stringify(live)); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
  const notifBefore = fs.readFileSync(path.join(ROOT, "notifications.json"), "utf8");
  const sent = [], commits = []; let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-11-09" }, xFirst: { sinceId: "1", seen: [] } };
  const next = { n: 15, status: "TBC", precision: "MIN", date: NET.date };
  const logs = [];
  const realLog = console.log, realWarn = console.warn, realErr = console.error;
  console.log = console.warn = console.error = (...a) => { logs.push(a.join(" ")); realLog(...a); }; // capture every line the checker prints
  try {
    for (let i = 0; i < 2; i++) await roadMod.run({ xFirst: true, xToken: "", mode: "dry-run", roadPath, appJsPath, sources: [], next, askNews: async () => [], askDates: async () => [],
      deps: { loadState: async () => stored, saveState: async (s) => { stored = s; }, push: async (n) => sent.push(n) }, commit: (f, m) => commits.push(m) });
  } finally { console.log = realLog; console.warn = realWarn; console.error = realErr; }
  const out = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  check(sent.length === 0, `check-road (live Launch Library TBC 13 Nov 22:45, two runs): no push (${sent.map((n) => n.title).join(" | ") || "none"})`);
  check(!out.predicted && (out.feed_items || []).length === (live.feed_items || []).length && (out.feed_items || [])[0].id === (live.feed_items || [])[0].id, "no prediction created, no feed item added");
  check(fs.readFileSync(path.join(ROOT, "notifications.json"), "utf8") === notifBefore, "notifications.json untouched");
  check(logs.length > 0 && !logs.some((m) => /ALARM|::error::|::warning::Watchdog|predicted date change|→ push/i.test(m)), `no alarm, push line or predicted-date change in ${logs.length} logged lines`);
  check(!commits.some((m) => /predicted|push log/i.test(m)), `no predicted-date or push-log commit (${commits.join(" | ") || "none"})`);
  let ll2 = { name: "Starship | Flight 15", url: "https://ll2.test/15", net: NET.date, net_precision: { abbrev: "MIN" }, status: { abbrev: "TBC" } };
  let fstate = { n: 15, status: "net", date: NET.date, precision: "MIN" }; const fsent = [];
  await flights.run({ fetchJson: async () => ({ results: [ll2] }), loadState: async () => clone(fstate), saveState: async (s) => { fstate = s; }, push: async (n) => fsent.push(n),
    readAppJs: () => "const FLIGHTS = [\n];\n", writeAppJs() {}, commitAndPush() {}, writeStory: async () => ({}), now: () => Date.parse("2026-11-09T09:30:00Z") });
  check(fsent.length === 0, "check-flights with the same Launch Library state: no push");

  // ── 2. "X feed offline" chip
  const xFeedOffline = new Function(`${appFn("xFeedOffline")}; return xFeedOffline;`)();
  const h402 = { scripts: { "check-road": { status: "failed", error: "watchdog: X read failed: HTTP 402 — the checker is blind to X (check the X API plan / bearer token)" } } };
  check(xFeedOffline(h402) === true, "chip ON: check-road failed with the X HTTP 402");
  check(xFeedOffline({ scripts: { "check-road": { status: "ok", error: null } } }) === false, "chip OFF: check-road ok");
  check(xFeedOffline({ scripts: { "check-road": { status: "failed", error: "watchdog: X read failed: HTTP 429" } } }) === false && xFeedOffline({ scripts: { "check-road": { status: "failed", error: "Grok HTTP 402 payment required" } } }) === false, "chip OFF for other failures (X 429, writer 402)");
  check(xFeedOffline(null) === false && xFeedOffline({}) === false, "chip OFF when health.json is missing or empty");
  // the real recorder: 402 run → ON, next good run → OFF on its own (and that change is committed, so the live file clears)
  let h = HEALTH.update(null, "check-road", { ok: false, error: h402.scripts["check-road"].error, now: Date.parse("2026-11-09T09:15:00Z") });
  const on = xFeedOffline(h);
  const h2 = HEALTH.update(h, "check-road", { ok: true, now: Date.parse("2026-11-09T09:30:00Z") });
  check(on === true && xFeedOffline(h2) === false, "health.js: a 402 run turns the chip on; the next good run turns it off");
  check(HEALTH.shouldCommit(h, h2, Date.parse("2026-11-09T09:30:00Z")) === true, "the recovery is committed (status change), so the live data/health.json clears the chip");
  check(/function useXFeedOffline\(\)/.test(APP) && /const xOff = useXFeedOffline\(\)/.test(APP) && /\{xOff && <span className="road-xoff"[^>]*>X feed offline<\/span>\}/.test(APP), "app: the chip renders only when xOff");
  check(!/fetch\(`\$\{HEALTH_URL\}[^`]*`,\s*\{[^}]*method/.test(APP), "app only reads data/health.json (GET)");
  const liveHealth = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "health.json"), "utf8"));
  console.log(`   (repo data/health.json right now → chip ${xFeedOffline(liveHealth) ? "ON" : "OFF"})`);

  // ── 4. pad S42: the 12 Sep Flight Log line stays on the Road card, the 7 Nov confirmation stays its main line
  const v = RC.view(clone(live)), card = v.cards.find((c) => c.id === "rtf-pad-S42");
  check(card && card.when === "7 Nov · 16:11" && /confirmed for a catch attempt/.test(card.text), `Road S42 pad main line kept: ${card && card.when} "${card && card.text}"`);
  check(card && card.rows.some((r) => r.when === "12 Sep · 16:39" && r.text === "Ship 42 was lifted to catch height by the Pad 2 chopsticks."), "12 Sep 16:39 lift to catch height is in the S42 pad drawer");
  check(card && card.rows.some((r) => r.when === "11 Sep · 17:07" && r.text === "Pad 2 chopsticks lifted Ship 42 without the stabiliser arms."), "11 Sep 17:07 lift without stabiliser arms is in the S42 pad drawer");
  const rc = RC.check(clone(live));
  check(!rc.length, `render-check clean on live data${rc.length ? ": " + rc.map((f) => f.msg).join(" | ") : ""}`);
  // pins survive the 12-entry history window, and an entry that is still in history isn't shown twice
  const dup = clone(live); dup.categories.find((c) => c.id === "pad").history.push({ id: "x-2098798758335225974", date: "12 Sep", at: "2026-09-12T15:39:00.000Z", text: "Ship 42 was lifted to catch height by the Pad 2 chopsticks.", url: "https://x.com/TrackingTheSB/status/2098798758335225974", src: "@TrackingTheSB", trust: "trusted", hardware: "S42", flight: 15 });
  const dc = RC.view(dup).cards.find((c) => c.id === "rtf-pad-S42");
  check(dc.rows.filter((r) => /catch height/.test(r.text)).length === 1 && !RC.check(dup).length, "same post in history and pins → one drawer row, render-check clean");
  const b22 = v.cards.find((c) => c.id === "rtf-pad-B22");
  check(b22 && [b22.when, ...b22.rows.map((r) => r.when)].filter((w) => w === "26 Oct · 04:43").length === 1, "B22 26 Oct pinned pad line shown once");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
