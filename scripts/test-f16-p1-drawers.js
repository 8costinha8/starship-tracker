#!/usr/bin/env node
/* Every Page 1 category, for every flight in road.json, renders in pill format or the empty state.
   Past flights: no Road shows fewer vehicle/category entries than production. */
"use strict";
const fs = require("fs");
const path = require("path");
const RR = require("./review-rules.js");
const flog = require("./flightlog.js");
const ROOT = path.join(__dirname, "..");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-sources.json"), "utf8"));
const lox = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-lox-feed-item.json"), "utf8"));
const extra = lox.feed_item ? [lox.feed_item] : [lox];
const { road, pills } = RR.applyToRoad(structuredClone(live), { sources, extraFeedItems: extra, log: () => {} });

const fails = [];
function check(cond, msg) { if (!cond) { fails.push(msg); console.log("FAIL " + msg); } else console.log("ok   " + msg); }

const BOXES = (live.categories || []).map((c) => c.id);
const flights = new Set([live.flight, ...Object.keys(live.archive || {}).map(Number)]);

function vehKey(name) {
  const s = String(name || "").trim();
  const m = s.match(/^(Ship|Booster)\s+(\d+)$/i);
  if (m) return (m[1][0].toUpperCase() === "S" ? "S" : "B") + m[2];
  if (/^[SB]\d+$/i.test(s)) return s.toUpperCase();
  if (/pad|launch pad/i.test(s)) return "PAD";
  if (/faa/i.test(s)) return "FAA";
  if (/launch date/i.test(s)) return "DATE";
  return s;
}

function prodEntries(n) {
  if (n === live.flight) {
    // current flight: one heading per vehicle (or pad) that has history, plus empty cats
    return (live.categories || []).flatMap((c) => {
      const vehs = new Set();
      for (const h of c.history || []) {
        if (h.kind === "check") continue;
        const hw = String(h.hardware || "").replace(/^Booster\s*/i, "B").replace(/^Ship\s*/i, "S");
        if (/^[SB]\d+$/.test(hw)) vehs.add(hw);
        else if (c.id === "pad") vehs.add("PAD");
      }
      if (!vehs.size && (c.latest && !/^nothing reported|^no /i.test(c.latest))) vehs.add(c.id.toUpperCase());
      return [...vehs].map((v) => c.id + "|" + v);
    });
  }
  const arch = live.archive && live.archive[String(n)];
  if (!arch || !arch.summary) return [];
  return (arch.summary.items || []).filter((it) => it.box !== "date").map((it) => it.box + "|" + vehKey(it.vehicle));
}

function previewEntries(n) {
  const out = new Set();
  for (const p of pills) {
    if (Number(p.flight) === Number(n)) out.add(p.box + "|" + p.vehicleId);
  }
  // kept production cards (no pill for that box+vehicle)
  for (const key of prodEntries(n)) {
    const [box, veh] = key.split("|");
    const has = pills.some((p) => p.box === box && p.vehicleId === veh && Number(p.flight) === Number(n));
    if (!has) out.add(key);
  }
  return [...out];
}

for (const p of pills) {
  check(p.vehicle && p.label && p.text, "pill has heading, label, text: " + p.id);
  const dateLabel = /^(Round \d+ · |From |\d{1,2}(?:–\d{1,2})?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/;
  check(dateLabel.test(p.label), "pill label is Round N · range, From date, or a date label: " + p.id + " " + p.label);
  if (p.box === "faa" || p.box === "date" || p.box === "pad") {
    check(!/^Round \d+/.test(p.label), "FAA/date/pad pills are date-labelled, not Round N: " + p.id + " " + p.label);
  }
  check(p.links === 1 || (!!p.url && !Array.isArray(p.url)), "pill has exactly one link field: " + p.id);
  check(!p.image && !p.media_override && !p.x_post && !p.photo, "pill is text-only (no image fields): " + p.id);
  check(!/Megabay/i.test(p.text + p.label + p.vehicle), "pill Mega Bay spelling: " + p.id);
}

const upcoming = road.flight;
for (const box of BOXES) {
  const list = pills.filter((p) => p.box === box && Number(p.flight) === Number(upcoming));
  if (!list.length) {
    check(true, "F" + upcoming + " " + box + ": empty state (no pills) — upcoming flight only");
  } else {
    check(list.every((p) => p.vehicle && p.label && p.text), "F" + upcoming + " " + box + ": " + list.length + " pill(s) in format (upcoming flight)");
  }
}
for (const n of [...flights].sort((a, b) => b - a)) {
  const prod = new Set(prodEntries(n));
  const prev = new Set(previewEntries(n));
  const missing = [...prod].filter((k) => !prev.has(k));
  check(missing.length === 0, "B/C: F" + n + " Road is not missing production entries: " + (missing.join(", ") || "none") + " (prod " + prod.size + " prev " + prev.size + ")");
}

const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const fn = src.slice(src.indexOf("function ReviewPills"), src.indexOf("function RoadCard"));
check(!/<img/i.test(fn), "ReviewPills has no <img>");
check(/className="past-sum"/.test(src) && /past\.map\(\(e, i\)/.test(src), "A: past-flight Road uses production past-sum + past.map cards");
check(!/<div className="past-review">/.test(src.slice(src.indexOf("function FlightCard"), src.indexOf("function PastText")>-1?src.indexOf("function PastText"):src.length)), "A: FlightCard past-sum does not wrap a .past-review pill stack");
check(/font-family:\s*inherit/.test(src.slice(src.indexOf(".rev-pill-text"))), "E: pill text inherits Manrope (no system-ui)");
const pastFn = src.slice(src.indexOf("function FlightCard"), src.indexOf("function PastText") > 0 ? src.indexOf("function PastText") : src.indexOf("function FlightCard")+8000);
check(!/ReviewPills/.test(pastFn) && /past-sum/.test(pastFn), "C: past-flight Road (FlightCard) renders production past-sum, no ReviewPills");
check(!/href=\{p\.url\}/.test(src.slice(src.indexOf("function ReviewPills"), src.indexOf("function RoadCard"))), "Page 1 ReviewPills have no external href");


if (fails.length) { console.error("\n" + fails.length + " failure(s)"); process.exit(1); }
console.log("\nAll F16 Page 1 drawer checks passed.");
