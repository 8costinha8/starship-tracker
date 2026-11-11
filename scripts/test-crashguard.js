/* Display only: empty-vehicle preview roads must not crash rtfCards; a thrown
   card is contained by ErrorBoundary; the mission_card blurb is hidden after
   liftoff for any flight.  node scripts/test-crashguard.js */
const fs = require("fs"), path = require("path"), RC = require("./render-check.js");
let pass = 0, fail = 0;
const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const srcFn = (name) => { const i = APP.indexOf(`function ${name}(`); return i < 0 ? "" : APP.slice(i, APP.indexOf("\n}\n", i) + 2); };

// 1. guards exist and never match on undefined
check(/function isVehId\(/.test(APP) && /function roadVehicles\(/.test(APP)
  && /!isVehId\(v\) \? "Launch pad" : ship && v === ship/.test(APP)
  && /\[ship, boo\]\.filter\(isVehId\)/.test(APP),
  "vname and the rtfCards vehicle loop guard against undefined (no undefined === ship)");
check(/class ErrorBoundary/.test(APP) && /componentDidCatch/.test(APP)
  && /root\.render\(<ErrorBoundary where="app">/.test(APP)
  && /where=\{\"feed:" \+ r\.post\.id\}/.test(APP)
  && /where=\{\"feed:" \+ c\.id\}/.test(APP),
  "ErrorBoundary wraps the app root and each feed card");

// 2. empty-vehicles preview roads for flights 16/17/18 do not throw
function emptyRoad(n) {
  return {
    flight: n, vehicles: [], categories: [
      { id: "cryo", name: "Cryo tests", history: [] },
      { id: "raptor", name: "Raptor", history: [] },
      { id: "static", name: "Static fires", history: [] },
      { id: "pad", name: "Pad activity", history: [] },
      { id: "date", name: "Launch date", history: [] },
      { id: "faa", name: "FAA licence", history: [] },
    ], feed_items: [],
  };
}
function dirtyRoad(n) {
  const r = emptyRoad(n);
  r.vehicles = [undefined, null, "", "S99"];
  return r;
}

let threw = [];
for (const n of [16, 17, 18]) {
  try { RC.view(emptyRoad(n)); } catch (e) { threw.push(`view ${n}: ${e.message}`); }
  try { RC.view(dirtyRoad(n)); } catch (e) { threw.push(`dirty ${n}: ${e.message}`); }
  try {
    const cards = RC.view(emptyRoad(n)).cards;
    if (!Array.isArray(cards)) threw.push(`rtfCards ${n}: not an array`);
  } catch (e) { threw.push(`rtfCards ${n}: ${e.message}`); }
}
check(threw.length === 0, `empty-vehicles preview roads for 16/17/18 do not throw (${threw.join("; ") || "ok"})`);

// also a Flight 16 road peeking at 17 (the D4 case): no vehicles for 17
try {
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  // synthetic rolled-over road: flight 16 with 16's vehicles only
  const rolled = { ...live, flight: 16, vehicles: ["B23", "S43"], hardware_flights: { ...(live.hardware_flights || {}), B23: 16, S43: 16 } };
  const fnsNeed = ["rtfCards", "roadForFlight"];
  // Use rtfCards via appFns (roadForFlight may not be exported). Build peek by hand:
  const peek17 = { ...rolled, flight: 17, vehicles: [] };
  RC.view(peek17);
  RC.appFns().rtfCards(peek17);
  check(true, "a Flight 16→17 empty preview (the D4 rollover case) does not throw");
} catch (e) {
  check(false, `a Flight 16→17 empty preview (the D4 rollover case) does not throw (${e.message})`);
}

// 3. ErrorBoundary contains a thrown child and logs it
const ebSrc = APP.slice(APP.indexOf("class ErrorBoundary"), APP.indexOf("const root = ReactDOM"));
const logs = [];
const fakeConsole = { error(...a) { logs.push(a.map(String).join(" ")); } };
function runBoundary() {
  const React = { Component: class { constructor(props) { this.props = props; this.state = {}; } setState(s) { this.state = Object.assign({}, this.state, s); } } };
  // eslint-disable-next-line no-new-func
  const EB = new Function("React", "console", ebSrc + "\nreturn ErrorBoundary;")(React, fakeConsole);
  const b = new EB({ where: "feed:test", children: "ok" });
  b.state = { error: null };
  const before = b.render();
  const derived = EB.getDerivedStateFromError(new Error("card boom"));
  b.state = derived;
  b.componentDidCatch(new Error("card boom"), { componentStack: "at FeedPost" });
  const after = b.render();
  return { before, after, derived, logs: logs.slice() };
}
const eb = runBoundary();
check(eb.derived && eb.derived.error && eb.after == null && eb.before === "ok",
  "a thrown card is contained: the boundary renders null instead of escaping");
check(eb.logs.some((l) => /feed:test/.test(l) && /card boom/.test(l)),
  "the boundary logs the failure to the console");

// 4. mission_card blurb is hidden after liftoff, for a synthetic flight (any N)
const start = APP.indexOf("// --- mission-card helpers");
const end = APP.indexOf("// --- end mission-card helpers");
const helpers = eval(`(() => {\n${APP.slice(start, end)}\nreturn { missionCardText, showMissionCard, fillMissionCard }; })()`);
const syn = { mission_card: { 17: "Flight 17 is Starship's next flight, expected NET {NET}." } };
check(helpers.showMissionCard(syn, 17) === true, "synthetic Flight 17 blurb is shown before liftoff");
check(helpers.showMissionCard(syn, 17, { n: 17, status: "inflight" }) === false, "blurb is hidden once the hero is in flight (T+)");
check(helpers.showMissionCard(syn, 17, { n: 17, status: "done" }) === false, "blurb is hidden once the hero is complete / success");
check(helpers.showMissionCard({ ...syn, launched: { flight: 17, at: "2026-12-01T00:00:00Z" } }, 17) === false,
  "blurb is hidden when road.launched records that flight");
check(helpers.showMissionCard(syn, 17, { n: 16, status: "done" }) === true,
  "a different flight being complete does not hide this flight's blurb");
check(!/\bNumber\(n\) === 15\b/.test(srcFn("showMissionCard")) && !/missionCardText\(road, 15\)/.test(srcFn("showMissionCard")),
  "showMissionCard has no hard-coded flight number");

console.log(fail ? `❌ ${fail} failed, ${pass} passed` : `✅ All crashguard checks passed (${pass}).`);
process.exit(fail ? 1 : 0);
