/* Flight N -> N+1 handover, shared by the app (window.RoadHandover) and the checker (check-road.js).
   One source for the things both sides must agree on:
     GRACE_MS          the top card keeps a launched flight this long after liftoff (app DONE_GRACE_MS);
                       the Road rolls over at the same moment, never earlier
     summarize(road)   the launched flight's Flight Log summary: every completed milestone per vehicle
                       (the Flight Log boxes, scripts/flightlog.js), deduped, past-tense full sentences,
                       each with the real photo of its post when there is one
     syncStatuses(road) every box's status / latest / log_latest from the Flight Log boxes, so a pill,
                       its headline and road.json never contradict each other
     roll(old, lastN)  the new Road as the app shows it the moment the hero moves on (before the checker's
                       own rollover lands): fresh boxes, later flights' cards and vehicles carried, summary frozen */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./flightlog.js"));
  else root.RoadHandover = factory(root.RoadFlightLog);
})(typeof self !== "undefined" ? self : this, function (FL) {
  const GRACE_MS = 2 * 60 * 60 * 1000;
  const NO_PHOTO = ["images/rtf-placeholder.jpg"];
  const BOX_ORDER = ["cryo", "raptor", "static", "pad", "faa", "date"];
  const sentence = (t) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/[\s.;,]*$/, ".") : ""; };
  const key = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const photoOf = (h) => { const m = h && h.media_override; if (!m || !m.image || NO_PHOTO.includes(m.image) || /^https?:\/\/(?:video\.twimg|.*\.mp4)/.test(m.image)) return null;
    return { image: m.image, ...(m.post_url ? { post_url: m.post_url } : {}), ...(m.author ? { author: String(m.author).replace(/^@/, "") } : {}), ...(m.crop ? { crop: m.crop } : {}) }; };
  // newest photo of that box naming the vehicle (lines with no post of their own, e.g. "ready with all 6 Raptors")
  const vehiclePhoto = (road, id, v) => { if (!/^[BS]\d+$/.test(v)) return null; const n = v.slice(1), re = new RegExp(`\\b(?:${v[0] === "S" ? "Ship\\s*|S" : "Booster\\s*|B"})${n}\\b`, "i");
    const c = road.categories.find((x) => x.id === id); const list = ((c && c.history) || []).filter((h) => h.kind !== "check" && h.trust !== "unconfirmed" && re.test(`${h.hardware || ""} ${h.text || ""}`) && photoOf(h));
    list.sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0)); return list.length ? photoOf(list[0]) : null; };
  // The launched flight's summary: one item per box per vehicle, every completed milestone (newest last), deduped.
  function summarize(road) {
    if (!FL || !road || !Array.isArray(road.categories)) return null;
    const boxes = FL.boxes(road), items = [], byUrl = {};
    for (const c of road.categories) for (const h of c.history || []) { if (h.url) byUrl[h.url] = byUrl[h.url] || h; const pu = h.media_override && h.media_override.post_url; if (pu) byUrl[pu] = byUrl[pu] || h; }
    for (const id of BOX_ORDER) {
      const b = boxes[id]; if (!b) continue;
      if ((id === "faa" || id === "date") && b.status !== "done") continue; // "no licence yet" is not a milestone
      for (const card of b.cards || []) {
        const seen = new Set(), lines = [];
        for (const l of (card.lines || []).slice().reverse()) { const s = sentence(l.text), k = key(s); if (!s || seen.has(k)) continue; seen.add(k); lines.push({ s, l }); }
        if (!lines.length) continue;
        let text = ""; for (const { s } of lines.slice().reverse()) { const t = text ? `${s} ${text}` : s; if (t.length > 120) break; text = t; } // newest first, as many full sentences as fit
        if (!text) text = lines[lines.length - 1].s.slice(0, 119).replace(/\s+\S*$/, "") + ".";
        const pic = lines.slice().reverse().map(({ l }) => photoOf(l.card) || photoOf(byUrl[l.url])).find(Boolean) || vehiclePhoto(road, id, card.vehicle);
        items.push({ box: id, vehicle: card.name, text, ...(pic ? { photo: pic } : {}) });
      }
    }
    return items.length ? { items, auto: true } : null;
  }
  // Box status, headline and overview line from the Flight Log boxes (the pills' own source).
  function syncStatuses(road) {
    if (!FL || !road || !Array.isArray(road.categories)) return road;
    const boxes = FL.boxes(road);
    for (const c of road.categories) { const b = boxes[c.id]; if (!b) continue;
      c.status = c.id === "date" && b.status === "done" ? "done" : b.status; c.latest = b.latest; c.log_latest = b.latest; }
    return road;
  }
  const hwKey = (s) => String(s || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B").replace(/\s+/g, "");
  const laterOnly = (h, lastN, oldV) => h && h.kind !== "check" && ((Number.isInteger(h.flight) && h.flight > lastN) || (!Number.isInteger(h.flight) && h.hardware && /^[BS]\d+$/.test(hwKey(h.hardware)) && !oldV.has(hwKey(h.hardware)) && false));
  // The Road the app shows once the hero has moved on to flight lastN + 1 (the checker's rollover does the same, plus archiving).
  function roll(old, lastN, { updatedAt, updated } = {}) {
    if (!old || !Array.isArray(old.categories) || !(old.flight <= lastN)) return old;
    const n = lastN + 1, oldV = new Set((old.vehicles || []).map(hwKey));
    const arch = JSON.parse(JSON.stringify(old.archive || {}));
    if (!(arch[old.flight] && arch[old.flight].summary)) { const sm = summarize(old); if (sm) arch[old.flight] = { ...(arch[old.flight] || { entries: [] }), summary: sm }; }
    const road = { flight: n, vehicles: [], updated: updated || old.updated, updatedAt: updatedAt || old.updatedAt, rolled_client: true,
      categories: old.categories.map((c) => { const later = (c.history || []).filter((h) => laterOnly(h, lastN, oldV));
        return { ...c, status: "none", latest: later.length ? String(later[0].x_text || later[0].text).slice(0, 160) : "Nothing reported yet", log_latest: undefined, history: later }; }) };
    if (Object.keys(arch).length) road.archive = arch;
    const carry = Object.fromEntries(Object.entries(old.milestones || {}).filter(([k]) => k !== "flight" && !oldV.has(k)));
    if (Object.keys(carry).length) road.milestones = carry;
    const vs = new Set();
    for (const c of road.categories) for (const h of c.history) { const k = h.hardware && hwKey(h.hardware); if (k && /^[BS]\d+$/.test(k) && !oldV.has(k)) vs.add(k); }
    for (const k of Object.keys(carry)) if (/^[BS]\d+$/.test(k)) vs.add(k);
    road.vehicles = [...vs].sort((x, y) => (x[0] === y[0] ? x.slice(1) - y.slice(1) : x[0] === "B" ? -1 : 1));
    if (old.predicted && Number(old.predicted.flight) === n) road.predicted = old.predicted;
    const mu = Object.fromEntries(Object.entries(old.mission_updates || {}).filter(([k]) => Number(k) > lastN));
    if (Object.keys(mu).length) road.mission_updates = mu;
    for (const k of ["feed_items", "image_cache", "hardware_flights", "rejected_lines"]) if (old[k] !== undefined) road[k] = old[k];
    return syncStatuses(road);
  }
  // True once the top card has moved past flight n (logged and the grace period is over).
  const heroPast = (liftoffIso, now) => { const t = Date.parse(liftoffIso || ""); return !Number.isFinite(t) || now - t >= GRACE_MS; };
  return { GRACE_MS, summarize, syncStatuses, roll, heroPast, sentence };
});
