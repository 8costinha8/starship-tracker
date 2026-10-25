/* Road section cleanup (shared by the pipeline and the app).
   Model = the Cryo section: one card per vehicle. When a completion arrives for a vehicle + section
   (static fires, cryo, raptor), the vehicle's earlier steps collapse into that card's "Earlier updates"
   (newest first), keeping only the first prediction plus key milestones; repeat completions,
   same-day same-meaning lines and minor steps are dropped. Idempotent: running it twice changes nothing.
   Node: require("./cleanup.js"). Browser: <script src="scripts/cleanup.js"> → window.RoadCleanup. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RoadCleanup = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const SECTIONS = ["static"]; // sections drawn one card per vehicle with auto-fold (Cryo is already curated by hand; add "cryo"/"raptor" here or via opts.sections to fold them too)
  const CAN_FOLD = ["static", "cryo", "raptor"];
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const line = (h) => String((h && (h.log_text || h.text)) || "");
  const hwOf = (h) => {
    const m = String((h.milestone && h.milestone.hardware) || h.hardware || "").match(/^\s*(?:Ship\s*|S)(\d+)|^\s*(?:Booster\s*|B)(\d+)/i);
    return m ? (m[1] ? "S" + m[1] : "B" + m[2]) : null;
  };
  // vehicles named in a line ("Booster 22", "B22", "Ship 42", "S42")
  const named = (t) => { const out = new Set(); String(t).replace(/\b(?:Booster\s*|B)(\d{2})\b|\b(?:Ship\s*|S)(\d{2})\b/gi, (_, b, s) => out.add(b ? "B" + b : "S" + s)); return [...out]; };
  // day as a sortable number (the source's day, never a clock time); year from "at" when present
  function dayNum(h) {
    const d = String(h.log_date || h.date || "").replace(/^.*[–-]\s*/, "").match(/(\d{1,2}) ([A-Z][a-z]{2})/);
    const y = Number(String(h.at || h.publishedAt || "").slice(0, 4)) || 2026;
    if (d && MON[d[2]] != null) return Date.UTC(y, MON[d[2]], Number(d[1]));
    const t = Date.parse(h.at || h.publishedAt || ""); return Number.isFinite(t) ? t - (t % 86400000) : 0;
  }
  const atNum = (h) => Date.parse(h.at || h.publishedAt || "") || 0;
  const EVENT = { static: /static fire/i, cryo: /cryo/i, raptor: /raptor|engine/i };
  const isCompletion = (h, sec) => (h.phase === "completed" || (h.milestone && h.milestone.phase === "completed") || h.complete === true || /\b(complet(e|es|ed)|conduct(s|ed)?|perform(s|ed)?|finish(es|ed)?)\b/i.test(line(h)))
    && EVENT[sec].test(line(h) + " " + ((h.milestone && h.milestone.type) || "")) && !/\b(could|may|might|ready|waiting|ahead of|expected)\b/i.test(line(h));
  const isPrediction = (h) => /\b(could|may|might|as early as|within|estimate|expected to|NET)\b/i.test(line(h)) || (h.phase === "expected" && /\bready\b/i.test(line(h)));
  const isKey = (h) => /\broll(s|ed|ing)? (to|out to|back)\b|\barriv(es|ed|ing)?\b|\broad (is |has been )?closed\b|\bclosure\b|\bstack(s|ed)?\b|\blifted onto\b|\bmov(es|ed) to the (pad|launch)/i.test(line(h))
    && !/\b(waiting|preparing|likely|could|may)\b/i.test(line(h));
  // one short plain sentence: a couple of wording fixes shared with the push copy
  const tidy = (t) => String(t).replace(/\s+/g, " ").trim()
    .replace(/\bahead of (a )?static fire( test)?\b/i, "ahead of the static fire").replace(/\bfor (a )?static fire campaign\b/i, "for its static fire campaign")
    .replace(/([^.!?])$/, "$1.");
  const words = (t) => new Set(String(t).toLowerCase().replace(/booster|ship|\b[bs]\d{2}\b|\d+/g, " ").match(/[a-z]{4,}/g) || []);
  const same = (a, b) => { const A = words(line(a)), B = words(line(b)); if (!A.size || !B.size) return false; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size) >= 0.6; };
  const STEP_KEYS = ["date", "log_date", "at", "text", "log_text", "url", "src", "handle", "phase", "tier"];
  const asStep = (h) => { const u = {}; for (const k of STEP_KEYS) if (h[k] != null) u[k] = h[k];
    if (!u.handle && h.x_post && h.x_post.author && h.x_post.author.username) u.handle = h.x_post.author.username;
    if (!u.url && h.x_post && h.x_post.url) u.url = h.x_post.url;
    if (u.handle) u.handle = String(u.handle).replace(/^@/, ""); else { const m = String(u.url || "").match(/^https?:\/\/(?:x|twitter)\.com\/(\w+)\/status\//i); if (m) u.handle = m[1]; }
    u.log_text = tidy(line(h)); return u; };

  function cleanupSection(cat, road, opts = {}) {
    const keep = opts.keep || new Set(); // entries about to be pushed this run stay their own card until the push has gone (fold next run)
    if (!cat || !(opts.sections || SECTIONS).includes(cat.id) || !CAN_FOLD.includes(cat.id) || !Array.isArray(cat.history)) return { changed: false, folded: 0 };
    const flight = road && road.flight;
    const before = JSON.stringify(cat);
    const hist = cat.history;
    const cur = (h) => !(h.flight > flight) && !(h.id && keep.has(h.id)); // later flights' cards are left alone
    // the main card per vehicle: its completed entry (newest first)
    const mains = {};
    for (const h of hist) { const v = hwOf(h); if (v && cur(h) && h.trust !== "unconfirmed" && isCompletion(h, cat.id)) {
      // the vehicle's existing completed card stays the card (a later repeat folds into it); else the newest completion
      const card = (x) => !!((x.milestone && x.milestone.phase === "completed") || x.complete === true);
      if (!mains[v] || (card(h) && !card(mains[v])) || (card(h) === card(mains[v]) && atNum(h) > atNum(mains[v]))) mains[v] = h;
    } }
    let folded = 0;
    for (const [v, main] of Object.entries(mains)) {
      const mainDay = dayNum(main);
      const allDone = Object.keys(mains);
      // this vehicle's other entries, plus vehicle-less lines up to the completion day that only this vehicle can own
      const mine = hist.filter((h) => h !== main && cur(h) && h.kind !== "check" && (hwOf(h) === v
        || (!hwOf(h) && named(line(h)).every((n) => n === v) && dayNum(h) <= mainDay && allDone.filter((w) => dayNum(mains[w]) === dayNum(h) || dayNum(mains[w]) >= dayNum(h)).length === 1)));
      const pool = [...(main.updates || []), ...mine.flatMap((h) => [asStep(h), ...(h.updates || [])])]
        .filter((u) => u && line(u)).map((u) => (u.log_text === tidy(line(u)) && u.handle !== undefined ? u : { ...u, log_text: tidy(line(u)) }));
      // main line: the notification's own wording (the completion the push linked), else the earliest completion line
      const sameDayComp = (u) => isCompletion(u, cat.id) && dayNum(u) === mainDay; // a repeat of this completion
      const preds0 = pool.filter((u) => !isCompletion(u, cat.id) && isPrediction(u));
      const minor = pool.filter((u) => !isCompletion(u, cat.id) && !isPrediction(u) && !isKey(u));
      if (!mine.length && !pool.some(sameDayComp) && preds0.length < 2 && !minor.length) continue; // already clean: leave as is
      const comps = [{ ...main }, ...pool.filter(sameDayComp)];
      const pushed = main.push && comps.find((u) => u.url && u.url === main.push.url && u !== comps[0]);
      const pick = pushed || comps.slice(1).sort((a, b) => atNum(a) - atNum(b))[0];
      if (main.cleaned) { /* already the notification wording: keep it */ }
      else if (pick && pick.log_text) { main.log_text = tidy(pick.log_text); main.x_text = main.log_text; main.text = main.log_text; }
      else main.log_text = tidy(line(main));
      main.log_date = main.log_date || main.date;
      main.complete = true;
      // keep: the first (earliest) prediction + key milestones; drop repeat completions and minor steps
      const preds = preds0.sort((a, b) => dayNum(a) - dayNum(b) || atNum(a) - atNum(b));
      const keys = pool.filter((u) => (isCompletion(u, cat.id) && dayNum(u) < mainDay) || (!isCompletion(u, cat.id) && !isPrediction(u) && isKey(u))); // an earlier-day completion is its own milestone
      const kept = [];
      for (const u of [...keys, ...preds.slice(0, 1)]) if (!kept.some((k) => dayNum(k) === dayNum(u) && same(k, u))) kept.push(u);
      kept.sort((a, b) => dayNum(b) - dayNum(a) || atNum(b) - atNum(a)); // newest on top
      main.updates = kept;
      if (!main.updates.length) delete main.updates;
      main.cleaned = true;
      for (const h of mine) { const i = hist.indexOf(h); if (i >= 0) { hist.splice(i, 1); folded++; } }
    }
    if (folded || JSON.stringify(cat) !== before) {
      // one card per vehicle, newest first; section summary = the latest outcome in the notification wording
      hist.sort((a, b) => dayNum(b) - dayNum(a) || atNum(b) - atNum(a));
      const top = hist.find((h) => !(h.flight > flight)); // the newest card leads the summary only when it is a cleaned vehicle card (a fresh entry keeps the pipeline's headline)
      if (top && top.cleaned) { cat.latest = top.log_text; cat.log_latest = top.log_text; }
    }
    return { changed: JSON.stringify(cat) !== before, folded };
  }
  function cleanupRoad(road, opts) {
    let changed = false, folded = 0;
    for (const c of (road && road.categories) || []) { const r = cleanupSection(c, road, opts); changed = changed || r.changed; folded += r.folded; }
    return { changed, folded };
  }
  // per-vehicle progress for a section: "1 of 2"
  function vehicleProgress(cat, road) {
    const vs = ((road && road.vehicles) || []).map((v) => String(v).toUpperCase());
    const done = vs.filter((v) => (cat.history || []).some((h) => hwOf(h) === v && !(h.flight > road.flight) && h.trust !== "unconfirmed" && ((h.milestone && h.milestone.phase === "completed") || h.complete === true)));
    return { done: done.length, total: vs.length };
  }
  return { cleanupSection, cleanupRoad, vehicleProgress, tidy, isCompletion, isPrediction, isKey, hwOf, dayNum };
});
