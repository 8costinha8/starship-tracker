/* Flight Log view transform for the Road box (app only; the pipeline and the Road to Flight page never use it).
   Model = the Cryo section: one card per vehicle. When a completion arrives for a vehicle + section
   (static fires, cryo, raptor), the vehicle's earlier steps collapse into that card's "Earlier updates"
   (newest first), keeping only the first prediction plus key milestones; repeat completions,
   same-day same-meaning lines and minor steps are dropped. Idempotent: running it twice changes nothing.
   Node: require("./cleanup.js"). Browser: <script src="scripts/cleanup.js"> → window.RoadCleanup. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RoadCleanup = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const SECTIONS = ["static", "cryo", "raptor"]; // per-vehicle test sections drawn one card per vehicle on the Flight Log
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
  const same = (a, b) => { const A = words(line(a)), B = words(line(b)); if (!A.size || !B.size) return false; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size) >= 0.8; };
  // same day, same kind of vehicle step ("heads to the launch site" / "rolls to Pad 2" / "arrives at Pad 2") → one line
  const FAMILY = [["move", /\b(roll(s|ed|ing)?( out| to)?|heads?|arriv\w*|left|leaves|highway|en route)\b/i], ["lift", /\b(lift\w*|lowered|stacked|onto the (launch )?mount|olm)\b/i], ["engines-seen", /\b(deliver\w*|spotted)\b/i]];
  const fam = (h) => { const t = line(h); const f = FAMILY.find(([, re]) => re.test(t)); return f ? f[0] + "|" + named(t).join(",") : null; };
  const sameStep = (a, b) => same(a, b) || (fam(a) && fam(a) === fam(b));
  const STEP_KEYS = ["date", "log_date", "at", "text", "log_text", "url", "src", "handle", "phase", "tier"];
  const asStep = (h) => { const u = {}; for (const k of STEP_KEYS) if (h[k] != null) u[k] = h[k];
    if (!u.handle && h.x_post && h.x_post.author && h.x_post.author.username) u.handle = h.x_post.author.username;
    if (!u.url && h.x_post && h.x_post.url) u.url = h.x_post.url;
    if (u.handle) u.handle = String(u.handle).replace(/^@/, ""); else { const m = String(u.url || "").match(/^https?:\/\/(?:x|twitter)\.com\/(\w+)\/status\//i); if (m) u.handle = m[1]; }
    u.log_text = tidy(line(h)); return u; };

  // Flight Log view (pure: never changes road.json; the Road to Flight page keeps every post).
  // Per vehicle section, one card per current-flight vehicle (road.vehicles: booster + ship), whichever goes first:
  //   no news yet → its EARLIEST prediction only (no Earlier updates, no glow)
  //   in progress → the newest step as the main line; earlier key steps + earliest prediction under Earlier updates
  //   completed   → the completion line (the push's own wording), glow, key steps + earliest prediction, deduped
  // Every card / earlier line keeps _hi = its source entry's index in the section, so a tap can open that post.
  const MINOR = /\btransport ring\b|\bwaiting to\b|\bpreparing to\b|\blikely\b/i;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // Raptor engines: one card per vehicle (booster 33 Raptors, ship 6: 3 sea-level + 3 vacuum), any flight.
  //   all installed (a Tier 1/2 source says so) → "<V> has all N Raptors installed.", glow
  //   assumed (internal flag, no push): a rollout for a static fire or a completed static fire implies all engines are in;
  //     a reason line says so. A trusted confirmation upgrades it (assumed flag gone).
  //   engines removed / swapped after completion → "<V> has a Raptor swapped." (not complete) until reinstalled
  //   install steps (or back in the Mega Bay after cryo) → "<V> is getting its Raptors installed."
  //   Earlier updates: spotted / delivered, install steps (only the latest partial count), removals / swaps, one prediction.
  const ENG_DONE = /\ball (?:\d+ )?(?:raptors?|engines?|rvacs?)\b[^.]{0,30}\b(?:installed|fitted|in|on)\b|\b(?:raptors?|engines?) (?:are |were |have been )?(?:all |fully )?installed\b|\bfully (?:fitted|installed)\b|engine install\w* (?:is )?complete/i;
  const ENG_OUT = /\b(?:removed|removal|swap\w*|pulled|taken off|replac\w*)\b/i;
  const ENG_IN = /\b(?:install\w*|reinstall\w*|fitted|fitting|being fitted|going in)\b/i;
  const ENG_SEEN = /\b(?:deliver\w*|spotted|arriv\w*|jig|engine testing|seen)\b/i;
  const HEDGE = /\b(?:reportedly|could|may|might|rumou?r|hearing|expected|likely)\b/i;
  const PART = /\b(\d{1,2})\s+(?:of\s+\d+\s+)?(?:raptors?|engines?)\b/i;
  const vName = (v) => (v[0] === "B" ? "Booster " : "Ship ") + v.slice(1);
  const nEng = (v) => (v[0] === "B" ? 33 : 6);
  const tierOk = (h) => h.trust === "trusted" && !(Number(h.tier) > 2);
  function raptorView(cat, road) {
    const flight = road.flight, vs = (road.vehicles || []).map((v) => String(v).toUpperCase());
    const cur = (h) => h && h.kind !== "check" && !(h.flight > flight) && h.trust !== "unconfirmed";
    const steps = {}; for (const v of vs) steps[v] = [];
    cat.history.forEach((h, hi) => {
      if (!cur(h)) return;
      const who = [...new Set([hwOf(h), ...named(line(h) + " " + (h.text || ""))].filter((x) => x && vs.includes(x)))];
      const list = [{ ...asStep(h), _hi: hi, _trusted: tierOk(h) }, ...(h.updates || []).filter((u) => u && line(u)).map((u) => ({ ...u, log_text: tidy(line(u)), _hi: hi, _trusted: tierOk(h) }))];
      for (const u of list) { const n = named(line(u)); for (const v of (n.length ? n.filter((x) => vs.includes(x)) : who)) if (steps[v]) steps[v].push({ ...u }); }
    });
    // what the other sections imply (static fire rollout / completion; cryo rollback → Mega Bay)
    const imply = {};
    for (const v of vs) imply[v] = { installed: null, progress: null };
    for (const c of road.categories || []) for (const h of c.history || []) {
      if (!cur(h) || c.id === "raptor") continue;
      const t = `${h.text || ""} ${h.log_text || ""}`, mine = [...new Set([hwOf(h), ...named(t)].filter((x) => x && vs.includes(x)))];
      for (const v of mine) {
        const d = dayNum(h);
        const fired = c.id === "static" && ((h.milestone && h.milestone.type === "static_fire" && h.milestone.phase === "completed") || (/static fire/i.test(t) && /\b(complet\w*|conduct\w*)\b/i.test(t) && !HEDGE.test(h.text || "")));
        const rolled = c.id === "static" && /\broll\w*|heads? to (?:the )?pad|arriv\w* at (?:the )?(?:launch|pad)/i.test(t) && /static/i.test(t) && !HEDGE.test(h.text || "");
        if ((fired || rolled) && (imply[v].installed == null || d < imply[v].installed.day)) imply[v].installed = { day: d, date: h.log_date || h.date, why: fired ? `${vName(v)} completed its static fire, so all ${nEng(v)} Raptors are assumed installed.` : `${vName(v)} rolled out for its static fire, so all ${nEng(v)} Raptors are assumed installed.` };
        if (c.id === "cryo" && /roll\w* back|returned|back to (?:the )?(?:mega ?bay|production)/i.test(t) && (imply[v].progress == null || d > imply[v].progress.day)) imply[v].progress = { day: d };
      }
    }
    const cards = [];
    for (const v of vs) {
      const all = steps[v].slice().sort((a, b) => dayNum(b) - dayNum(a) || atNum(b) - atNum(a));
      const newest = (re, f = () => true) => all.find((u) => re.test(line(u)) && f(u));
      const engDone = (t) => { const m = String(t).match(PART); return ENG_DONE.test(t) && !(m && Number(m[1]) < nEng(v)); };
      const conf = all.find((u) => engDone(line(u)) && u._trusted && !HEDGE.test(line(u)));
      const out = newest(ENG_OUT);
      const ins = newest(ENG_IN);
      const inf = imply[v].installed;
      const doneDay = Math.max(conf ? dayNum(conf) : -Infinity, inf ? inf.day : -Infinity);
      const base = { hardware: v, flight, trust: "trusted", _hi: all[0] ? all[0]._hi : undefined };
      let card;
      if (Number.isFinite(doneDay) && !(out && dayNum(out) > doneDay && !(ins && dayNum(ins) > dayNum(out) && engDone(line(ins))))) {
        card = { ...base, log_text: `${vName(v)} has all ${nEng(v)} Raptors installed.`, log_date: conf && (!inf || dayNum(conf) >= inf.day || true) ? (conf.log_date || conf.date) : inf.date,
          complete: true, milestone: { type: "engines_installed", hardware: v, flight, phase: "completed" } };
        if (conf) card._hi = conf._hi; else { card.assumed = true; card.assumed_reason = inf.why; card.log_date = inf.date; }
      } else if (out && Number.isFinite(doneDay) && dayNum(out) > doneDay) {
        card = { ...base, log_text: `${vName(v)} has a Raptor swapped.`, log_date: out.log_date || out.date, _hi: out._hi, milestone: { type: "engines_installed", hardware: v, flight, phase: "progress" } };
      } else if (ins || out || imply[v].progress) {
        const src = ins || out || all[0];
        card = { ...base, log_text: `${vName(v)} is getting its Raptors installed.`, log_date: src ? (src.log_date || src.date) : undefined, _hi: src ? src._hi : undefined, milestone: { type: "engines_installed", hardware: v, flight, phase: "progress" } };
      } else if (all.length) {
        const pred = all.filter(isPrediction).sort((a, b) => dayNum(a) - dayNum(b))[0] || all[0];
        cards.push({ ...base, log_text: tidy(line(pred)), log_date: pred.log_date || pred.date, _hi: pred._hi }); continue;
      } else continue;
      // Earlier updates: key engine steps only, newest first
      let rest = all.filter((u) => ENG_SEEN.test(line(u)) || ENG_IN.test(line(u)) || ENG_OUT.test(line(u)) || /raptor|engine/i.test(line(u)));
      const preds = rest.filter(isPrediction).sort((a, b) => dayNum(a) - dayNum(b));
      rest = rest.filter((u) => !isPrediction(u));
      rest = rest.filter((u) => u !== conf);
      const partials = rest.filter((u) => PART.test(line(u)) && !engDone(line(u)));
      rest = rest.filter((u) => !partials.includes(u) || u === partials[0]); // only the latest partial count
      if (preds[0]) rest.push(preds[0]);
      if (card.assumed) rest.unshift({ log_text: card.assumed_reason, log_date: inf.date, date: inf.date, assumed: true });
      const kept = [];
      for (const u of rest) if (line(u) && tidy(line(u)) !== card.log_text && !kept.some((k) => dayNum(k) === dayNum(u) && sameStep(k, u))) kept.push(u);
      kept.sort((a, b) => dayNum(b) - dayNum(a) || (b.assumed ? 1 : 0) - (a.assumed ? 1 : 0));
      card.updates = kept.map((u) => { const o = { ...u, log_text: tidy(line(u)) }; delete o._trusted; return o; });
      if (!card.updates.length) delete card.updates;
      card.text = card.x_text = card.log_text; card.date = card.log_date;
      cards.push(card);
    }
    if (!cards.length) return cat;
    cards.sort((a, b) => dayNum(b) - dayNum(a));
    const later = cat.history.map((h, hi) => ({ h, hi })).filter(({ h }) => h && h.flight > flight).map(({ h, hi }) => ({ ...h, _hi: hi }));
    const top = cards.find((c) => c.complete) || cards[0];
    return { ...cat, history: [...cards, ...later], latest: top.log_text, log_latest: top.log_text, view: "flightlog" };
  }
  function flightLogView(cat, road, opts = {}) {
    if (!cat || !(opts.sections || SECTIONS).includes(cat.id) || !Array.isArray(cat.history)) return cat;
    if (cat.view === "flightlog") return cat; // already the Flight Log view (idempotent)
    if (cat.id === "raptor" && road && (road.vehicles || []).length && !opts.generic) return raptorView(cat, road);
    const flight = road && road.flight, vs = ((road && road.vehicles) || []).map((v) => String(v).toUpperCase());
    if (!vs.length) return cat;
    const hist = cat.history.map((h, hi) => ({ h, hi }));
    const cur = (h) => h && h.kind !== "check" && !(h.flight > flight) && h.trust !== "unconfirmed";
    const own = (h) => { const v = hwOf(h); const n = named(line(h) + " " + (h.text || "")); return v ? [...new Set([v, ...n.filter((x) => vs.includes(x))])] : n.filter((x) => vs.includes(x)); };
    // steps per vehicle: each entry + its earlier updates, each tagged with the source entry index
    const steps = {}; for (const v of vs) steps[v] = [];
    const loose = [];
    for (const { h, hi } of hist) {
      if (!cur(h)) continue;
      const who = own(h);
      const list = [{ ...asStep(h), _hi: hi, _entry: h }, ...(h.updates || []).filter((u) => u && line(u)).map((u) => ({ ...u, log_text: tidy(line(u)), _hi: hi }))];
      if (!who.length) { loose.push(...list); continue; }
      for (const v of who) if (steps[v]) steps[v].push(...list.map((u) => ({ ...u })));
    }
    // a vehicle-less line (road closure) belongs to the one vehicle whose news it leads up to
    for (const u of loose) { const after = vs.filter((v) => steps[v].some((x) => !isPrediction(x) && dayNum(x) >= dayNum(u))); if (after.length === 1) steps[after[0]].push(u); }
    const cards = [];
    for (const v of vs) {
      const all = steps[v].filter((u) => { const n = named(line(u)); return !n.length || n.includes(v); }); // a line naming only the other vehicle is not this one's
      if (!all.length) continue;
      const preds = all.filter((u) => !isCompletion(u, cat.id) && isPrediction(u)).sort((a, b) => dayNum(a) - dayNum(b) || atNum(a) - atNum(b));
      const firstPred = preds[0];
      const comps = all.filter((u) => isCompletion(u, cat.id));
      const news = all.filter((u) => !isCompletion(u, cat.id) && !isPrediction(u));
      let card, rest;
      if (comps.length) {
        const newestDay = Math.max(...comps.map(dayNum));
        const today = comps.filter((u) => dayNum(u) === newestDay);
        const base = (today.find((u) => u._entry && ((u._entry.milestone && u._entry.milestone.phase === "completed") || u._entry.complete === true)) || today[0]);
        const be = base._entry || {};
        const pushed = be.push && today.find((u) => u.url && u.url === be.push.url);
        const wording = (pushed || today.slice().sort((a, b) => atNum(a) - atNum(b))[0]).log_text;
        card = { ...clone(base._entry || base), log_text: tidy(wording), log_date: base.log_date || base.date, hardware: v, complete: true };
        if (!card.milestone || card.milestone.phase !== "completed") card.milestone = { ...(card.milestone || {}), type: (card.milestone && card.milestone.type) || cat.id, hardware: v, flight, phase: "completed" };
        card._hi = base._hi;
        rest = [...news.filter((u) => !MINOR.test(line(u)) && (isKey(u) || true)), ...comps.filter((u) => dayNum(u) < newestDay)];
      } else if (news.length) {
        const sorted = news.slice().sort((a, b) => dayNum(b) - dayNum(a) || atNum(b) - atNum(a));
        const top = sorted[0];
        card = { ...clone(top._entry || top), log_text: tidy(line(top)), log_date: top.log_date || top.date, hardware: v };
        delete card.complete; if (card.milestone) card.milestone = { ...card.milestone, phase: card.milestone.phase === "completed" ? "progress" : card.milestone.phase };
        card._hi = top._hi;
        rest = sorted.slice(1).filter((u) => !MINOR.test(line(u)) && dayNum(u) <= dayNum(top) && !(dayNum(u) === dayNum(top) && sameStep(u, top)));
      } else {
        card = { ...clone(firstPred._entry || firstPred), log_text: tidy(line(firstPred)), log_date: firstPred.log_date || firstPred.date, hardware: v };
        delete card.complete; card._hi = firstPred._hi; card.updates = undefined; delete card.updates;
        cards.push(card); continue;
      }
      if (firstPred) rest.push(firstPred);
      const kept = [];
      for (const u of rest) if (line(u) && tidy(line(u)) !== card.log_text && !kept.some((k) => dayNum(k) === dayNum(u) && sameStep(k, u))) kept.push(u);
      kept.sort((a, b) => dayNum(b) - dayNum(a) || atNum(b) - atNum(a));
      card.updates = kept.map((u) => { const o = { ...u, log_text: tidy(line(u)) }; delete o._entry; return o; });
      if (!card.updates.length) delete card.updates;
      delete card.x_post; card.x_text = card.log_text;
      cards.push(card);
    }
    if (!cards.length) return cat;
    cards.sort((a, b) => dayNum(b) - dayNum(a) || atNum(b) - atNum(a));
    // later flights' entries stay as they were (the Flight Log hides them anyway)
    const later = hist.filter(({ h }) => h && h.flight > flight).map(({ h, hi }) => ({ ...h, _hi: hi }));
    const top = cards.find((c) => c.complete) || cards[0];
    return { ...cat, history: [...cards, ...later], latest: top.log_text, log_latest: top.log_text, view: "flightlog" };
  }
  // per-vehicle progress for a section: "1 of 2"
  function vehicleProgress(cat, road) {
    const vs = ((road && road.vehicles) || []).map((v) => String(v).toUpperCase());
    const done = vs.filter((v) => (cat.history || []).some((h) => hwOf(h) === v && !(h.flight > road.flight) && h.trust !== "unconfirmed" && ((h.milestone && h.milestone.phase === "completed") || h.complete === true)));
    return { done: done.length, total: vs.length };
  }
  return { flightLogView, raptorView, vehicleProgress, named, tidy, isCompletion, isPrediction, isKey, hwOf, dayNum };
});
