// Raptor engines on the Flight Log: one card per vehicle (cleanup.js raptorView), generic for any flight.
const fs = require("fs"), path = require("path");
const C = require("./cleanup.js"), P = require("./purpose.js");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const check = (ok, name) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + name); };
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const T = (date, text, extra = {}) => ({ date, text, log_text: text, src: "@NASASpaceflight", trust: "trusted", tier: 1, ...extra });
const mk = (vehicles, raptor, other = {}) => ({ flight: 16, vehicles, categories: [
  { id: "raptor", name: "Raptor engines", status: "progress", history: raptor },
  { id: "static", name: "Static fires", status: "pending", history: other.static || [] },
  { id: "cryo", name: "Cryo tests", status: "progress", history: other.cryo || [] },
  { id: "pad", name: "Pad activity", status: "progress", history: [] } ] });
const view = (r) => C.flightLogView(r.categories[0], r);
const card = (v, hw) => v.history.find((h) => h.hardware === hw);
const ups = (c) => (c.updates || []).map((u) => u.log_text);

// generic, ship first (B23 / S43, Flight 16)
let r = mk(["B23", "S43"], [
  T("20 Oct", "All six Raptors installed on Ship 43.", { hardware: "S43" }),
  T("18 Oct", "Ship 43 has 4 of 6 Raptors installed.", { hardware: "S43" }),
  T("16 Oct", "Ship 43 has 2 Raptors installed.", { hardware: "S43" }),
  T("12 Oct", "Raptor engines delivered to the Mega Bay for Ship 43.", { hardware: "S43" }),
  T("10 Oct", "Ship 43 could get its engines within two weeks.", { hardware: "S43" }),
  T("8 Oct", "Ship 43 may get its Raptors next month.", { hardware: "S43" }),
  T("15 Oct", "Booster 23 engine installation has begun.", { hardware: "B23" }),
]);
let v = view(r), s = card(v, "S43"), b = card(v, "B23");
check(v.history.length === 2 && s && b, "one card per vehicle, any flight (B23 / S43), ship first");
check(s.log_text === "Ship 43 is getting its Raptors installed." && !s.complete, "install reports alone (even Tier 1/2 'all installed') → still in progress until static fire work");
check(b.log_text === "Booster 23 is getting its Raptors installed." && !b.complete, "install started → '<Vehicle> is getting its Raptors installed.'");
check(ups(s).filter((t) => /Raptors installed/.test(t) && /\d of|\b\d Raptors/.test(t)).length === 1 && ups(s).includes("Ship 43 has 4 of 6 Raptors installed."), "only the latest partial count is kept");
check(ups(s).some((t) => /delivered/.test(t)), "engines delivered / spotted kept under Earlier updates");
check(ups(s).filter((t) => C.isPrediction({ log_text: t })).length === 1 && ups(s).includes("Ship 43 may get its Raptors next month."), "one prediction max (the earliest)");
check(v.latest === s.log_text && v.log_latest === s.log_text, "section summary = the completed card's line");
check(C.vehicleProgress(v, r).done === 0 && C.vehicleProgress(v, r).total === 2, "section shows 0 of 2 (nothing implied yet)");
const A = (() => { const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8"); return app; })();
check(/const ROLLUP_IDS = \["cryo", "raptor", "static"\]/.test(A) && /logGlows\(m, h, road\) \? " glow done" : ""/.test(A), "completed card glows and its dot fills (Raptor matte-black style)");

// both done → section dot fills (rollupStatus over the view)
const LT = require("./log-text.js");
r = mk(["B23", "S43"], [T("20 Oct", "All six Raptors installed on Ship 43.", { hardware: "S43" })], { static: [T("21 Oct", "Ship 43 rolls out to Massey's for its static fire.", { hardware: "S43" }), T("19 Oct", "Booster 23 completed its static fire.", { hardware: "B23" })] });
check(LT.rollupStatus(view(r), r) === "done", "both vehicles in/after static fire work → section done (dot fills)");

// removal after completion un-completes; reinstall restores
r = mk(["B23", "S43"], [T("22 Oct", "Raptor removed from Booster 23 for a swap.", { hardware: "B23" })], { static: [T("19 Oct", "Booster 23 completed its static fire.", { hardware: "B23" })] });
b = card(view(r), "B23");
check(b.log_text === "Booster 23 has a Raptor swapped." && !b.complete, "engines removed later → '<Vehicle> has a Raptor swapped.', not complete");
r.categories[1].history.unshift(T("25 Oct", "Booster 23 rolls back to the pad for another static fire.", { hardware: "B23" }));
b = card(view(r), "B23");
check(!b.complete, "a later static fire rollout does not override a newer swap (earliest implication only)");

// inferred completion (no push: view only)
r = mk(["B23", "S43"], [T("1 Oct", "Booster 23 engine installation has begun.", { hardware: "B23" })],
  { static: [T("20 Oct", "Booster 23 completed a static fire.", { hardware: "B23", milestone: { type: "static_fire", hardware: "B23", phase: "completed" }, complete: true })] });
b = card(view(r), "B23");
check(b.complete && b.assumed && /completed its static fire, so all 33 Raptors are installed/.test(ups(b).join("|")), "completed static fire → assumed installed (internal flag + reason line)");
r.categories[1].history = [T("18 Oct", "Booster 23 rolls to the pad for its static fire.", { hardware: "B23" })];
b = card(view(r), "B23");
check(b.complete && b.assumed && b.inferred && /heading to its static fire/.test(ups(b).join("|")), "rollout for a static fire → installed (inferred)");
r.categories[0].history.unshift(T("21 Oct", "Booster 23 has all 33 Raptors installed.", { hardware: "B23", tier: 2 }));
b = card(view(r), "B23");
check(b.complete && b.inferred, "a later install report keeps it complete (still inferred)");
r.categories[0].history[0].trust = "unconfirmed";
b = card(view(r), "B23");
check(b.assumed, "an unconfirmed source does not upgrade it");
r = mk(["B23", "S43"], [T("2 Oct", "Ship 43 may get its Raptors next month.", { hardware: "S43" })], { cryo: [T("10 Oct", "Ship 43 rolled back to the Mega Bay after cryo testing.", { hardware: "S43" })] });
s = card(view(r), "S43");
check(s.log_text === "Ship 43 is getting its Raptors installed." && !s.complete, "rollback after cryo + Mega Bay time → installation in progress");
r = mk(["B23", "S43"], [T("2 Oct", "Ship 43 may get its Raptors next month.", { hardware: "S43" })]);
s = card(view(r), "S43");
check(s.log_text === "Ship 43 may get its Raptors next month." && !s.updates && !s.complete, "no news yet → its earliest prediction only");

// live data
v = C.flightLogView(live.categories.find((c) => c.id === "raptor"), live);
b = card(v, "B22"); s = card(v, "S42");
check(b && b.complete && b.assumed && b.log_text === "Booster 22 has all 33 Raptors installed.", "live: B22 static fire done → all 33 installed (assumed, no source confirms)");
check(s && !s.complete && s.log_text === "Ship 42 is getting its Raptors installed." && ups(s).some((t) => /removed/.test(t)) && ups(s).some((t) => /reinstalled/.test(t)), "live: S42 in progress (engines removed 30 Sep, reinstall reported 14 Oct)");
check(JSON.stringify(C.flightLogView(v, live)) === JSON.stringify(v), "idempotent");
check(live.categories.find((c) => c.id === "raptor").history.length === 4, "road.json Raptor entries untouched (Road page shows every post)");
const sameDayDup = mk(["B23", "S43"], [T("12 Oct", "Raptors delivered for Ship 43.", { hardware: "S43" }), T("12 Oct", "Raptor engines delivered for Ship 43 today.", { hardware: "S43" }), T("14 Oct", "Ship 43 engine installation has begun.", { hardware: "S43" })]);
check(ups(card(view(sameDayDup), "S43")).filter((t) => /delivered/.test(t)).length === 1, "same-day repeats deduped");

// text rules
const allLines = [...v.history.map((h) => h.log_text), ...v.history.flatMap(ups)];
check(allLines.every((t) => /^[A-Z][^.]*\.$/.test(t) && !/\d{1,2}:\d{2}|\bUK\b|_|<u>/.test(t)), "one short plain sentence per line, no clock times, no underlines");
check(v.history.every((h) => /^\d{1,2}(–\d{1,2})? [A-Z][a-z]{2}$/.test(h.log_date) && (h.updates || []).every((u) => /^(\d{1,2}( [A-Z][a-z]{2})?–)?\d{1,2} [A-Z][a-z]{2}$/.test(u.log_date || u.date))), "single dates only");
check(v.history.every((h) => !h.x_post && !h.media_override) , "Flight Log cards are text only (no picture data)");

// purpose rule: engine work goes to Raptors even at the pad
for (const t of ["Booster 22 Raptor swap at Pad 2.", "Engines removed from Ship 42 at the launch site.", "Raptor engines installed on Booster 22 on the launch mount."])
  check(P.purposeOf(live, { date: "26 Oct", text: t, box: "static" }).box === "raptor", `Raptors, not Static fires / Pad: "${t}"`);
check(/raptor: engine installs, removals and swaps, even at the pad/.test(P.promptRules(live)), "classifier prompt carries the Raptor rule");
console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0);
