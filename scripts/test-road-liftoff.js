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
const H = eval(`(() => {\n${app.slice(start, end)}\nreturn { boxOverrides, roadLiftedOff, stackedHeadline, afterLiftoffLatest, afterLiftoffFlog, decorateFlogItem, filterRoadFlogEvents, isRoadFlightEvent, roadLiftoffMs, roadEntryMs, rtfCategoryVehicles, orderPadFlogCards }; })()`);

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

// flight events excluded from Road boxes
{ const deploy = { text: "Ship 42 deployed twenty six V3 Starlink satellites and closed its payload bay door.", at: "2026-11-14T00:06:57.000Z" };
  check(H.isRoadFlightEvent(deploy, live), "post-liftoff deploy line is a Road flight event (excluded)");
  const orbit = { text: "Ship 42 passed the first Hawaii return window and will stay in orbit.", at: "2026-11-14T00:04:43.000Z" };
  check(H.isRoadFlightEvent(orbit, live), "post-liftoff orbit line is excluded from Road boxes");
  const stack = { text: "Ship 42 stacked on Booster 22 at Pad 2.", at: "2026-11-12T22:21:48.000Z" };
  check(!H.isRoadFlightEvent(stack, live), "pre-liftoff stack line stays on the pad card");
  const sqd = { text: "Ship 42 has the SQD connected at the pad.", at: "2026-11-13T01:32:37.000Z" };
  check(!H.isRoadFlightEvent(sqd, live), "pre-liftoff pad work stays on the pad card");
  const afterChop = { text: "Pad 2 chopsticks raised back after inspection.", at: "2026-11-14T06:42:24.000Z" };
  check(H.isRoadFlightEvent(afterChop, live), "anything dated after liftoff_actual is excluded from Road boxes");
  const pad = (live.categories || []).find((c) => c.id === "pad") || { history: [] };
  const kept = (pad.history || []).filter((h) => !H.isRoadFlightEvent(h, live));
  check(kept.some((h) => /stacked on Booster 22/i.test(h.text || h.card_text || "")), "after filtering, the genuine stacked pad line remains");
  check(!kept.some((h) => /deployed twenty six/i.test(h.text || h.card_text || "")), "the deploy line is not kept as a pad entry");
  check(H.stackedHeadline(live) === "Stacked 13 Nov", "Launch pad complete headline is the factual stacked date");
  const filtered = H.filterRoadFlogEvents(fl.boxes(live).pad, live);
  const texts = (filtered.cards || []).flatMap((c) => (c.lines || []).map((l) => l.text || ""));
  check(!texts.some((t) => /chopsticks raised back|deployed twenty six/i.test(t)), "Road pad cards drop post-liftoff and flight-event lines");
  check(texts.some((t) => /SQD connected|chopsticks opening for launch|stacked/i.test(t)), "Road pad cards keep the last genuine pre-liftoff pad lines");
  const decorated = H.decorateFlogItem({ id: "pad" }, fl.boxes(live).pad, live, null, { n: 15, status: "inflight" }, POST);
  const dtexts = ((decorated.flog && decorated.flog.cards) || []).flatMap((c) => (c.lines || []).map((l) => l.text || ""));
  check(!dtexts.some((t) => /chopsticks raised back|deployed twenty six/i.test(t)), "decorateFlogItem also excludes post-liftoff lines from Road boxes");
  check(decorated.flog.latest === "Stacked 13 Nov", "decorated pad headline stays the factual stacked date");
}

// Pad activity: Launch pad first, then Ship, then Booster — never by date
check(JSON.stringify(H.rtfCategoryVehicles("pad", ["S42", "B22"])) === JSON.stringify(["pad", "S42", "B22"]), "rtfCategoryVehicles: Launch pad, Ship, Booster");
check(JSON.stringify(H.rtfCategoryVehicles("cryo", ["S42", "B22"])) === JSON.stringify(["S42", "B22"]), "non-pad categories keep Ship then Booster");
check(/rtfCategoryVehicles\(cid, cols\)/.test(app), "rtfCards uses the fixed Launch-pad-first vehicle order");
{
  const oldestPad = [
    { vehicle: "S42", name: "Ship 42", lines: [{ at: "2026-11-14T12:00:00Z", text: "ship newest" }] },
    { vehicle: "B22", name: "Booster 22", lines: [{ at: "2026-11-13T12:00:00Z", text: "boo mid" }] },
    { vehicle: "pad", name: "Launch pad", lines: [{ at: "2026-11-10T00:00:00Z", text: "pad oldest" }] },
  ];
  check(H.orderPadFlogCards(oldestPad).map((c) => c.vehicle).join(",") === "pad,S42,B22", "pad first even when its date is oldest");
  const newestPad = [
    { vehicle: "S42", name: "Ship 42", lines: [{ at: "2026-11-10T00:00:00Z", text: "ship oldest" }] },
    { vehicle: "pad", name: "Launch pad", lines: [{ at: "2026-11-14T18:00:00Z", text: "pad newest" }] },
    { vehicle: "B22", name: "Booster 22", lines: [{ at: "2026-11-13T12:00:00Z", text: "boo mid" }] },
  ];
  check(H.orderPadFlogCards(newestPad).map((c) => c.vehicle).join(",") === "pad,S42,B22", "pad first even when its date is newest");
  const decorated = H.decorateFlogItem({ id: "pad" }, fl.boxes(live).pad, live, null, { n: 15, status: "inflight" }, POST);
  const order = ((decorated.flog && decorated.flog.cards) || []).map((c) => c.vehicle);
  check(order[0] === "pad" && order.indexOf("S42") < order.indexOf("B22"), "decorated live Pad card keeps Launch pad first, then Ship, then Booster");
}


console.log(fails ? `\n${fails} FAILED` : "\n✅ All road-liftoff checks passed.");
process.exit(fails ? 1 : 0);
