/* Road display model, shared by the app (browser global RoadCards) and the scripts/tests (require).
   Generic for EVERY milestone section and EVERY flight; nothing here knows about Cryo.
   - one card per vehicle (hardware) inside a section; lines with no vehicle go to one site card
   - a card is Completed once a Tier 1/2, unhedged, confirmed line says the step is completed
   - a section is Completed when all its cards are, In progress with any real activity, else Expected
   - timeline newest first; same-day near-duplicates merged (newest wording kept), repeats dropped */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.RoadCards = factory(); })(this, function () {
  const PHASES = ["expected", "progress", "completed"];
  const hwKey = (s) => String(s || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B").replace(/\s+/g, "");
  const vehicleName = (k, raw) => (/^S\d+$/.test(k) ? `Ship ${k.slice(1)}` : /^B\d+$/.test(k) ? `Booster ${k.slice(1)}` : /^PAD(\d+)$/.test(k) ? `Pad ${k.slice(3)}` : raw || k);
  const vehiclesIn = (t) => [...new Set([...String(t || "").matchAll(/\b(Ship|Booster|S|B)[\s-]?(\d{2,3})\b/g)].map((m) => (m[1][0] === "S" ? "S" : "B") + Number(m[2])))];
  const RUMOUR = /\b(rumou?rs?|reportedly|hearing|speculat\w*|possibly|maybe|might|could|may|hopefully|unconfirmed|allegedly|apparently|potentially|likely)\b|\?/i;
  // same wording rules as the writer/migration: words about plans stay Expected
  function phaseOfText(text) {
    if (RUMOUR.test(text) || /\b(ahead of|waiting|ready for|estimate|suggests|targeting|NET|expected|planned|needs?)\b/i.test(text)) return "expected";
    if (/\b(complete[sd]?|finished|passed|issued|after (its|their|a few days of)\b[^.]*\b(test|testing|proof)\w*)/i.test(text)) return "completed";
    return "progress";
  }
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  function dayMs(label, year) { // "9–10 Sep" / "30 Sep–2 Oct" → last day, noon UTC
    const m = String(label || "").match(/(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?\s*$/) || String(label || "").match(/–(\d{1,2}) ([A-Z][a-z]{2})/);
    if (!m || !(m[2] in MON)) return 0;
    return Date.UTC(Number(m[3]) || year, MON[m[2]], Number(m[1]), 12);
  }
  // Road cards show ONE date, no clock time: the start day of a range ("9–10 Sep" → "9 Sep", "30 Sep–2 Oct" → "30 Sep"),
  // unless the source gave a clear completion day (line.doneOn)
  function cardDate(label) {
    const t = String(label || "").trim(), a = t.match(/^(\d{1,2})\s*[–-]\s*\d{1,2} ([A-Z][a-z]{2})/), b = t.match(/^(\d{1,2} [A-Z][a-z]{2})\s*[–-]/), c = t.match(/^(\d{1,2} [A-Z][a-z]{2})/);
    return a ? `${Number(a[1])} ${a[2]}` : b ? b[1] : c ? c[1].replace(/^0/, "") : t.replace(/,?\s*\d{1,2}:\d{2}.*$/, "");
  }
  // Copy lint for timeline sentences (the writer prompt has the same rules)
  function lintCopy(text) {
    const t = String(text || ""), out = [];
    const d = t.match(/\b(\w+)\s+\1\b/i); if (d && !/^(that|had|\d+)$/i.test(d[1])) out.push(`doubled word "${d[0]}"`);
    if (/\bit's\s+(own|first|second|third|fourth|last|next|static|cryo|engines?|raptors?|test\w*|ride|way\b(?! to)|launch|flight|pad|tower|stand|move|rollout|return|chopsticks)/i.test(t)) out.push(`"it's" used for "its"`);
    if (/\bis been\b/i.test(t)) out.push('"is been"');
    if (/\b\w+'s (completes|completed|heads|rolls|rolled|begins|began|moves|moved)\b/i.test(t)) out.push("possessive before the verb (\"Ship 42's completes\")");
    if (/\b(is|are|was|were|has been|have been) being (transported|moved|rolled|taken)\b|\bhas been transported\b/i.test(t)) out.push("filler wording");
    if (/\d{1,2}:\d{2}|\b\d{1,2}\s*[–-]\s*\d{1,2} [A-Z][a-z]{2}\b/.test(t)) out.push("time or date range in the sentence");
    if (!/^[A-Z0-9]/.test(t) || !/[.!]$/.test(t.trim())) out.push("not one plain sentence");
    const r = t.match(/\b(\w{4,}ed)\s+(has|have|had|was)\s+\1\b/i); if (r) out.push(`repeated verb "${r[0]}"`);
    if (/\s{2,}|\s[.,]/.test(t)) out.push("stray spacing");
    return out;
  }
  // Typical durations (real Starship flow) for inferring that a step is finished when nobody says "complete".
  // done: wording that shows the vehicle left the test (rolled back, returned) → the step is over.
  // maxDays: the step normally takes at most this long; once that much time (+ grace) has passed AND the
  // vehicle has been seen doing something later in another section, the step is taken as finished.
  const DURATIONS = {
    cryo:   { what: "cryo testing", span: "1–3 days", maxDays: 3, grace: 4, where: "Massey's", done: /\b(roll(ed|s|ing)? back|rolled|returned|returning|back (at|in|to) (the )?(Mega ?Bay|production|build site|Sanchez)|(left|leaves|after returning from) (the )?Massey)/i },
    static: { what: "static fire testing", span: "a few days", maxDays: 5, grace: 5, where: "the pad", done: /\b(roll(ed|s|ing)? back|returned|returning|back (at|in|to) (the )?(Mega ?Bay|production|build site))/i },
    pad:    null, // pad work has no fixed length
    raptor: { what: "Raptor installation", span: "up to two weeks", maxDays: 14, grace: 7, done: /\b(engines? (are )?(all )?(installed|in)|all engines in)\b/i },
  };
  const DAY = 86400000;
  // Numbered instances (boxes) inside a vehicle card: one per test or event run. A new box starts when a line
  // signals a new run ("heads back", "another", "further", "again", "second"…) or comes after the step's usual
  // window; otherwise the line updates the current box (its newest sentence is shown).
  const NOUN = { cryo: "Cryo test", static: "Static fire", raptor: "Raptor install", pad: "Pad work", faa: "Licence update", date: "Date update" };
  const PLACE_DEFAULT = { cryo: "Massey's" };
  const NEW_RUN = /\b(heads? back|went back|goes back|back (to|at) (the )?(Massey|pad|stand|cryo)|another|further|again|second|third|fourth|next|new|first)\b/i;
  function placeOf(text, sectionId) {
    const m = String(text || "").match(/\b(Massey'?s|Mega ?Bay ?\d|Pad ?[12AB]|Starfactory|Gigabay|launch site|production site|the tower)\b/i);
    return m ? m[1].replace(/^massey'?s$/i, "Massey's").replace(/^Mega ?Bay ?(\d)$/i, "Mega Bay $1").replace(/^Pad ?(\w)$/i, "Pad $1") : PLACE_DEFAULT[sectionId] || null;
  }
  function boxesOf(lines, sectionId, rule) { // lines newest first → boxes newest first, numbered #1 = oldest
    const asc = [...lines].reverse(), win = ((rule && rule.maxDays) || 3) + ((rule && rule.grace) || 4), out = [];
    for (const l of asc) {
      const cur = out[out.length - 1];
      const fresh = !cur || l.at - cur.start > win * DAY || (NEW_RUN.test(l.text) && !l.reason && !(cur.lines.length === 1 && cur.lines[0].at === l.at));
      if (fresh) out.push({ start: l.at, lines: [l] }); else cur.lines.push(l);
    }
    return out.map((b, i) => { const top = b.lines[b.lines.length - 1];
      const done = b.lines.some((l) => l.phase === "completed" && counts(l));
      return { n: i + 1, title: `${NOUN[sectionId] || "Update"} #${i + 1}`, date: b.lines[0].shown, place: placeOf(b.lines[0].text, sectionId) || placeOf(b.lines.map((l) => l.text).join(" "), sectionId),
        text: top.text, line: top, lines: b.lines.slice().reverse(), completed: done, assumed: done && b.lines.filter((l) => l.phase === "completed" && counts(l)).every((l) => l.assumed) }; }).reverse();
  }
  const words = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  function similar(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return false; let n = 0; A.forEach((w) => B.has(w) && n++); return n / Math.min(A.size, B.size) >= 0.7; }
  const flightOfEntry = (h, road) => (Number.isInteger(h.flight) ? h.flight : h.milestone && Number.isInteger(h.milestone.flight) ? h.milestone.flight : road.flight);
  function mediaOf(h) {
    const mo = h.media_override;
    if (mo && mo.image && !mo.credit_only) return { image: mo.image, type: mo.type, post_url: mo.post_url, author: mo.author };
    const m = h.x_post && Array.isArray(h.x_post.media) && h.x_post.media[0];
    if (m) return { image: m.type === "video" ? m.poster : m.url, type: m.type, post_url: h.x_post.url, author: h.x_post.author && h.x_post.author.username };
    if (mo && mo.image) return { image: mo.image, type: mo.type, post_url: mo.post_url, author: mo.author, credit_only: true };
    return null;
  }
  function linesOf(h, road, year) {
    const base = { flight: flightOfEntry(h, road), entry: h };
    const own = h.x_text || h.text || "";
    const phase = (p, t) => (phaseOfText(t) === "completed" ? "completed" : PHASES.includes(p) ? p : phaseOfText(t)); // a "completed"/"completes" line is a completion line
    const head = { ...base, date: h.date, at: Date.parse(h.at || h.publishedAt || "") || dayMs(h.date, year), text: own, url: h.url || (h.x_post && h.x_post.url), src: h.src,
      tier: h.tier || 2, hedged: !!h.hedged || RUMOUR.test(own), unconfirmed: h.trust === "unconfirmed",
      phase: phase(h.milestone && h.milestone.phase, own), media: mediaOf(h), head: true, pushed: !!h.push, assumed: !!h.assumed, type: h.milestone && h.milestone.type, hardware: (h.milestone && h.milestone.hardware) || h.hardware };
    const ups = (Array.isArray(h.updates) ? h.updates : []).filter((u) => u && u.text).map((u) => ({ ...base, date: u.date, at: Date.parse(u.at || "") || dayMs(u.date, year), text: u.text, url: u.url, src: u.src,
      tier: u.tier || 2, hedged: RUMOUR.test(u.text), unconfirmed: false, phase: phase(u.phase, u.text), media: u.media || null, pushed: !!u.push, type: head.type, hardware: u.hardware || head.hardware }));
    return [head, ...ups];
  }
  const FLIGHT_LEVEL = ["launch_date", "licence"]; // milestones of the flight itself: one card per section
  const counts = (l) => l.tier <= 2 && !l.hedged && !l.unconfirmed; // speculation never moves anything
  // cards for one section (road.json category) and one flight
  function sectionCards(box, road, flight) {
    const year = new Date(road.updatedAt || Date.now()).getUTCFullYear();
    const all = (box.history || []).filter((h) => h && h.kind !== "check" && !h.demo).flatMap((h) => linesOf(h, road, year)).filter((l) => l.flight === flight);
    const cards = new Map();
    for (const l of all) {
      const pm = /\b(Pad|Tower) ?([A-Z0-9]?)\b/i.exec(l.text), k = hwKey(l.hardware) || (pm ? hwKey(pm[0]) : null), named = vehiclesIn(l.text);
      const keys = FLIGHT_LEVEL.includes(l.type) ? ["SITE"] : named.length > 1 ? named : k ? [k] : named.length ? named : ["SITE"]; // a line about two vehicles goes on both cards
      for (const key of keys) {
        if (!cards.has(key)) cards.set(key, { key, name: key === "SITE" ? box.name : vehicleName(key, l.hardware), section: box.id, flight, lines: [] });
        cards.get(key).lines.push(l);
      }
    }
    const out = [...cards.values()].map((c) => {
      c.lines.sort((a, b) => b.at - a.at);
      const kept = [];
      for (const l of c.lines) { // newest first: an older same-day near-duplicate or repeated sentence is dropped, its phase kept
        const dup = l.pushed ? null : kept.find((k) => (k.date === l.date && similar(k.text, l.text)) || k.text.trim().toLowerCase() === l.text.trim().toLowerCase());
        if (dup) { if (PHASES.indexOf(l.phase) > PHASES.indexOf(dup.phase) && counts(l)) { dup.phase = l.phase; dup.tier = Math.min(dup.tier, l.tier); } if (!dup.media && l.media) dup.media = l.media; continue; }
        kept.push({ ...l, shown: l.doneOn || cardDate(l.date) });
      }
      c.lines = kept;
      const done = kept.filter((l) => l.phase === "completed" && counts(l));
      c.completed = done.length > 0;
      c.active = kept.some((l) => l.phase !== "expected" && counts(l));
      c.assumed = c.completed && done.every((l) => l.assumed); // internal only: never shown, never pushed
      const rule = DURATIONS[box.id];
      if (!c.completed && c.active && rule && c.key !== "SITE") { // inferred completion: internal flag only, never a label, never a push
        const lastTest = kept.find((l) => counts(l) && l.phase !== "expected" && !(rule.done && rule.done.test(l.text)));
        const sig = rule.done && kept.find((l) => rule.done.test(l.text) && (!lastTest || l.at >= lastTest.at));
        const newest = kept.find((l) => !(rule.done && rule.done.test(l.text))); // any newer line (even a rumour) means the step may still be going on
        const now = Date.parse(road.updatedAt || "") || Date.now();
        const later = !sig && lastTest && newest && now - newest.at > (rule.maxDays + rule.grace) * DAY;
        if (sig || later) {
          c.completed = true; c.assumed = true;
          const at = sig ? sig.at : lastTest.at + rule.maxDays * DAY;
          const reason = sig ? `Back from ${rule.where || "the test"}, so ${rule.what} is done.` : `${rule.what[0].toUpperCase() + rule.what.slice(1)} usually takes ${rule.span}${rule.where ? " at " + rule.where : ""}, and nothing has been reported since, so it is done.`;
          if (!kept.some((l) => l.reason)) { kept.unshift({ date: cardDate(sig ? sig.date : lastTest.date), shown: cardDate(sig ? sig.date : lastTest.date), at: at + 1, text: reason, phase: "completed", tier: 2, reason: true, assumed: true }); kept.sort((a, b) => b.at - a.at); }
        }
      }
      c.boxes = boxesOf(kept, box.id, DURATIONS[box.id]);
      c.completed = !!(c.boxes[0] && c.boxes[0].completed); // the LATEST box decides the card's glow
      c.assumed = c.completed && c.boxes[0].assumed;
      c.status = c.completed ? "completed" : c.active ? "progress" : "expected";
      const pick = (done.length ? done : []).concat(kept).find((l) => l.media && !l.media.credit_only) || kept.find((l) => l.media);
      c.media = pick ? pick.media : null;
      c.mediaLine = pick || null;
      c.at = kept.length ? kept[0].at : 0;
      return c;
    });
    out.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
    return out;
  }
  // section status from its cards (+ an official box status the checker already set)
  function sectionStatus(box, cards, official = true) { // official: the box status belongs to this flight (the next one)
    if (official && (box.status === "done" || box.status === "complete")) return "completed";
    if (cards.length && cards.every((c) => c.completed)) return "completed";
    if (cards.some((c) => c.active) || (official && box.status === "progress")) return "progress";
    return "expected";
  }
  function roadModel(road, flight) {
    const f = Number.isInteger(flight) ? flight : road.flight;
    const sections = (road.categories || []).map((box) => { const cards = sectionCards(box, road, f); return { box, cards, status: sectionStatus(box, cards, f === road.flight) }; });
    return { flight: f, sections, done: sections.filter((s) => s.status === "completed").length, total: sections.length };
  }
  const flightsIn = (road) => [...new Set((road.categories || []).flatMap((c) => (c.history || []).filter((h) => h && h.kind !== "check").map((h) => flightOfEntry(h, road))))].sort((a, b) => a - b);
  // the ONE derive layer both views read: sections -> vehicle cards -> numbered boxes, plus status, glow, inferred flags, dots and count
  function buildRoadModel(road, flight, opts) {
    const m = roadModel(road, flight), hidden = (opts && opts.hidden) || [];
    m.sections = m.sections.filter((s) => !hidden.includes(s.box.id));
    m.total = m.sections.length; m.done = m.sections.filter((s) => s.status === "completed").length;
    m.sections.forEach((s) => { s.dot = "sdot-" + s.status; s.cards.forEach((c) => { c.glow = !!c.completed; c.inferred = !!c.assumed; }); });
    m.dots = m.sections.map((s) => ({ id: s.box.id, cls: s.dot }));
    m.count = m.done + " of " + m.total + " done";
    return m;
  }
  return { buildRoadModel, boxesOf, placeOf, NOUN, cardDate, lintCopy, DURATIONS, roadModel, sectionCards, sectionStatus, phaseOfText, vehiclesIn, hwKey, vehicleName, similar, flightsIn, PHASES };
});
