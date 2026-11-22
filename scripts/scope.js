/* Scope: a Road card's Earlier updates (and the feed items filed to a box) only hold items for the SAME vehicle and flight.
   vehOf("Booster 23 returned…") → ["B23"]; a vehicle's flight comes from road.vehicles (tracked flight) or from
   cards tagged with that hardware and a flight (e.g. B23 → Flight 16). */
const vehOf = (t) => { const out = new Set(); for (const m of String(t || "").matchAll(/\b(?:(B|S)(\d{2,3})|(Booster|Ship)\s+(\d{2,3}))\b/gi)) out.add(((m[1] || m[3])[0]).toUpperCase() + (m[2] || m[4])); return [...out]; };
const hwKey = (s) => String(s || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B").replace(/\s+/g, "");
function flightOfVehicle(road, v) {
  if ((road.vehicles || []).map(hwKey).includes(v)) return road.flight;
  for (const c of road.categories || []) for (const h of c.history || []) if (hwKey(h.hardware) === v && Number.isInteger(h.flight)) return h.flight;
  return null;
}
// A vehicle no card maps yet: if its number is higher than the newest mapped vehicle of its type (B or S), it belongs to a
// LATER flight — newest mapped flight + number offset (B23 = 16 → B24 = 17, S43 = 16 → S44 = 17). Never the tracked flight.
// Returns { flight, inferred } or null (lower/unknown numbers stay unmapped).
function inferFlight(road, v) {
  const known = flightOfVehicle(road, v);
  if (known != null) return { flight: known, inferred: false };
  const m = /^([BS])(\d+)$/.exec(v); if (!m) return null;
  let top = null;
  const see = (k, f) => { const x = /^([BS])(\d+)$/.exec(k); if (x && x[1] === m[1] && Number.isInteger(f) && (!top || +x[2] > top.n)) top = { n: +x[2], f }; };
  for (const k of road.vehicles || []) see(hwKey(k), road.flight);
  for (const c of road.categories || []) for (const h of c.history || []) see(hwKey(h && h.hardware), h && h.flight);
  if (!top || top.f <= road.flight || +m[2] <= top.n) return null; // only past the newest LATER-flight vehicle
  return { flight: top.f + (+m[2] - top.n), inferred: true };
}
// Flown vehicles from app.js FLIGHTS (S40 → Flight 13). Cached; never invents a flight.
let _flown = null;
function flownMap() {
  if (_flown) return _flown;
  _flown = Object.create(null);
  try {
    const fs = require("fs"), path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
    const start = src.indexOf("const FLIGHTS = [");
    const end = src.indexOf("\n];", start);
    const block = start >= 0 && end > start ? src.slice(start, end) : "";
    for (const m of block.matchAll(/\bn:\s*(\d+)\b[\s\S]*?\bbooster:\s*"([^"]*)"[\s\S]*?\bship:\s*"([^"]*)"/g)) {
      const n = Number(m[1]);
      for (const raw of [m[2], m[3]]) {
        const k = hwKey(raw);
        if (/^[BS]\d+$/.test(k)) _flown[k] = n;
      }
    }
  } catch {}
  return _flown;
}
// Batch 1 (22 Nov audit): a line's own words beat the "current flight" default.
//  - an explicit "Flight N" / "Nth flight" decides (the current flight wins if the line names it too);
//  - recap wording ("last week", "their first Starship", "highlights") or a past-tense OUTCOME with no number, while the current flight has not
//    lifted off, belongs to the flight that just flew (road.flight - 1), never to the one being built.
const FLIGHT_NUMS = (t) => [...String(t || "").matchAll(/\b(?:flight\s*(\d{1,3})|(\d{1,3})(?:st|nd|rd|th)\s+(?:starship\s+)?flight)\b/gi)].map((m) => +(m[1] || m[2]));
const RECAP_LEX = /\b(last week|earlier this week|(?:a|one) week ago|a few days ago|(?:their|its|the) first (?:ever )?starship|first (?:ever )?(?:tower |chopstick )?catch|recap|re-?play|highlights?|relive|looking back|throwback|in review)\b/i;
const PAST_OUTCOME = /\b(splashed ?down|caught|was caught|landed|performed (?:a )?(?:safe )?(?:abort|landing|burn)|safe abort|ended its mission|reentered|re-entered|returned to (?:the )?launch site|deployed (?:\w+ )?(?:starlink|satellites))\b/i;
const HEDGE_FUT = /\b(will|plans?|planned|plans to|aims? to|going to|could|may|might|expected|ahead of|next)\b/i;
const liftedOff = (road) => !!(road && road.mission_alerts && road.mission_alerts.flight === road.flight && road.mission_alerts.liftoff_actual);
function feedFlight(road, text, src = "") {
  const both = `${text || ""} ${src || ""}`;
  const nums = FLIGHT_NUMS(both);
  if (nums.length && Number.isInteger(road.flight)) {
    if (nums.includes(road.flight)) return { flight: road.flight };
    const f = Math.max(...nums);
    return { flight: f, other: true, why: `names Flight ${f}` };
  }
  if (Number.isInteger(road.flight) && road.flight > 1 && !liftedOff(road)) {
    const past = (RECAP_LEX.test(both) || (PAST_OUTCOME.test(text || "") && !HEDGE_FUT.test(text || "")));
    if (past && !vehOf(both).some((v) => (road.vehicles || []).map(hwKey).includes(v))) return { flight: road.flight - 1, other: true, why: RECAP_LEX.test(both) ? "recap wording" : "past-tense outcome before liftoff" };
  }
  return feedFlightByHardware(road, text, src);
}
function feedFlightByHardware(road, text, src = "") {
  const vs = vehOf(`${text || ""} ${src || ""}`);
  if (!vs.length) return { flight: road.flight };
  if (vs.some((v) => (road.vehicles || []).map(hwKey).includes(v))) return { flight: road.flight };
  const known = vs.map((v) => flightOfVehicle(road, v)).find((f) => Number.isInteger(f));
  if (known != null) return { flight: known, other: known !== road.flight };
  const inf = vs.map((v) => inferFlight(road, v)).find((x) => x && Number.isInteger(x.flight));
  if (inf) return { flight: inf.flight, other: inf.flight !== road.flight, inferred: !!inf.inferred };
  const flown = vs.map((v) => flownMap()[v]).find((f) => Number.isInteger(f));
  if (flown != null) return { flight: flown, other: flown !== road.flight };
  return { flight: null, other: true };
}
// Which flight an X post classified as a "mission-update" is really about. check-road.js used to apply every one to road.flight.
function missionTarget(road, text, aiFlight) {
  const nums = FLIGHT_NUMS(text);
  if (nums.length) return nums.includes(road.flight) ? { flight: road.flight } : { flight: Math.max(...nums), why: `names Flight ${Math.max(...nums)}` };
  if (Number.isInteger(aiFlight) && aiFlight !== road.flight) return { flight: aiFlight, why: `classifier says Flight ${aiFlight}` };
  if (road.flight > 1 && !liftedOff(road) && (RECAP_LEX.test(text) || (PAST_OUTCOME.test(text) && !HEDGE_FUT.test(text)))) return { flight: road.flight - 1, why: "recap / past-tense outcome" };
  return { flight: road.flight };
}
// "yesterday" / "last night" / "N days ago" in the SOURCE: keep it, and date the item by the day it points to.
const REL_RE = /\b(yesterday|last night|earlier this week|last week|(\d+) days? ago)\b/i; // same-day words ("this morning") are not kept: they would be wrong tomorrow
function relativeMarker(src) { const m = String(src || "").match(REL_RE); return m ? m[1].toLowerCase() : null; }
function resolveRelativeDay(marker, atIso) {
  const t = Date.parse(atIso); if (!marker || !Number.isFinite(t)) return null;
  const back = /yesterday|last night/.test(marker) ? 1 : /(\d+) day/.test(marker) ? +marker.match(/(\d+)/)[1] : null; // "last week" / "earlier this week" are not a single day
  return back == null ? null : new Date(t - back * 86400000).toISOString();
}
// The vehicles a card is about: its hardware, else the vehicles its own text names.
const cardVehicles = (h) => { const k = hwKey(h.hardware); return /^[BS]\d+$/.test(k) ? [k] : vehOf(h.x_text || h.text); };
const cardFlight = (road, h) => (Number.isInteger(h.flight) ? h.flight : road.flight);
// An update belongs on card h when it names none of the vehicles, or one of the card's own, and no other flight's vehicle.
function belongs(road, h, text, flight) {
  if (Number.isInteger(flight) && flight !== cardFlight(road, h)) return false;
  const uv = vehOf(text), cv = cardVehicles(h);
  if (!uv.length) return true;
  if (cv.length) return uv.some((v) => cv.includes(v));
  return uv.every((v) => { const f = flightOfVehicle(road, v); return f == null || f === cardFlight(road, h); });
}
// Data clean-up (runs every checker pass, no push): drop leaked updates from cards; re-tag box-filed feed items
// whose vehicle belongs to another flight. Returns [{ id, text, from, why }].
function enforce(road) {
  const out = [];
  for (const c of road.categories || []) for (const h of c.history || []) {
    if (!Array.isArray(h.updates)) continue;
    const keep = h.updates.filter((u) => belongs(road, h, u && u.text, u && u.flight));
    for (const u of h.updates) if (!keep.includes(u)) out.push({ id: h.id || h.text, text: u.text, from: c.id, why: "other vehicle/flight in Earlier updates" });
    if (keep.length !== h.updates.length) { if (keep.length) h.updates = keep; else delete h.updates; }
  }
  for (const f of road.feed_items || []) {
    if (!f || f.kind === "launch_date") continue;
    const vs = vehOf(f.body); if (!vs.length || vs.some((v) => (road.vehicles || []).map(hwKey).includes(v))) continue;
    const tag = feedFlight(road, f.body), fl = tag.flight;
    if (Number.isInteger(fl)) {
      const other = fl !== road.flight;
      if (f.flight !== fl) { out.push({ id: f.id, text: f.body, from: `feed flight ${f.flight}`, why: `vehicle ${vs.join("/")} is Flight ${fl}` }); f.flight = fl; }
      if (other && (f.box || !f.later_flight)) { if (f.box) out.push({ id: f.id, text: f.body, from: `box ${f.box}`, why: `vehicle ${vs.join("/")} is Flight ${fl}, not filed to a Flight ${road.flight} box` }); delete f.box; f.later_flight = true; }
    } else if (tag.other && (f.flight === road.flight || f.box)) {
      out.push({ id: f.id, text: f.body, from: f.box ? `box ${f.box}` : `feed flight ${f.flight}`, why: `vehicle ${vs.join("/")} is not Flight ${road.flight} hardware` });
      delete f.flight; delete f.box;
    }
  }
  return out;
}
// A box headline (latest) comes from the tracked flight's own vehicles only: a later flight's card (e.g. B23 for Flight 16)
// never heads Flight 15's box. Returns [{ box, from, to }].
function headlines(road) {
  const out = [], own = (h) => h && h.kind !== "check" && (!Number.isInteger(h.flight) || h.flight === road.flight);
  for (const c of road.categories || []) {
    const src = (c.history || []).find((h) => h && h.kind !== "check" && [h.text, h.x_text].includes(c.latest) || (h && String(h.x_text || h.text || "").slice(0, 160) === c.latest));
    if (!src || own(src)) continue;
    const n = (c.history || []).find(own);
    const to = n ? (n.x_text || n.text).slice(0, 160) : "";
    out.push({ box: c.id, from: c.latest, to }); c.latest = to;
  }
  return out;
}
module.exports = { missionTarget, relativeMarker, resolveRelativeDay, FLIGHT_NUMS, RECAP_LEX, PAST_OUTCOME, inferFlight, headlines, vehOf, flightOfVehicle, cardVehicles, belongs, enforce, feedFlight, flownMap };
