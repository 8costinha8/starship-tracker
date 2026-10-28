// Flight Log boxes: completed milestones only, per-vehicle sub-cards, pins, official FAA/date headlines.
// Uses fake future flights (17, 18) plus the pinned Flight 15 data. Never sends anything.
const assert = require("assert");
const F = require("./flightlog.js");
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const cat = (id, history) => ({ id, name: id, status: "progress", history });
const fake = (flight, extra = {}) => ({ flight, vehicles: ["B30", "S50"], pad: "Pad 1", inferred: { S50: { raptor: { date: "5 Mar" } }, B30: { raptor: { date: "7 Mar" } } }, categories: [
  cat("cryo", [
    { date: "2 Feb", text: "Ship 50 completed its first cryo proof test.", log_time: "10:15", at: "2027-02-02T10:15:00Z" },
    { date: "3 Feb", text: "Ship 50 rolled to Massey's for cryo testing.", at: "2027-02-03T08:00:00Z" },
    { date: "4 Feb", text: "Frost seen on Ship 50 at Massey's.", at: "2027-02-04T08:00:00Z" },
    { date: "6 Feb", text: "Booster 30 could complete cryo testing this week.", at: "2027-02-06T08:00:00Z" },
    { date: "8 Feb", text: "Booster 30 completed its cryo proof test.", at: "2027-02-08T08:00:00Z", updates: [{ date: "8 Feb", text: "Booster 30 completed cryo proof testing at Massey's." }] }]),
  cat("raptor", [{ date: "1 Mar", text: "Raptor removed from Ship 50 for inspection." }]),
  cat("static", [
    { date: "6 Mar", text: "Booster 30 rolled to Pad 1 for its static fire.", at: "2027-03-06T08:00:00Z" },
    { date: "7 Mar", text: "Booster 30 completed a full-duration 33-engine static fire.", log_time: "15:00", at: "2027-03-07T15:00:00Z" }]),
  cat("pad", [
    { date: "1 Mar", text: "Pad 2 tank farm work continues.", at: "2027-03-01T08:00:00Z" },
    { date: "2 Mar", text: "Pad 1 chopsticks catch tests at the tower top.", at: "2027-03-02T08:00:00Z" },
    { date: "3 Mar", text: "Ship 50 rolled to the launch site.", at: "2027-03-03T08:00:00Z" },
    { date: "4 Mar", text: "Ship 50 lifted by the Pad 1 chopsticks for catch tests.", at: "2027-03-04T08:00:00Z" }]),
  cat("faa", [{ date: "9 Mar", text: "Reports say the Flight 17 licence could come next week.", at: "2027-03-09T08:00:00Z" }]),
  cat("date", [{ date: "10 Mar", text: "Flight 17 could launch NET 20 March.", at: "2027-03-10T08:00:00Z" }])], ...extra });

