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
    if (!f || !f.box) continue;
    const vs = vehOf(f.body); if (!vs.length || vs.some((v) => (road.vehicles || []).map(hwKey).includes(v))) continue;
    const inf = vs.map((v) => inferFlight(road, v)).find((x) => x && Number.isInteger(x.flight)), fl = inf && inf.flight;
    if (fl && fl !== f.flight) { out.push({ id: f.id, text: f.body, from: `feed flight ${f.flight}`, why: `vehicle ${vs.join("/")} is Flight ${fl}` }); f.flight = fl; }
    if (inf && inf.inferred && fl > road.flight && f.box) { out.push({ id: f.id, text: f.body, from: `box ${f.box}`, why: `vehicle ${vs.join("/")} is Flight ${fl}, not filed to a Flight ${road.flight} box` }); delete f.box; f.later_flight = true; }
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
module.exports = { inferFlight, headlines, vehOf, flightOfVehicle, cardVehicles, belongs, enforce };
