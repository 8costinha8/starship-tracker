// Post-liftoff Road boxes (tracker-2026-11-14-herotrim). Display-only in app.js.
// No network, no pushes: node scripts/test-road-liftoff.js
const fs = require("fs"), path = require("path");
const fl = require("./flightlog.js");
const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };

const start = app.indexOf("// --- road-liftoff helpers");
const end = app.indexOf("// --- end road-liftoff helpers ---");
check(start > 0 && end > start, "app.js has the road-liftoff helper block");

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function ukParts(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { day: Number(p.day), mon: MON3[Number(p.month) - 1], year: Number(p.year), time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}
function nowMs() { return Date.now(); }
function effectiveStatus(f) { return f && f.status; }
function launchDateDisplay(flogDate) { return flogDate; }
function flogPadDisplay(flogPad) { return flogPad; }
function faaLicenceDisplay(flogFaa) { return flogFaa; }
function authoritativeNetLabel() { return ""; }
const ROAD_DONE_LABEL = { cryo: "Complete", raptor: "Installed", static: "Complete", pad: "Complete", faa: "Confirmed", date: "Confirmed" };
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { boxOverrides, roadLiftedOff, stackedHeadline, afterLiftoffLatest, afterLiftoffFlog, decorateFlogItem }; })()`);

const clone = () => JSON.parse(JSON.stringify(live));
const IDS = ["cryo", "raptor", "static", "pad", "faa", "date"];
function applyAll(road, f, now) {
  const b = fl.boxes(road);
  const out = {};
  for (const id of IDS) out[id] = H.afterLiftoffFlog(b[id], id, road, f, now);
  return out;
}
const isClosed = (b) => b && (b.status === "done" || b.status === "complete");
const PRE = Date.parse("2026-11-13T20:00:00Z");
const POST = Date.parse("2026-11-14T09:20:00Z");

// pre-launch unchanged
{ const r = clone(); if (r.mission_alerts) r.mission_alerts.liftoff_actual = null;
  const raw = fl.boxes(r);
  const got = applyAll(r, { n: 15, status: "confirmed" }, PRE);
  const same = IDS.every((id) => got[id].status === raw[id].status && got[id].statusText === raw[id].statusText && got[id].latest === raw[id].latest);
  check(same, "pre-launch: Flight Log boxes are unchanged");
  check(got.pad.status === "progress" && /tests in progress/i.test(got.pad.latest), "pre-launch: pad stays In progress (no WDR)");
}

// post-liftoff all complete
{ const got = applyAll(live, { n: 15, status: "inflight" }, POST);
  check(IDS.every((id) => isClosed(got[id])), "post-liftoff: every box is complete (6 of 6)");
  check(got.pad.status === "done" && got.pad.statusText === "Complete", "post-liftoff: pad pill is Complete");
  check(got.pad.latest === "Stacked 13 Nov", "post-liftoff: pad headline is the factual stacked date");
  check(!/wet dress|wdr/i.test(got.pad.latest), "post-liftoff: no WDR text is invented");
}

// liftoff_actual in the future (clock before T-0) stays pre-launch
{ const got = applyAll(live, { n: 15, status: "confirmed" }, PRE);
  check(got.pad.status === "progress", "clock before liftoff_actual: pad is not forced complete");
}

// inflight status without liftoff_actual still completes
{ const r = clone(); if (r.mission_alerts) r.mission_alerts.liftoff_actual = null;
  const got = applyAll(r, { n: 15, status: "inflight" }, POST);
  check(IDS.every((id) => isClosed(got[id])), "hero inflight without liftoff_actual: all boxes complete");
}

// override wins: keep pad open after liftoff
{ const r = clone();
  r.box_overrides = { 15: { pad: { status: "progress", statusText: "In progress", latest: "Pad 2 tests in progress." } } };
  const got = applyAll(r, { n: 15, status: "inflight" }, POST);
  check(got.pad.status === "progress" && got.pad.latest === "Pad 2 tests in progress.", "override wins: pad can stay in progress after liftoff");
  check(["cryo", "raptor", "static", "faa", "date"].every((id) => isClosed(got[id])), "override is per-box: other boxes still complete");
}

// override wins: force pad complete before launch, with a chosen factual line
{ const r = clone(); if (r.mission_alerts) r.mission_alerts.liftoff_actual = null;
  r.box_overrides = { 15: { pad: { status: "done", statusText: "Complete", latest: "Stacked 10 Nov" } } };
  const got = applyAll(r, { n: 15, status: "net" }, PRE);
  check(got.pad.status === "done" && got.pad.latest === "Stacked 10 Nov", "override wins: pad can be marked complete before launch");
}

// no stack dates → neutral wording, still no WDR
{ const r = clone(); r.milestones = { flight: {} }; r.categories = (r.categories || []).map((c) => c.id === "pad" ? { ...c, history: [] } : c);
  check(H.stackedHeadline(r) === "", "no stacked date available → empty headline helper");
  check(H.afterLiftoffLatest({ latest: "Pad 2 tests in progress." }, "pad", r) === "Pad activity complete.", "no factual stack line: neutral 'Pad activity complete.'");
  check(!/wet dress|wdr/i.test(H.afterLiftoffLatest({}, "pad", r)), "neutral wording invents no WDR");
}

check(/setInterval\(load, LD \? 1000 : 15000\)/.test(app), "LL2 polling timer is unchanged");
check(!/\.auto-note/.test(app) && !/Auto-updating · last checked/.test(app), "auto-updating line and its CSS are gone");

console.log(fails ? `\n${fails} FAILED` : "\n✅ All road-liftoff checks passed.");
process.exit(fails ? 1 : 0);
