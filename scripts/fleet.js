/* Fleet: a self-updating vehicle registry (data/vehicles.json) for EVERY booster, ship and pad, not only the
   tracked flight's. Deterministic (regex, no writer call, no extra API cost), so the same code runs live
   (check-road.js, every 15 min), in the backfill (scripts/fleet-backfill.js) and in the 6-hourly coverage check.
   Rules (generic: no vehicle or flight number is written in this file):
   - Vehicles are found in trusted source text (B##, S##, "Booster ##", "Ship ##", "Starship ##"). A NEW number is added
     automatically when it is higher than the newest vehicle of that type that already flew (older numbers are
     history, not new hardware).
   - Flight assignment is learned from unhedged trusted text ("B24 and S44 for Flight 17", "Starship Flight 17: Booster 24",
     "the Flight 17 pair of …", "(Flight 17 vehicles)", "will fly Flight 18"). The newest unhedged assignment wins; the old
     one stays in flight_history. A vehicle that already flew is never re-assigned.
   - Lifecycle: build → cryo → engines → static_fire → stacked → rollout → flight → caught / expended / retired / scrapped.
     A vehicle only moves forward; terminal states are folded away in the app and never deleted.
   - Events: one per vehicle + milestone (cryo_start, cryo_done, static_fire, engines_installed, stacked, rollout), plus
     non-push "move" and "build" events (one per vehicle + kind + place + UK day). Later posts about the same event add a
     source (and a better picture) instead of a second event.
   - Pushes: exactly one per vehicle + milestone (key "B24|cryo_done"), for vehicles that are NOT on the tracked flight
     (the Road pipeline already pushes those), from Tier 1/2 sources, unhedged, never for backfilled events. */
const crypto = require("crypto");
const fs = require("fs"), path = require("path");
const SRC = require("./sources.js");

const FILE = path.join(__dirname, "..", "data", "vehicles.json");
const STATES = ["build", "cryo", "engines", "static_fire", "stacked", "rollout", "flight", "caught", "expended", "retired", "scrapped"];
const TERMINAL = new Set(["caught", "expended", "retired", "scrapped"]);
const STATE_LABEL = { build: "In build", cryo: "Cryo testing", engines: "Engines installed", static_fire: "Static fire", stacked: "Stacked", rollout: "Rolled out", flight: "Flown", caught: "Caught", expended: "Expended", retired: "Retired", scrapped: "Scrapped" };
const MILESTONES = ["cryo_start", "cryo_done", "static_fire", "engines_installed", "stacked", "rollout"];
const MILESTONE_STATE = { cryo_start: "cryo", cryo_done: "cryo", engines_installed: "engines", static_fire: "static_fire", stacked: "stacked", rollout: "rollout" };
const PUSH_LABEL = { cryo_start: "cryo test started", cryo_done: "cryo test complete", static_fire: "static fire", engines_installed: "engines installed", stacked: "stacked", rollout: "rolled out" };
const PUSH_ICON = { cryo_start: "❄️", cryo_done: "❄️", static_fire: "💥", engines_installed: "🔧", stacked: "🏗️", rollout: "🚚" };
const BOX_OF = { cryo_start: "cryo", cryo_done: "cryo", static_fire: "static", engines_installed: "raptor", stacked: "pad", rollout: "pad", move: "pad", build: "pad" };