let b = F.boxes(fake(17), "11 Mar");
ok(b.cryo.cards.map((c) => c.name).join() === "Ship 50,Booster 30", "Ship first, then Booster");
ok(b.cryo.cards[0].lines.length === 1 && b.cryo.cards[0].lines[0].time === "10:15", "cryo: completion only, with its time");
ok(b.cryo.cards[1].lines.length === 1 && /completed/.test(b.cryo.cards[1].lines[0].text), "cryo: forecast + duplicate dropped");
ok(b.cryo.status === "done", "cryo done when every vehicle completed");
ok(b.raptor.cards[1].lines[0].day === "6 Mar" && /all 33 Raptors/.test(b.raptor.cards[1].lines[0].text), "raptor: ready the day it headed to static fire");
ok(b.raptor.cards[0].lines[0].day === "5 Mar" && /all 6 Raptors/.test(b.raptor.cards[0].lines[0].text) && !b.raptor.cards[0].lines.some((l) => /removed/.test(l.text)), "raptor: no removals");
ok(b.static.status === "progress" && b.static.cards.length === 1 && b.static.cards[0].lines.length === 1, "static: only the fire, ship not yet");
ok(b.pad.cards.map((c) => c.name).join() === "Ship 50,Launch pad" && !JSON.stringify(b.pad).includes("Pad 2") && !JSON.stringify(b.pad).includes("rolled"), "pad: own pad only, no transport");
ok(b.pad.status === "progress" && b.pad.statusText === "In progress", "pad in progress before the WDR");
ok(b.faa.cards[0].lines[0].day === "11 Mar" && /No Flight 17 licence yet/.test(b.faa.cards[0].lines[0].text) && b.faa.cards[0].lines.length === 2 && b.faa.statusText === "Not yet", "faa: official status headline, reports earlier");
ok(/No official Flight 17 date yet/.test(b.date.latest) && b.date.statusText === "Not confirmed" && /NET 20 March/.test(b.date.cards[0].lines[1].text), "date: official headline, predictions earlier");
b = F.boxes(fake(18, { milestones: { flight: { wdr: { dates: ["2027-03-12T05:00:00Z"] }, licence: { dates: ["2027-03-13T17:30:00Z"], src: ["https://faa.gov"] } } }, official_date: { day: "20 Mar", time: "23:00", text: "SpaceX set Flight 18 for 20 Mar." } }), "14 Mar");
ok(b.pad.status === "done" && /Wet dress/.test(b.pad.latest), "pad done with WDR headline");
ok(b.faa.status === "done" && b.faa.cards[0].lines[0].day === "13 Mar" && b.faa.cards[0].lines[0].time === "17:30", "faa issued → headline with date and time");
ok(b.date.status === "done" && b.date.cards[0].lines[0].text === "SpaceX set Flight 18 for 20 Mar.", "official date → headline, Done");
// pins: Flight 15 agreed lines are fixed; newer auto lines still added; pins ignored for other flights
const road = require("../road.json");
b = F.boxes(road, "28 Oct");
const L = (id, v) => (b[id].cards.find((c) => c.vehicle === v) || { lines: [] }).lines.map((l) => (l.time ? `${l.day} · ${l.time}` : l.day) + " " + l.text);
ok(L("cryo", "S42").join("|") === "9 Oct · 21:30 Ship 42 completed its third cryo proof test.|3–4 Sep · 09:59 Two back-to-back cryo proof tests.", "S42 cryo pinned");
ok(L("cryo", "B22").join("|") === "9–10 Sep · 08:02 Booster 22 completed its first full cryo proof test.", "B22 cryo pinned");
ok(L("raptor", "S42")[0] === "26 Oct Ship 42 ready with all 6 Raptors." && L("raptor", "B22")[0] === "24 Oct Booster 22 ready with all 33 Raptors.", "raptor pinned");
ok(L("static", "S42").length === 2 && L("static", "B22").join() === "25 Oct · 13:22 Booster 22 completed a full-duration 33-engine static fire.", "static pinned");
ok(L("pad", "pad").length === 6 && L("pad", "S42").length === 3 && L("pad", "B22").length === 1, "pad pinned cards");
ok(L("faa", "faa").join() === "28 Oct No Flight 15 licence yet." && L("date", "date").length === 6 && /^20 Oct On SpaceX's Q3 call/.test(L("date", "date")[1]), "faa/date headline today + earlier");
const later = JSON.parse(JSON.stringify(road));
later.categories.find((c) => c.id === "pad").history.unshift({ date: "30 Oct", text: "Pad 2 chopsticks catch tests at the tower top.", at: "2026-10-30T09:00:00Z" });
ok(F.boxes(later, "30 Oct").pad.cards.find((c) => c.vehicle === "pad").lines[0].day === "30 Oct", "newer auto line added over pins");
later.flight = 16; ok(!F.boxes(later).cryo.cards.some((c) => /third cryo proof/.test(c.lines.map((l) => l.text).join())), "pins only for their flight");
// wiring: app renders sub-cards, browser loads the module, prompt carries the rules
const fs = require("fs"), app = fs.readFileSync(__dirname + "/../app.js", "utf8"), idx = fs.readFileSync(__dirname + "/../index.html", "utf8");
ok(/window\.RoadFlightLog\.boxes\(road\)/.test(app) && /function FlogCard/.test(app) && /src="scripts\/flightlog\.js"/.test(idx), "app wiring");
ok(require("./purpose.js").promptRules({ flight: 15, categories: [] }).includes(F.RULES), "writer prompt has the rules");
console.log(`test-flightlog: ${n} passed`);
