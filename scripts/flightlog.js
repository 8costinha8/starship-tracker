/* Flight Log "Road to Flight N" boxes (the app's Flight Log card; the Road to Flight social page keeps everything).
   General rule, every flight, ships and boosters alike:
   - Cryo tests, Raptor engines, Static fires show ONLY completed milestones. Moves, rollouts, prep, frost and other
     details, forecasts and duplicates stay on the Road to Flight page.
   - Each box has one sub-card per vehicle (Ship N first, then Booster N). A card's top line is its latest step;
     the rest sit behind "Earlier updates", newest first. Each line: day ("9 Oct", or a range "3–4 Sep") plus a
     24h UK time only when one is sourced, then the text.
   - Raptor engines: "<Vehicle> ready with all 6 / 33 Raptors", dated the day the vehicle headed to its static fire
     (the inferred rule), no time; no removals, reinstall reports or arrivals.
   - Pad activity is not milestone-filtered: per-vehicle cards plus a "Launch pad" card, only for the flight's own
     pad (road.pad), no transport moves. In progress until the wet dress rehearsal is done; then Done, WDR headline.
   - FAA licence: the headline is always the official status ("<today> No Flight N licence yet" until issued);
     creators' / news posts about the licence go in Earlier updates. Issued → headline with its date, box Done.
   - Launch date: headline "<today> No official Flight N date yet" until SpaceX or the FAA sets one
     (road.official_date); reports and predictions go in Earlier updates. Official → headline, box Done.
   Agreed lines can be pinned in road.flightlog_pins {flight, as_of, boxes: {id: {cards: [{vehicle, lines}]}}}:
   the classifier never changes them; anything newer than as_of is still added automatically on top.
   Node: require("./flightlog.js"). Browser: <script src="scripts/flightlog.js"> after cleanup.js → window.RoadFlightLog. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./cleanup.js"));
  else root.RoadFlightLog = factory(root.RoadCleanup);
})(typeof self !== "undefined" ? self : this, function (C) {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PAD_TEST_DONE = /\b(?:complet\w*|conduct\w*|perform\w*|finish\w*)\b.*\b(?:test\w*|wet dress|wdr|spin[- ]?prime|cryo|static fire|propellant load\w*)\b|\b(?:test\w*|wet dress|wdr|spin[- ]?prime)\b.*\b(?:complet\w*|done|finished)\b/i;
  const DONE_LABEL = { cryo: "Complete", raptor: "Installed", static: "Complete", pad: "Complete", faa: "Confirmed", date: "Confirmed" }; // finished-status pill per box (same map as app.js ROAD_DONE_LABEL)
  const vName = (v) => (v === "pad" ? "Launch pad" : (v[0] === "S" ? "Ship " : "Booster ") + v.slice(1));
  const txt = (h) => String((h && (h.log_text || h.text)) || "").replace(/^\d{1,2}(?:[–-]\d{1,2})? [A-Z][a-z]{2}:\s*/, "").trim();
  const hw = (h) => { const m = String((h.milestone && h.milestone.hardware) || h.hardware || "").match(/^\s*(?:Ship\s*|S)(\d+)|^\s*(?:Booster\s*|B)(\d+)/i); return m ? (m[1] ? "S" + m[1] : "B" + m[2]) : null; };
  const dayOf = (h) => String(h.log_date || (String(h.date || "").match(/^(\d{1,2}(?: [A-Z][a-z]{2})?\s*[–-]\s*)?\d{1,2} [A-Z][a-z]{2}/) || [""])[0]).replace(/\s*[-–]\s*/g, "–");
  const ukDay = (iso) => { const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ""; const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(d).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };
  const ukTime = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) : ""; };
  const sortKey = (l) => Date.parse(l.at || "") || C.dayNum({ log_date: String(l.day || "").split("–").pop(), at: l.at }) + (l.time ? Number(l.time.slice(0, 2)) * 36e5 + Number(l.time.slice(3)) * 6e4 : 0);
  const newestFirst = (a) => a.slice().sort((x, y) => sortKey(y) - sortKey(x));
  const TRANSPORT = /^(?:Ship|Booster) \d+ (?:rolled|rolls|left|leaves|arriv\w*|returned|returns|moved|heads?|headed|was lowered|lowered|is in Megabay|back at|lifted onto (?:a |the )?transport)/i;
  const FORECAST = /\b(could|may|might|expected|likely|plans? to|reportedly|waiting)\b|no test confirmed/i;
  const ENGINE_EVENT = { cryo: /\bcryo|proof test/i, static: /static[- ]?fire|\bfired\b/i };
  const allLines = (road, id) => {
    const c = (road.categories || []).find((x) => x.id === id), out = [];
    for (const h of (c && c.history) || []) {
      if (!h || h.kind === "check" || h.trust === "unconfirmed" || (Number.isInteger(h.flight) && h.flight !== road.flight)) continue;
      out.push({ h, card: h });
      for (const u of h.updates || []) if (u && u.text && u.trust !== "unconfirmed") out.push({ h: u, card: h });
    }
    return out.map(({ h, card }) => ({ text: txt(h), day: dayOf(h) || ukDay(h.at || h.publishedAt), time: h.log_time || "", at: h.at || h.publishedAt || "", url: h.url || "", hw: hw(h) || hw(card), card }));
  };
  const vehicleOf = (l, vs) => { const n = C.named(l.text).filter((v) => vs.includes(v)); const other = C.named(l.text).filter((v) => !vs.includes(v)); if (other.length && !n.length) return null; return n.length === 1 ? n[0] : !n.length ? l.hw : null; };
  const isDone = (l, sec) => ENGINE_EVENT[sec].test(l.text) && /\b(complet\w*|conduct\w*|perform\w*|finish\w*|fired)\b/i.test(l.text) && !FORECAST.test(l.text) && !/\bboth\b/i.test(l.text);
  function collapse(lines) { // one completion per day per engine count (several posts about the same test)
    const out = [];
    for (const l of lines) {
      const k = (l.text.match(/\b\d+\b(?=[- ](?:engine|Raptor))|\ball \d+\b|\b\d+ Raptors?\b/i) || [""])[0].replace(/\D/g, "");
      const same = out.findIndex((o) => o.day.split("–").pop() === l.day.split("–").pop() && (o._k === k || !o._k || !k));
      if (same < 0) out.push({ ...l, _k: k }); else if (!out[same]._k && k) out[same] = { ...l, _k: k };
    }
    return out.map(({ _k, ...l }) => l);
  }
  function dedupe(lines) { const seen = new Set(); return lines.filter((l) => { const k = l.day.split("–").pop() + "|" + l.text.toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; }); }
  function vehicles(road) { return [...(road.vehicles || [])].map((v) => String(v).toUpperCase()).sort((a, b) => (a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a[0] === "S" ? -1 : 1)); }
  // Automatic lines per box (used for any flight, and on top of pins for anything newer than the pin's as_of).
  function autoCards(road, id) {
    const vs = vehicles(road);
    const by = Object.fromEntries([...vs, "pad"].map((v) => [v, []]));
    if (id === "cryo" || id === "static") {
      for (const l of allLines(road, id)) { const v = vehicleOf(l, vs); if (v && by[v] && isDone(l, id)) by[v].push(l); }
    } else if (id === "raptor") {
      for (const v of vs) {
        const inf = road.inferred && road.inferred[v] && road.inferred[v].raptor;
        const sf = allLines(road, "static").filter((l) => vehicleOf(l, vs) === v && /roll(?:s|ed)? (?:out )?to|heads? to|headed to|rolled out/i.test(l.text)).sort((a, b) => sortKey(a) - sortKey(b))[0];
        const day = sf ? sf.day.split("–").pop() : inf && inf.date;
        if (day) by[v].push({ day, time: "", text: `${vName(v)} ready with all ${v[0] === "S" ? 6 : 33} Raptors.`, at: sf ? sf.at : "" });
      }
    } else if (id === "pad") {
      const pad = String(road.pad || "Pad 2");
      for (const l of allLines(road, "pad")) {
        const pads = (l.text.match(/\bPad[- ]?\d\b/gi) || []).map((p) => p.replace(/[- ]/, " "));
        if (pads.some((p) => p.toLowerCase() !== pad.toLowerCase())) continue; // another pad
        if (TRANSPORT.test(l.text) || FORECAST.test(l.text)) continue;
        const named = C.named(l.text);
        const v = named.length ? vehicleOf(l, vs) : "pad";
        if (v && by[v]) by[v].push(l);
      }
    } else if (id === "faa" || id === "date") {
      for (const l of allLines(road, id)) if (id !== "faa" || new RegExp(`Flight ${road.flight}\\b`).test(l.text)) by.pad.push(l);
    }
    return by;
  }
  function boxes(road, today = ukDay(new Date().toISOString())) {
    if (!road || !Array.isArray(road.categories)) return {};
    const vs = vehicles(road), n = road.flight;
    const pins = road.flightlog_pins && Number(road.flightlog_pins.flight) === Number(n) ? road.flightlog_pins : null;
    const asOf = pins && Date.parse(pins.as_of || "") || 0;
    const out = {};
    for (const c of road.categories) {
      const id = c.id, auto = autoCards(road, id), pinned = pins && pins.boxes && pins.boxes[id];
      const cardLines = (v) => {
        const p = pinned ? ((pinned.cards || []).find((k) => k.vehicle === v) || { lines: [] }).lines : null;
        const extra = (auto[v] || []).filter((l) => !p || sortKey(l) > asOf + 86400000);
        const all = dedupe(newestFirst([...(p || []), ...extra]));
        return id === "cryo" || id === "static" ? collapse(all) : all;
      };
      let cards, status, statusText, latest;
      if (id === "faa" || id === "date") {
        const lic = road.milestones && road.milestones.flight && road.milestones.flight.licence;
        const off = id === "faa" ? (lic && lic.dates && lic.dates.length ? { at: lic.dates[lic.dates.length - 1], text: `FAA licence issued for Flight ${n}.`, url: (lic.src || [])[0] } : null) : road.official_date || null;
        const head = off ? { day: off.day || ukDay(off.at), time: off.time || (off.at && /T\d/.test(off.at) ? ukTime(off.at) : ""), text: off.text || `Flight ${n} is set for ${off.day || ukDay(off.at)}.`, url: off.url || "" }
          : { day: today, time: "", text: id === "faa" ? `No Flight ${n} licence yet.` : `No official Flight ${n} date yet.` };
        cards = [{ vehicle: id, name: id === "faa" ? "FAA licence" : "Launch date", lines: [head, ...cardLines("pad")] }];
        // three states: ○ none / ◐ progress / ● done. FAA: Not yet / Confirmed (no half). Launch date: Not confirmed /
        // Estimated (an unofficial NET date exists: road.predicted) / Confirmed (SpaceX's official date)
        const est = id === "date" && !off && road.predicted && road.predicted.net;
        status = off ? "done" : est ? "progress" : "none"; statusText = off ? DONE_LABEL[id] : est ? "Estimated" : id === "faa" ? "Not yet" : "Not confirmed"; latest = est ? `Estimated NET ${ukDay(road.predicted.net + "T12:00:00Z")}.` : head.text;
      } else {
        const keys = id === "pad" ? [...vs, "pad"] : vs;
        cards = keys.map((v) => ({ vehicle: v, name: vName(v), lines: cardLines(v) })).filter((k) => k.lines.length);
        if (id === "pad") {
          const wdr = road.milestones && road.milestones.flight && road.milestones.flight.wdr;
          // half only once a pad TEST is completed (prep, moves and tower work show in the cards but never move the circle)
          const tested = cards.some((k) => k.lines.some((l) => PAD_TEST_DONE.test(l.text) && !FORECAST.test(l.text)));
          status = wdr ? "done" : tested ? "progress" : "none"; statusText = wdr ? DONE_LABEL[id] : tested ? "In progress" : "Not yet";
          latest = wdr ? `Wet dress rehearsal done.` : tested ? `${road.pad || "Pad"} tests in progress.` : cards.length ? `${road.pad || "Pad"} work under way.` : "Nothing reported yet"; // short: box heads stay one size
        } else {
          const done = vs.filter((v) => cards.some((k) => k.vehicle === v));
          status = vs.length && done.length === vs.length ? "done" : done.length ? "progress" : "none";
          statusText = status === "done" ? DONE_LABEL[id] : status === "progress" ? "In progress" : "Not yet";
          const what = { cryo: "cryo tests", raptor: "Raptors installed", static: "static fires" }[id] || c.name;
          latest = status === "done" ? (vs.length > 1 ? "Both vehicles done." : `${vName(vs[0])} done.`) : done.length ? `${done.map(vName).join(" and ")} done.` : "Nothing reported yet"; void what;
        }
      }
      out[id] = { id, status, statusText, latest, cards };
    }
    return out;
  }
  const RULES = `Flight Log boxes (app): Cryo tests, Raptor engines and Static fires show only COMPLETED milestones per vehicle (Ship first, then Booster); moves, rollouts, prep, frost, forecasts and duplicates stay on the Road to Flight page only. Pad activity keeps per-vehicle pad tests plus a Launch pad card for the flight's own pad only, no transport; it is Done when the wet dress rehearsal is done. FAA licence and Launch date headlines are the official status; reports and predictions are Earlier updates.`;
  return { boxes, autoCards, vehicles, RULES, ukDay, ukTime };
});