// ── text helpers ─────────────────────────────────────────────
const clean = (t) => String(t || "").replace(/https?:\/\/\S+/g, " ").replace(/(?:📸|🎥|📷)[^\n]*$/gmu, " ").replace(/\bFollow Our Journey:?/gi, " ").replace(/#\w+/g, " ").replace(/@\w+/g, " ").replace(/[\u2060\u200b]/g, "").replace(/[ \t]+/g, " ").trim();
const sentences = (t) => clean(t).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
// clauses: a comma / semicolon / " but " / " now " split, so "Ship 44 had cryo testing, now it's Booster 24's turn" gives S44 the test, not B24
const clauses = (s) => String(s).split(/[,;]\s+|\s+(?:but|while|whereas)\s+|\s+now it'?s\s+/i).map((x) => x.trim()).filter(Boolean);
const HEDGE = /\b(rumou?rs?|reportedly|hearing|speculat\w*|possibly|maybe|might|could|may|hopefully|unconfirmed|allegedly|apparently|potentially|likely|expected|should|would|will|planned|plans?|soon|ahead of|due to|prepar\w*|getting ready|about to|not be surprised|if all goes well)\b|\?/i;
const nameOf = (id) => { const m = String(id).match(/^([BS])(\d+)$/); return m ? `${m[1] === "B" ? "Booster" : "Ship"} ${m[2]}` : (PADS.find((p) => p.id === id) || {}).name || id; };
const num = (id) => Number(String(id).replace(/\D/g, "")) || 0;
const typeOf = (id) => (/^B\d/.test(id) ? "booster" : /^S\d/.test(id) ? "ship" : "pad");

// pads and sites, tracked the same way (status + flight); ids are stable keys, names are display text
const PADS = [
  { id: "PAD1", name: "Pad 1", re: /\bpad ?(?:1|a)\b|\bpad one\b/i },
  { id: "PAD2", name: "Pad 2", re: /\bpad ?(?:2|b)\b|\bpad two\b/i },
  { id: "MASSEYS", name: "Massey's", re: /\bmassey'?s?\b/i },
  { id: "LC39A", name: "LC-39A", re: /\b(?:lc-?|pad )39a\b|\b39a\b/i },
];
const PLACES = [
  ["Massey's", /\bmassey'?s?\b/i], ["Mega Bay 1", /\bmega ?bay ?1\b/i], ["Mega Bay 2", /\bmega ?bay ?2\b/i], ["the Mega Bay", /\bmega ?bay\b/i],
  ["the Gigabay", /\bgiga ?bay\b/i], ["Pad 1", /\bpad ?(?:1|a)\b/i], ["Pad 2", /\bpad ?(?:2|b)\b/i], ["LC-39A", /\b(?:lc-?|pad )?39a\b/i],
  ["the launch site", /\blaunch site\b|\borbital launch mount\b|\bolm\b/i], ["the production site", /\bproduction site\b|\bbuild site\b|\bsanchez\b/i],
];
const placeIn = (t) => { for (const [n, re] of PLACES) if (re.test(t)) return n; return null; };
// destination vs origin: "left Megabay 1 … joining Ship 44 at Massey's" → to Massey's, from Mega Bay 1
function placesIn(t) {
  const hits = [];
  for (const [n, re] of PLACES) { const m = String(t).match(re); if (m && !hits.some((h) => h.i === m.index)) hits.push({ n, i: m.index }); }
  hits.sort((a, b) => a.i - b.i);
  let to = null, from = null;
  for (const h of hits) { const before = String(t).slice(Math.max(0, h.i - 30), h.i);
    if (/\b(left|leav\w*|from|out of|departed|departing)\b[^,]*$/i.test(before) && !/\b(to|at|into|onto)\s+(?:the\s+)?$/i.test(before)) { from = from || h.n; continue; }
    if (!to) to = h.n; }
  return { to, from };
}
const LAUNCH_PLACES = new Set(["Pad 1", "Pad 2", "LC-39A", "the launch site"]);

// vehicle ids in a piece of text (URLs stripped first)
function idsIn(text) {
  const t = clean(text), out = [];
  const add = (id) => { if (!out.includes(id)) out.push(id); };
  for (const m of t.matchAll(/\b(?:super heavy\s+)?booster\s*(\d{1,3})\b|\b(?:starship|ship)\s+(\d{2,3})\b|\b([BS])-?(\d{2,3})\b/gi)) {
    if (m[1]) add(`B${Number(m[1])}`); else if (m[2]) add(`S${Number(m[2])}`); else if (m[3]) add(`${m[3].toUpperCase()}${Number(m[4])}`);
  }
  return out;
}
// "for Flight 17", "Flight 17:", "Flight 17 pair / vehicles / booster / ship", "fly (on) Flight 18", "assigned to Flight 18"
const ASSIGN = /\bfor (?:starship )?flight (\d{1,3})\b|\bflight (\d{1,3})\s*[:\-–—]\s*(?=\S)|\bflight (\d{1,3}) (?:pair|vehicles?|booster|ship|stack|hardware)\b|\b(?:fly|flies|flying|fly on|assigned to|slated for|moved to|now on|reassigned to|switched to) (?:on )?(?:starship )?flight (\d{1,3})\b/gi;
// an assignment may be stated as a plan ("will fly Flight 18"); only real doubt blocks it
const ASSIGN_HEDGE = /\b(rumou?rs?|reportedly|hearing|speculat\w*|possibly|maybe|might|could|may|hopefully|unconfirmed|allegedly|apparently|potentially|likely|would|presumed|presumably|not be surprised|if)\b|\?/i;
function assignmentsIn(sentence) {
  if (ASSIGN_HEDGE.test(sentence)) return [];
  const fl = new Set([...sentence.matchAll(ASSIGN)].map((m) => Number(m[1] || m[2] || m[3] || m[4])));
  if (fl.size !== 1) return [];
  const flight = [...fl][0];
  return idsIn(sentence).map((id) => ({ id, flight }));
}

// milestone / event per clause. Returns [{ type, place }]
const CRYO = /\bcryo\w*|\bproof test\w*|\bthrust sim\w*/i;
const CRYO_DONE = /\b(complet\w*|finish\w*|wrapp\w* up|done with|had (?:its |a |some |another )?)\b|\bcryo\w*[^.]{0,30}\b(complete[d]?|done|finished|over)\b/i;
const CRYO_START = /\b(undergo\w*|underway|under way|begins?|began|started|starting|start of|happening now|in progress|currently|being filled|filled with|into (?:full )?cryo\w*|loading|frost\w*|venting)\b/i;
const FROST = /\bfrost\w*\b/i;
const SF = /\bstatic[- ]?fir\w*/i, SF_DONE = /\b(conduct\w*|complet\w*|perform\w*|fired|fires|lit up|lights up|ignit\w*|done)\b/i;
const ENGINES = /\ball (?:\d+ )?(?:raptors?|engines?) (?:are |now )?(?:installed|in)\b|\b(?:raptors?|engines?) (?:are |were |now )?(?:fully )?installed\b|\bfull set of (?:raptors?|engines?)\b/i;
// "stacked" = ship on booster (a booster "fully stacked" in the Mega Bay is assembly, not this milestone)
const STACKED = /\bstacked (?:on|atop) (?:top of )?(?:super heavy|booster|b\d)|\bstacks? (?:ship|starship|s\d)|\bfull stack (?:at|on) (?:the )?(?:pad|launch|olm)/i;
const SHIP_STACKED = /\b(?:ship|starship|s)\s?-?\d{2,3}\b[^.]{0,25}\bstacked (?:on|atop)\b/i;
const MOVE = /\b(roll\w*|head\w*|move\w*|arriv\w*|left|leav\w*|transport\w*|entered|on (?:the )?highway|hwy ?4|highway 4|lifted onto|joining|together at|returned|returning|back to)\b/i;
const BUILD_PART = /\b(tank|section|ring|dome|barrel|transfer tube|nose ?cone|aft|forward|header|skirt|chine|flap|tiles?|interstage|hot stage|grid fins?)\b/i;
const BUILD_ACT = /\b(lift\w*|moved|stack\w*|spotted|seen|weld\w*|roll\w*|install\w*|mated)\b/i;
const CAUGHT = /\b(?:was |been |got )?caught\b|\bcatch of\b/i, EXPENDED = /\bexpended\b|\bsplash(?:ed)? ?down\b/i, SCRAPPED = /\bscrapp\w*\b/i, RETIRED = /\bretir\w*\b/i;
// a move is doubtful only on real doubt / future wording ("due to move", "will roll"); "ahead of testing" is still a real move
const MOVE_HEDGE = /\b(rumou?rs?|reportedly|possibly|maybe|might|could|may|hopefully|likely|expected|should|would|will|planned|plans? to|soon|due to|about to|set to|getting ready)\b|\?/i;
function eventsIn(clause, sentence = clause) {
  const out = [], c = clause, pl = placesIn(c), place = pl.to || (/\b(at|in)\b/i.test(sentence) ? placesIn(sentence).to : null);
  if (BUILD_PART.test(c) && BUILD_ACT.test(c)) { if (!HEDGE.test(c)) out.push({ type: "build", place }); return out; }
  if (SCRAPPED.test(c)) out.push({ type: "scrapped", terminal: true });
  else if (RETIRED.test(c)) out.push({ type: "retired", terminal: true });
  if (out.length) return out;
  const hedged = HEDGE.test(c);
  if (CRYO.test(c) || FROST.test(c)) {
    if (!hedged && CRYO.test(c) && CRYO_DONE.test(c) && !/\bcurrently|undergoing|happening now\b/i.test(c)) out.push({ type: "cryo_done", place });
    else if (!hedged && CRYO_START.test(c)) out.push({ type: "cryo_start", place });
  }
  if (!out.length && SF.test(c) && SF_DONE.test(c) && !hedged) out.push({ type: "static_fire", place });
  if (!out.length && ENGINES.test(c) && !hedged) out.push({ type: "engines_installed", place });
  if (!out.length && (STACKED.test(c) || SHIP_STACKED.test(c)) && !hedged) out.push({ type: "stacked", place });
  const mh = MOVE_HEDGE.test(c);
  if (!out.length && MOVE.test(c) && pl.to) out.push({ type: LAUNCH_PLACES.has(pl.to) && /\broll\w*|head\w*|move\w*|arriv\w*|transport\w*\b/i.test(c) && !mh ? "rollout" : "move", place: pl.to, hedged: mh });
  else if (!out.length && MOVE.test(c) && pl.from && !mh) out.push({ type: "move", place: null, from: pl.from });
  if (!out.length && !hedged && CAUGHT.test(c)) out.push({ type: "caught", terminal: true });
  if (!out.length && !hedged && EXPENDED.test(c)) out.push({ type: "expended", terminal: true });
  return out;
}

const RECAP_POST = /\b(starbase this week|this week at starbase|week in review|weekly|round-?up|recap|written by|starship update|highlights?|relive|throwback)\b/i;
const isRecap = (t) => RECAP_POST.test(String(t || "").slice(0, 200)) || require("./push-gate.js").RECAP.test(String(t || "").slice(0, 200));
// ── registry ────────────────────────────────────────────────
function empty() { return { version: 1, updated: null, vehicles: {}, pads: {}, pushed: {}, coverage: null }; }
function load(file = FILE) { try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return { ...empty(), ...j }; } catch { return empty(); } }
function save(reg, file = FILE) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(reg, null, 2) + "\n"); }
const stateIdx = (s) => STATES.indexOf(s);
function flownFlights(appJsText) { // [{ n, booster, ship, date }] from app.js FLIGHTS (the flight log)
  return [...String(appJsText || "").matchAll(/\{\s*n:\s*(\d+),\s*date:\s*"([^"]+)"[^}]*?booster:\s*"([BS]?\d+)"[^}]*?ship:\s*"(S?\d+)"/g)].map((m) => ({ n: +m[1], date: m[2], booster: m[3], ship: m[4] }));
}
// Seed / sync from existing repo data: flown vehicles (app.js FLIGHTS), the tracked flight's hardware (road.json), pads.
function seed(reg, { road = {}, appJsText = "", now = Date.now() } = {}) {
  const iso = new Date(now).toISOString(), changes = [];
  const V = reg.vehicles;
  const flown = new Map();
  for (const f of flownFlights(appJsText)) if (!flown.has(f.n)) flown.set(f.n, f);
  for (const f of flown.values()) for (const id of [f.booster, f.ship]) {
    if (!/^[BS]\d+$/.test(id)) continue;
    if (!V[id]) { V[id] = { id, type: typeOf(id), name: nameOf(id), state: "flight", flight: f.n, flight_history: [{ flight: f.n, at: f.date, src: "flight log" }], first_seen: f.date, events: [] }; changes.push(`seed ${id} flew Flight ${f.n}`); }
    else if (stateIdx(V[id].state) < stateIdx("flight")) { V[id].state = "flight"; V[id].flight = f.n; changes.push(`${id} flew Flight ${f.n}`); }
  }
  for (const [id, n] of Object.entries(road.hardware_flights || {})) {
    if (!/^[BS]\d+$/.test(id) || !Number.isInteger(n)) continue;
    const v = V[id] || (V[id] = { id, type: typeOf(id), name: nameOf(id), state: "build", flight: null, flight_history: [], first_seen: iso, events: [] });
    if (v.flight !== n && !(stateIdx(v.state) >= stateIdx("flight"))) { v.flight_history.push({ flight: n, at: iso, src: "road.json hardware_flights" }); v.flight = n; changes.push(`${id} → Flight ${n} (road.json)`); }
  }
  // a vehicle whose flight is now in the flight log flew (rollover)
  const lastFlown = Math.max(0, ...flown.keys());
  for (const v of Object.values(V)) if (Number.isInteger(v.flight) && v.flight <= lastFlown && stateIdx(v.state) < stateIdx("flight")) { v.state = "flight"; changes.push(`${v.id} flew Flight ${v.flight}`); }
  for (const p of PADS) if (!reg.pads[p.id]) { reg.pads[p.id] = { id: p.id, name: p.name, type: p.id === "MASSEYS" ? "test site" : "pad", status: "tracked", flight: null, events: [] }; changes.push(`seed pad ${p.name}`); }
  return changes;
}
function newestFlown(reg, type) { return Math.max(0, ...Object.values(reg.vehicles).filter((v) => v.type === type && stateIdx(v.state) >= stateIdx("flight")).map((v) => num(v.id))); }
const trustedTier = (handle) => { const a = SRC.byHandle ? SRC.byHandle(handle) : null; return a ? a.tier : 3; };
const ukDay = (iso) => require("./push-sync.js").ukDay(iso);
const evId = (key) => `fv-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 10)}`;
// Picture rule (same sources as the Road cards / media cascade): the post's OWN photo (score 3), else its own video
// preview (score 2); never a link card / banner image, never a screenshot: PNG grabs, posts that say they show a
// livestream / screen grab, or posts crediting another account's camera ("📸 … @NASASpaceflight", "| Starbase Live")
// get NO picture (a text card is better than a grab with a ticker). A later source of the same event may upgrade it.
const SCREEN = /\b(screen ?(?:shot|grab|cap)|starbase live|live ?stream|livestream cam|watch live)\b/i;
function creditsOther(post) {
  const me = String(((post || {}).author || {}).username || "").toLowerCase(), t = String((post || {}).text || "");
  const m = t.match(/(?:📸|🎥|📷|🎬)[^\n]*?@(\w{1,15})/u);
  return !!(m && m[1].toLowerCase() !== me);
}
function bestImage(post) {
  const media = (post && post.media) || [];
  if (SCREEN.test((post && post.text) || "") || creditsOther(post)) return null;
  const photo = media.find((m) => m.type === "photo" && m.url && !/\.png(?:$|\?)/i.test(m.url));
  if (photo) return { type: "photo", url: photo.url, score: 3 };
  const vid = media.find((m) => m.type === "video" && m.poster);
  return vid ? { type: "video", url: vid.poster, ...(vid.video_url ? { video_url: vid.video_url } : {}), score: 2 } : null;
}
function textFor(id, ev, sentence, flight) {
  const N = nameOf(id), at = ev.place ? ` at ${ev.place}` : "";
  switch (ev.type) {
    case "cryo_start": return `${N} began cryo testing${at}.`;
    case "cryo_done": return `${N} completed ${/\b(first|1st|round)\b/i.test(sentence) ? "its first round of " : ""}cryo testing${at}.`;
    case "static_fire": return `${N} completed a static fire${at}.`;
    case "engines_installed": return `${N} has all its engines installed.`;
    case "stacked": return `${N} was stacked${at}.`;
    case "rollout": return `${N} rolled out to ${ev.place}.`;
    case "move": if (!ev.place && ev.from) return `${N} left ${ev.from}.`; return /\b(arriv\w*|joining|together at|at (?:the )?massey|stands?)\b/i.test(sentence) ? `${N} is at ${ev.place}.` : `${N} headed to ${ev.place}.`;
    default: { const s = clean(sentence).replace(/\s*(?:yesterday|today|tonight|this morning)\b/gi, "").replace(/[!]+/g, ".").replace(/\s+\./g, ".").trim(); return /[.]$/.test(s) ? s : `${s}.`; }
  }
}
/* ingest(reg, posts, ctx) — posts in the x-first card shape { post_id, url, text, created_at, author:{username}, media:[] }.
   ctx: { road, now, backfill, log }. Returns { events: [new events], updated: [events that got a source], pushes: [push decisions], added: [new vehicles], assigned: [...] } */
function ingest(reg, posts, { road = {}, now = Date.now(), backfill = false, log = () => {}, maxPushAgeH = 6 } = {}) {
  const res = { events: [], updated: [], pushes: [], added: [], assigned: [], ignored: [] };
  const cur = new Set((road.vehicles || []).map(String));
  const V = reg.vehicles;
  const sorted = [...(posts || [])].filter((p) => p && p.post_id && p.created_at).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const p of sorted) {
    const handle = String((p.author && p.author.username) || "");
    const tier = trustedTier(handle);
    if (tier > 2) continue; // trusted accounts only (sources.js); everything else is never a registry fact
    if (isRecap(p.text)) { res.ignored.push(`${p.post_id}: recap / weekly round-up (not a new event)`); continue; }
    for (const s of sentences(p.text)) {
      const ids = idsIn(s);
      if (!ids.length) continue;
      // 1. new vehicles (only numbers newer than what already flew)
      for (const id of ids) {
        if (V[id]) continue;
        const t = typeOf(id);
        if (num(id) <= newestFlown(reg, t)) { res.ignored.push(`${id}: older than the newest flown ${t}`); continue; }
        V[id] = { id, type: t, name: nameOf(id), state: "build", flight: null, flight_history: [], first_seen: p.created_at, first_src: p.url, events: [] };
        res.added.push(id); log(`fleet: new vehicle ${id} (first seen @${handle} ${p.post_id})`);
      }
      // 2. flight assignment
      for (const a of assignmentsIn(s)) {
        const v = V[a.id]; if (!v) continue;
        if (stateIdx(v.state) >= stateIdx("flight") && v.flight !== a.flight) { res.ignored.push(`${a.id}: already flew Flight ${v.flight}, not re-assigned to ${a.flight}`); continue; }
        if (Number.isInteger(road.flight) && a.flight < road.flight && v.flight !== a.flight) { res.ignored.push(`${a.id}: Flight ${a.flight} is older than the tracked flight`); continue; }
        if (v.flight === a.flight) continue;
        const last = v.flight_history[v.flight_history.length - 1];
        if (last && Date.parse(last.at) > Date.parse(p.created_at)) continue; // an older post never overrides a newer assignment
        v.flight_history.push({ flight: a.flight, at: p.created_at, src: p.url }); const from = v.flight; v.flight = a.flight;
        res.assigned.push({ id: a.id, from, to: a.flight }); log(`fleet: ${a.id} → Flight ${a.flight}${from != null ? ` (was ${from})` : ""} (@${handle})`);
      }
      // 3. events, per clause; a clause that names no vehicle inherits the sentence's single vehicle
      for (const c of clauses(s)) {
        const cids0 = idsIn(c); const cids = cids0.length ? cids0 : (ids.length === 1 ? ids : []);
        if (!cids.length) continue;
        for (const ev of eventsIn(c, s)) for (const id of cids) {
          const v = V[id]; if (!v) continue;
          if (ev.terminal) {
            if (ev.type === "caught" || ev.type === "expended") { if (!(stateIdx(v.state) >= stateIdx("rollout"))) continue; } // only a vehicle that rolled out / flew can be caught or expended
            if (!TERMINAL.has(v.state)) { v.state = ev.type; v.state_at = p.created_at; v.state_src = p.url; res.updated.push({ id, state: ev.type }); log(`fleet: ${id} → ${ev.type}`); }
            continue;
          }
          if (stateIdx(v.state) >= stateIdx("flight")) continue; // a flown / retired vehicle only changes by a terminal event
          if (ev.type === "build" && stateIdx(v.state) > stateIdx("build")) continue;
          if (ev.type === "move" && ev.hedged) continue;
          const milestone = MILESTONES.includes(ev.type);
          const key = milestone ? `${id}|${ev.type}` : `${id}|${ev.type}|${ev.place || (ev.from ? "from " + ev.from : "-")}|${ukDay(p.created_at)}`;
          const img = bestImage(p);
          let e = v.events.find((x) => x.key === key);
          if (e) {
            if (!e.sources.some((x) => x.post_id === p.post_id)) { e.sources.push({ post_id: p.post_id, url: p.url, src: `@${handle}`, at: p.created_at }); if (img) { addCandidate(e, p, img); if (!e.image || (img.score || 0) > (e.image.score || 0)) { e.image = img; e.x_post = xCard(p, img); e.image_src = p.url; delete e.image_checked; } } res.updated.push(e); }
            continue;
          }
          e = { id: evId(key), key, vehicle: id, type: ev.type, milestone, at: p.created_at, date: ukDay(p.created_at), text: textFor(id, ev, c, v.flight), ...(ev.place ? { place: ev.place } : {}),
            url: p.url, src: `@${handle}`, tier, post_id: p.post_id, flight: Number.isInteger(v.flight) ? v.flight : null, image: img, x_post: img ? xCard(p, img) : null, ...(img ? { image_src: p.url } : {}),
            sources: [{ post_id: p.post_id, url: p.url, src: `@${handle}`, at: p.created_at }], ...(backfill ? { backfill: true } : {}) };
          if (img) addCandidate(e, p, img);
          v.events.push(e); res.events.push(e);
          if (milestone && stateIdx(MILESTONE_STATE[ev.type]) > stateIdx(v.state) && !TERMINAL.has(v.state) && v.state !== "flight") { v.state = MILESTONE_STATE[ev.type]; v.state_at = p.created_at; }
          log(`fleet: ${id} ${ev.type}${ev.place ? ` @ ${ev.place}` : ""} — "${e.text}" (@${handle} ${p.post_id})${backfill ? " [backfill]" : ""}`);
          // pushes: one per vehicle + milestone
          if (!milestone) continue;
          const pk = `${id}|${ev.type}`;
          if (reg.pushed[pk]) { res.pushes.push({ key: pk, push: false, reason: `already decided (${reg.pushed[pk].why})`, event: e.id }); continue; }
          let why = null;
          if (backfill) why = "backfill (seeded, never pushed)";
          else if (cur.has(id)) why = `tracked-flight vehicle: the Road pipeline pushes it`;
          else if (now - Date.parse(p.created_at) > maxPushAgeH * 3600000) why = `post older than ${maxPushAgeH}h`;
          reg.pushed[pk] = { at: new Date(now).toISOString(), event: e.id, why: why || "push" };
          if (why) { res.pushes.push({ key: pk, push: false, reason: why, event: e.id }); continue; }
          const title = `${PUSH_ICON[ev.type]} ${nameOf(id)} · ${PUSH_LABEL[ev.type]}`;
          e.push = { title, at: e.at };
          res.pushes.push({ key: pk, push: true, event: e.id, n: { title, body: e.text, url: e.url, at: e.at, kind: "fleet", fleet_key: pk, source_text: p.text, author: handle, visible: { where: "fleet", id: e.id } } });
        }
      }
    }
  }
  if (res.events.length || res.updated.length || res.added.length || res.assigned.length) reg.updated = new Date(now).toISOString();
  return res;
}
// the card shows ONE picture: the chosen one, credited to its own post (which may be a later source of the same event)
function xCard(p, img) { const m = (p.media || []).find((x) => (img.type === "photo" ? x.url === img.url : x.poster === img.url)); return { url: p.url, author: { username: (p.author || {}).username || "" }, media: m ? [m] : [] }; }
function addCandidate(e, p, img) { e.candidates = [...(e.candidates || []).filter((c) => c.url !== img.url), { ...img, post_url: p.url, author: (p.author || {}).username || "", at: p.created_at, media: xCard(p, img).media }].slice(-6); }
/* Pixel check of the picked picture (ffmpeg, preinstalled on the runner; one small decode per NEW picture, no API call):
   a livestream lower-third / ticker (a solid red band, or a dark full-width bar under a bright scene) is a screen grab,
   so the next-best candidate of the same event is used, else no picture. */
function probeBanner(url, { spawn = require("child_process").spawnSync } = {}) {
  const W = 160, H = 90;
  const r = spawn("ffmpeg", ["-loglevel", "error", "-i", url, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { timeout: 20000, maxBuffer: 1e6 });
  if (!r || r.status !== 0 || !r.stdout || r.stdout.length < W * H * 3) return null; // no ffmpeg / fetch failed → unknown
  return bannerOf(r.stdout, W, H);
}
function bannerOf(buf, W = 160, H = 90) {
  const at = (x, y) => [buf[(y * W + x) * 3], buf[(y * W + x) * 3 + 1], buf[(y * W + x) * 3 + 2]];
  const lum = (y) => { let t = 0; for (let x = 0; x < W; x++) { const [r, g, b] = at(x, y); t += 0.3 * r + 0.59 * g + 0.11 * b; } return t / W; };
  let redRows = 0;
  for (let y = Math.floor(H * 0.75); y < H; y++) { let n = 0; for (let x = 0; x < W; x++) { const [r, g, b] = at(x, y); if (r > 140 && g < 90 && b < 90) n++; } if (n / W >= 0.5) redRows++; } // a full-width red row is a ticker, not a scene
  const bot = [0, 1, 2, 3, 4].reduce((a, k) => a + lum(H - 1 - k), 0) / 5, mid = Array.from({ length: 15 }, (_, k) => lum(Math.round(H * 0.72) + k)).reduce((a, x) => a + x, 0) / 15;
  if (redRows >= 2) return { banner: true, why: "red ticker band" };
  if (bot < 45 && mid - bot > 70) return { banner: true, why: "dark lower-third bar" };
  return { banner: false };
}
async function screenImages(reg, { probe = probeBanner, log = () => {} } = {}) {
  let checked = 0, swapped = 0;
  for (const v of Object.values(reg.vehicles || {})) for (const e of v.events || []) {
    if (!e.candidates || !e.candidates.length || e.image_checked) continue;
    const order = [...e.candidates].sort((a, b) => (b.score || 0) - (a.score || 0) || Date.parse(a.at) - Date.parse(b.at));
    let pick = null, unknown = false;
    for (const c of order) { const r = probe(c.url); checked++; if (r === null) { unknown = true; break; } if (!r.banner) { pick = c; break; } log(`fleet image: ${e.vehicle} ${e.type} — ${c.url} rejected (${r.why})`); }
    if (unknown) continue; // try again next run
    const before = e.image && e.image.url;
    if (pick) { e.image = { type: pick.type, url: pick.url, score: pick.score, ...(pick.video_url ? { video_url: pick.video_url } : {}) }; e.x_post = { url: pick.post_url, author: { username: pick.author }, media: pick.media }; e.image_src = pick.post_url; }
    else { e.image = null; e.x_post = null; delete e.image_src; }
    e.image_checked = true; if ((e.image && e.image.url) !== before) swapped++;
  }
  return { checked, swapped };
}
function findEvent(reg, id) { for (const v of Object.values((reg && reg.vehicles) || {})) { const e = (v.events || []).find((x) => x.id === id); if (e) return e; } return null; }
// sendPush's "is it visible in the app" check for a fleet push
function visibleFor(reg, n) { const e = findEvent(reg, (n.visible || {}).id); return e && { title: e.push && e.push.title, body: e.text, url: e.url, at: e.push && e.push.at }; }
// Page 2 groups: flights after the tracked one, then unassigned; terminal vehicles are folded (kept in data)
function groups(reg, road = {}) {
  const tracked = road.flight, out = new Map();
  for (const v of Object.values((reg && reg.vehicles) || {})) {
    if (v.type === "pad") continue;
    const later = Number.isInteger(v.flight) ? v.flight > tracked : stateIdx(v.state) < stateIdx("flight");
    if (!later && !TERMINAL.has(v.state)) continue;
    if (TERMINAL.has(v.state) && Number.isInteger(v.flight) && v.flight <= tracked) continue; // flown + caught: Flight Log territory
    const k = TERMINAL.has(v.state) ? "retired" : Number.isInteger(v.flight) ? v.flight : "unassigned";
    if (!out.has(k)) out.set(k, []); out.get(k).push(v);
  }
  return out;
}
// 6-hourly coverage check (time-gated inside check-road.js; no workflow change). ONE X search call.
const COVERAGE_H = 6;
function coverageDue(reg, now = Date.now()) { return !reg.coverage || !Number.isFinite(Date.parse(reg.coverage.at)) || now - Date.parse(reg.coverage.at) >= COVERAGE_H * 3600000; }
function coverageQuery(reg) {
  const live = Object.values(reg.vehicles).filter((v) => v.type !== "pad" && !TERMINAL.has(v.state) && stateIdx(v.state) < stateIdx("flight"));
  const terms = new Set();
  for (const v of live) { terms.add(v.id); terms.add(`"${v.name}"`); }
  for (const t of ["booster", "ship"]) { const hi = Math.max(newestFlown(reg, t), ...live.filter((v) => v.type === t).map((v) => num(v.id))); for (const k of [1, 2]) { const id = `${t === "booster" ? "B" : "S"}${hi + k}`; terms.add(id); terms.add(`"${nameOf(id)}"`); } } // the next numbers: new hardware is discovered too
  const words = "(cryo OR cryogenic OR \"static fire\" OR stacked OR rollout OR \"rolled out\" OR raptors OR engines OR Massey OR Massey's OR \"Mega Bay\" OR Megabay)";
  let q = `(${[...terms].join(" OR ")}) ${words} -is:retweet -is:reply`;
  while (q.length > 500 && terms.size > 2) { terms.delete([...terms].pop()); q = `(${[...terms].join(" OR ")}) ${words} -is:retweet -is:reply`; }
  return q;
}
// gaps = trusted posts naming a registry vehicle with an event that the registry and the feed don't have
function coverageGaps(reg, posts, road = {}) {
  const known = new Set(), feedUrls = new Set([...(road.feed_items || []), ...(road.feed_archive || [])].map((f) => f.url).filter(Boolean));
  for (const v of Object.values(reg.vehicles)) for (const e of v.events || []) for (const s of e.sources || []) known.add(s.post_id);
  for (const c of road.categories || []) for (const h of c.history || []) { if (h.url) feedUrls.add(h.url); for (const x of h.x_posts || []) known.add(String(x)); }
  const gaps = [];
  for (const p of posts || []) {
    if (trustedTier((p.author || {}).username) > 2 || known.has(p.post_id) || feedUrls.has(p.url)) continue;
    const evs = sentences(p.text).flatMap((s) => clauses(s).flatMap((c) => eventsIn(c, s).filter((e) => !e.terminal && !e.hedged).map((e) => ({ ...e, ids: idsIn(c).length ? idsIn(c) : idsIn(s) }))));
    if (evs.length && evs.some((e) => e.ids.length)) gaps.push({ post_id: p.post_id, url: p.url, at: p.created_at, author: (p.author || {}).username, vehicles: [...new Set(evs.flatMap((e) => e.ids))], events: [...new Set(evs.map((e) => e.type))], text: clean(p.text).slice(0, 200) });
  }
  return gaps;
}
async function runCoverage(reg, { token, fetchFn = fetch, road = {}, postCard, now = Date.now(), log = () => {} } = {}) {
  if (!token) return { skipped: "no X token" };
  const u = new URL("https://api.x.com/2/tweets/search/recent");
  u.searchParams.set("query", coverageQuery(reg)); u.searchParams.set("max_results", "50");
  const since = reg.coverage && reg.coverage.at ? Date.parse(reg.coverage.at) : now - COVERAGE_H * 3600000;
  u.searchParams.set("start_time", new Date(Math.max(since - 15 * 60000, now - 7 * 86400000 + 60000)).toISOString());
  for (const [k, v] of Object.entries({ "tweet.fields": "created_at,author_id,attachments,note_tweet,entities", expansions: "attachments.media_keys,author_id", "media.fields": "type,url,preview_image_url,width,height", "user.fields": "username,name" })) u.searchParams.set(k, v);
  const r = await fetchFn(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { reg.coverage = { at: new Date(now).toISOString(), ok: false, error: `X search HTTP ${r.status}`, gaps: (reg.coverage && reg.coverage.gaps) || [] }; return { error: `HTTP ${r.status}` }; }
  const j = await r.json();
  const mediaByKey = Object.fromEntries((((j.includes || {}).media) || []).map((m) => [m.media_key, m])), usersById = Object.fromEntries((((j.includes || {}).users) || []).map((x) => [x.id, x]));
  const posts = (j.data || []).map((p) => postCard(p, mediaByKey, usersById));
  const gaps = coverageGaps(reg, posts, road);
  const healed = gaps.length ? ingest(reg, posts.filter((p) => gaps.some((g) => g.post_id === p.post_id)), { road, now, log }) : null;
  reg.coverage = { at: new Date(now).toISOString(), ok: true, calls: 1, read: posts.length, gaps: gaps.map((g) => ({ ...g, healed: !!healed })), query_len: u.searchParams.get("query").length };
  log(`fleet coverage: 1 X call, ${posts.length} post(s) read, ${gaps.length} gap(s)${gaps.length ? " → added to the registry" : ""}`);
  return { posts, gaps, healed };
}
module.exports = { screenImages, probeBanner, bannerOf, FILE, STATES, TERMINAL, STATE_LABEL, MILESTONES, PUSH_LABEL, BOX_OF, PADS, load, save, empty, seed, ingest, idsIn, assignmentsIn, eventsIn, sentences, clauses, nameOf, groups, findEvent, visibleFor, flownFlights, newestFlown, coverageDue, coverageQuery, coverageGaps, runCoverage, COVERAGE_H, bestImage };
