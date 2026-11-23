/* Automatic flight story photos (Page 1 flight card carousel): up to 10 pictures per launched flight, highlight first,
   then the flight in order. Writes road.archive[n].story_photos = [{ slot, src, credit, author, source_post, source_url,
   kind, w, h, small?, posted }]; app.js cardPhotosOf reads it first (falls back to the old behaviour when absent).
   - Slots (empty ones skipped, never padded): hero, rollout, liftoff, ascent, hot_staging, booster, orbit, reentry,
     ship_return, aftermath. Hero = ship catch > booster catch > splashdown > liftoff.
   - Source order: SpaceX photos > SpaceX video frames (webcast data overlay cropped) > tier-1 outlet photos > tier-2
     photos. Landscape first, >= 1600 px wide (else the largest, flagged `small`). Never a screen grab / banner
     (fleet.bannerOf pixel check), never a recap/promo post.
   - Window: the flight's rollout (else liftoff - 10 days) to its last flight event + 7 days. While the window is open
     a better picture can replace an earlier one; after it closes the set is frozen.
   - Cost: posts come from the X-first fetch the checker already makes (no extra X call). Choosing between several
     photos of one post (or webcast frames) is one Grok vision call per slot, only when that slot's candidates change,
     at most MAX_ASK per run. No Grok → the largest landscape photo / sharpest frame.
   - Image cache: every picked picture is stored once under images/story/f<n>/ (data/story.json "cache" maps the
     source → file), so the card never hotlinks and a reused source is never downloaded again.
   Nothing here pushes, and nothing names a flight, vehicle or post: flights, launch times and vehicles come from
   app.js FLIGHTS, road.json and the fleet registry. */
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "data", "story.json");
const SLOTS = ["hero", "rollout", "liftoff", "ascent", "hot_staging", "booster", "orbit", "reentry", "ship_return", "aftermath"];
const MAX = 10, WINDOW_AFTER_MS = 7 * 86400000, BEFORE_MS = 10 * 86400000, MIN_W = 1600, MAX_ASK = 3;
const HERO_ORDER = ["ship_catch", "booster_catch", "splashdown", "liftoff"];
const LAST_EVENT_BEATS = ["ship_catch", "booster_catch", "splashdown", "ship_return", "reentry", "aftermath_event"];
const DESC = {
  hero: "the flight's highlight: the vehicle caught by the tower arms / landing / lifting off, vehicle clearly visible",
  rollout: "the vehicle on its transporter moving to the launch pad", liftoff: "liftoff: the full stack rising from the pad on its exhaust",
  ascent: "the stack climbing through the sky after liftoff (a different view from the liftoff shot)", hot_staging: "hot staging: the ship's engines igniting as it separates from the booster",
  booster: "the booster during its return: boostback, landing burn, catch or splashdown", orbit: "the ship in space, Earth visible",
  reentry: "reentry: plasma glowing around the ship", ship_return: "the ship on final approach or landing burn",
  aftermath: "after the flight: the recovered vehicle or the team with it",
};

// ── which accounts, how good a source
let SRC = null;
function sources() {
  if (SRC) return SRC;
  const acc = require("./sources.js").ACCOUNTS; SRC = new Map(acc.map((a) => [a.handle.toLowerCase(), a])); return SRC;
}
const acctOf = (p) => sources().get(String((p.author && p.author.username) || p.author || "").toLowerCase()) || null;
function sourceRank(p, kind) { // SpaceX photo 30 > SpaceX frame 20 > tier-1 photo 12 > tier-2 photo 10 > other frames 5
  const a = acctOf(p); if (!a) return 0;
  if (a.official) return kind === "photo" ? 30 : 20;
  if (kind !== "photo") return 5;
  return a.tier === 1 ? 12 : 10;
}
// original-resolution X picture (name=orig); video posters have no orig and stay as they are
function origUrl(u) {
  const s = String(u || "");
  if (!/^https:\/\/pbs\.twimg\.com\/media\//.test(s) || /[?&]name=/.test(s)) return s;
  return s + (s.includes("?") ? "&" : "?") + "name=orig";
}

// ── what a post shows (text only; future / hedged phrases removed first: "ahead of a planned catch" is not a catch)
const FUTURE = /\b(?:for|ahead of|toward|towards|go for|on course to|planned|targeting|to|before|soon|will|ready for|polled go to)\s+(?:an?\s+|its\s+|the\s+)?(?:planned\s+|offshore\s+|return to launch site\s+|launch site\s+)?(?:catch\w*|splash\w*|re-?ent\w*|landing|orbit|liftoff|launch|return)\b/gi;
const NOT_STARSHIP = /\b(falcon|dragon|crew-\d|starlink manufactur|supercompute|beach|docuseries|go for orbit”)/i;
const STARSHIP = /\b(starship|super heavy|mechazilla|booster \d+|ship \d+|flight \d+|[BS]\d{2,3})\b/i;
const RECAP = /\b(on (monday|tuesday|wednesday|thursday|friday|saturday|sunday), \w+ \d+|this week|recap|new level unlocked|watch the (latest )?episode|docuseries)\b/i;
const BEATS = {
  ship_catch: (t) => /\b(catch(es)?|caught)\b/i.test(t) && /\b(starship|ship)\b/i.test(t) && !/\b(super heavy|booster)\b[^.]*\b(catch|caught)/i.test(t),
  booster_catch: (t) => /\b(super heavy|booster)\b[^.]*\b(catch(es)?|caught)\b|\b(catch(es)?|caught)\b[^.]*\b(super heavy|booster)\b/i.test(t),
  splashdown: (t) => /\bsplash ?down|splashed down\b/i.test(t),
  rollout: (t) => /\b(roll(s|ed|ing)? ?(out|to)|rollout|mov(es|ed|ing)? to (the )?(\w+ )?(pad|launch site|launch mount)|heads? to the (launch )?pad)\b/i.test(t),
  liftoff: (t) => /\blift ?-?off\b|\blifts? off\b/i.test(t),
  ascent: (t) => /\bascent\b|\bmax[- ]?q\b|\bclimb/i.test(t),
  hot_staging: (t) => /\bhot[- ]?stag|\bstage separation\b/i.test(t),
  booster: (t) => /\b(super heavy|booster)\b/i.test(t) && /\b(landing burn|boostback|splash ?down|splashed|catch(es)?|caught|landing)\b/i.test(t),
  orbit: (t) => /\b(in orbit|orbit over|in space|coast\w* in orbit|over (africa|europe|asia|australia|the (pacific|atlantic|indian) ocean))\b/i.test(t) && !/\benters? orbit|insertion\b/i.test(t),
  reentry: (t) => /\bre-?enter(ing|s)\b|\bre-?entry\b|\bplasma\b/i.test(t),
  ship_return: (t) => /\b(starship|ship)\b/i.test(t) && /\b(landing burn|final approach|flip|return(s|ed)? to (starbase|the launch site)|back to starbase)\b/i.test(t) && !/\b(super heavy|booster)\b/i.test(t),
  aftermath: (t) => /\b(team|teams|crew|back on earth|recover\w*|returned|after (the|its) (flight|catch|landing))\b/i.test(t) && !/\bbefore\b/i.test(t),
};
function beatsOf(text) {
  const raw = String(text || "").replace(/https?:\/\/\S+/g, " ");
  if (NOT_STARSHIP.test(raw) || !STARSHIP.test(raw)) return [];
  const t = raw.replace(FUTURE, " ");
  return Object.keys(BEATS).filter((b) => BEATS[b](t));
}
const isLive = (t) => /\blive\b|\blivestream|\bwatch\b/i.test(t || "");

// ── flights: launch times (app.js FLIGHTS), vehicles (FLIGHTS + road + registry)
function flightsFrom(appJsText) {
  return [...String(appJsText || "").matchAll(/\{\s*n:\s*(\d+),\s*date:\s*"([^"]+)"([^}]*)\}/g)].map((m) => {
    const b = (m[3].match(/booster:\s*"([BS]?\d+)"/) || [])[1], s = (m[3].match(/ship:\s*"(S?\d+)"/) || [])[1];
    return { n: +m[1], at: Date.parse(m[2]), vehicles: [b, s].filter(Boolean).map((v) => (/^\d+$/.test(v) ? v : v)) };
  }).filter((f) => Number.isFinite(f.at));
}
// which flight a post is about: an explicit "Flight N", else one of its vehicles, else (official / tier 1 only, Starship
// text) the flight whose window it falls in. Tier-2 posts need an explicit mention.
function flightOf(p, ctx) {
  const t = String(p.text || "");
  const fm = t.match(/\bflight\s+(\d{1,3})\b/i); if (fm) return +fm[1];
  const ids = [...t.matchAll(/\b(?:(booster|ship|starship)\s+(\d{1,3})|([BS])(\d{2,3}))\b/gi)].map((m) => (m[1] ? (/^b/i.test(m[1]) ? "B" : "S") + m[2] : m[3].toUpperCase() + m[4]));
  for (const id of ids) if (ctx.vehicleFlight[id]) return ctx.vehicleFlight[id];
  const a = acctOf(p); if (!a || !(a.official || a.tier === 1)) return null;
  const at = Date.parse(p.created_at);
  const launched = ctx.flights.filter((f) => f.at <= at).sort((x, y) => y.at - x.at)[0];
  if (launched && at - launched.at <= 12 * 86400000) return launched.n; // after a launch: that flight (its window is checked later)
  return ctx.roadFlight || null; // before the launch (rollout): the tracked flight
}
function ctxFrom({ road = {}, appJsText = "", fleet = null } = {}) {
  const flights = flightsFrom(appJsText), vehicleFlight = {};
  for (const f of flights) for (const v of f.vehicles) vehicleFlight[/^\d+$/.test(v) ? v : v] = f.n;
  for (const [k, n] of Object.entries(road.hardware_flights || {})) vehicleFlight[k] = n;
  for (const v of Object.values((fleet && fleet.vehicles) || {})) if (Number.isInteger(v.flight) && !vehicleFlight[v.id]) vehicleFlight[v.id] = v.flight;
  return { flights, vehicleFlight, roadFlight: road.flight };
}

// ── store (data/story.json): per-flight pool of compact posts, picks, cache
function load(file = FILE) { try { const s = JSON.parse(fs.readFileSync(file, "utf8")); s.flights = s.flights || {}; s.cache = s.cache || {}; return s; } catch { return { version: 1, flights: {}, cache: {} }; } }
function save(st, file = FILE) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(st, null, 1) + "\n"); }
const compact = (p) => ({ id: String(p.post_id || p.id), url: p.url, author: (p.author && p.author.username) || p.author || "", at: p.created_at, text: String(p.text || "").slice(0, 400),
  media: (p.media || []).map((m) => ({ type: m.type, ...(m.url ? { url: m.url } : {}), ...(m.poster ? { poster: m.poster } : {}), ...(m.video_url ? { video_url: m.video_url } : {}), ...(m.w ? { w: m.w, h: m.h } : {}) })) });
// add new posts to their flight's pool (only posts with pictures and a story beat)
function ingest(st, posts, ctx, { log = () => {} } = {}) {
  let added = 0;
  for (const p of posts || []) {
    if (!(p.media || []).length || !acctOf(p) || RECAP.test(p.text || "") || isLive(p.text)) continue;
    const beats = beatsOf(p.text); if (!beats.length) continue;
    const n = flightOf(p, ctx); if (!Number.isInteger(n)) continue;
    const fl = (st.flights[n] = st.flights[n] || { posts: {} });
    if (fl.frozen) continue;
    const c = compact(p); if (fl.posts[c.id]) continue;
    fl.posts[c.id] = { ...c, beats }; added++;
  }
  if (added) log(`flight story: ${added} new candidate post(s)`);
  return added;
}

// ── plan: which post (and which of its pictures) fills each slot. Pure; `choose(slot, cands)` picks within a post.
function windowOf(fl, f) {
  const posts = Object.values(fl.posts || {});
  const roll = posts.filter((p) => p.beats.includes("rollout") && Date.parse(p.at) < f.at).map((p) => Date.parse(p.at));
  const from = roll.length ? Math.min(...roll) : f.at - BEFORE_MS;
  const ev = posts.filter((p) => Date.parse(p.at) >= f.at && p.beats.some((b) => LAST_EVENT_BEATS.includes(b) && b !== "aftermath")).map((p) => Date.parse(p.at));
  // "last event" = the latest return/catch/splashdown post within 3 days of liftoff (later posts are retrospectives)
  const last = Math.max(f.at, ...ev.filter((t) => t - f.at <= 3 * 86400000));
  return { from, last, to: last + WINDOW_AFTER_MS };
}
const landscape = (m) => !(m.w && m.h) || m.w >= m.h;
function picsOf(p) { // candidate pictures of one post: photos, else its video (frames)
  const photos = (p.media || []).filter((m) => m.type === "photo" && m.url).map((m, i) => ({ kind: "photo", url: origUrl(m.url), w: m.w || 0, h: m.h || 0, i: i + 1 }));
  if (photos.length) return photos;
  const v = (p.media || []).find((m) => m.type === "video" && (m.video_url || m.poster));
  return v ? [{ kind: "frame", video_url: v.video_url || null, poster: v.poster || null, w: v.w || 0, h: v.h || 0, i: 1 }] : [];
}
function postScore(p, slot) {
  const pics = picsOf(p); if (!pics.length) return -1;
  const kind = pics[0].kind, land = pics.filter(landscape), big = land.filter((m) => !m.w || m.w >= MIN_W);
  const len = String(p.text || "").replace(/https?:\/\/\S+/g, "").trim().length;
  let s = sourceRank(p, kind) * 10 + (land.length ? 5 : 0) + (big.length ? 3 : 0) - Math.min(len, 280) / 100; // focused caption beats a long update
  if (slot === "aftermath" && /\b(team|teams|crew)\b/i.test(p.text)) s += 4; // the people with the vehicle close the story
  return s;
}
function plan(fl, f, { choose = null, now = Date.now() } = {}) {
  const win = windowOf(fl, f);
  const posts = Object.values(fl.posts || {}).filter((p) => { const t = Date.parse(p.at); return t >= win.from - 60000 && t <= win.to; });
  const used = new Set(), out = [], usedPostSlot = new Set();
  const key = (c, p) => (c.kind === "photo" ? `photo:${c.url}` : `frame:${p.id}`);
  const after = (p) => Date.parse(p.at) >= f.at - 3600000, before = (p) => Date.parse(p.at) < f.at;
  const slotPosts = {
    rollout: (p) => p.beats.includes("rollout") && before(p),
    liftoff: (p) => p.beats.includes("liftoff") && after(p),
    ascent: (p) => (p.beats.includes("ascent") || p.beats.includes("liftoff")) && after(p),
    hot_staging: (p) => p.beats.includes("hot_staging") && after(p),
    booster: (p) => p.beats.includes("booster") && after(p),
    orbit: (p) => p.beats.includes("orbit") && after(p),
    reentry: (p) => p.beats.includes("reentry") && after(p),
    ship_return: (p) => p.beats.includes("ship_return") && after(p),
    aftermath: (p) => p.beats.includes("aftermath") && Date.parse(p.at) > win.last,
  };
  const fill = (slot, cands) => {
    const ranked = cands.map((p) => ({ p, s: postScore(p, slot) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s || Date.parse(a.p.at) - Date.parse(b.p.at));
    for (const { p } of ranked) {
      let pics = picsOf(p).filter((c) => !used.has(key(c, p)));
      if (!pics.length) continue;
      const land = pics.filter(landscape); if (land.length) pics = land;
      const big = pics.filter((c) => !c.w || c.w >= MIN_W);
      const pool = big.length ? big : [...pics].sort((a, b) => b.w - a.w).slice(0, 1);
      const c = pool.length > 1 && choose ? choose(slot, p, pool) || pool[0] : [...pool].sort((a, b) => b.w * b.h - a.w * a.h)[0];
      used.add(key(c, p));
      return { slot, post: p, pic: c, small: !(c.w >= MIN_W) && !!c.w, key: key(c, p) };
    }
    return null;
  };
  // hero first (its picture is not reused), then the narrative slots in flight order
  let hero = null;
  for (const b of HERO_ORDER) {
    const cands = posts.filter((p) => p.beats.includes(b) && after(p));
    if (cands.length && (hero = fill("hero", cands))) { hero.beat = b; break; }
  }
  if (hero) out.push(hero);
  for (const slot of SLOTS.slice(1)) { if (out.length >= MAX) break; const r = fill(slot, posts.filter(slotPosts[slot])); if (r) out.push(r); }
  return { window: win, picks: out };
}

// ── pictures: download (orig) / webcast frame (overlay cropped), cache, screen-grab check
function ff(args, opts = {}) { return spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 1 << 26, timeout: 120000, ...opts }); }
function dims(file) { const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8", timeout: 30000 }); const m = String(r.stdout || "").match(/(\d+),(\d+)/); return m ? { w: +m[1], h: +m[2] } : null; }
function rawOf(file) { const r = ff(["-i", file, "-frames:v", "1", "-vf", "scale=160:90", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]); return r.status === 0 && r.stdout && r.stdout.length >= 160 * 90 * 3 ? r.stdout : null; }
// SpaceX webcast frames carry a data overlay (telemetry band at the bottom, logo/labels at the top): crop both.
const HUD_CROP = "crop=iw:ih*0.74:0:ih*0.07";
// a webcast split-screen / picture-in-picture layout (hosts + camera panel on a black canvas) is not a photo:
// near-black full-width bands at both the top and the bottom of the cropped frame
function panelLayout(buf, W = 160, H = 90) {
  const dark = (y) => { let n = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; if (buf[i] + buf[i + 1] + buf[i + 2] < 60) n++; } return n / W >= 0.9; };
  const band = (ys) => ys.filter(dark).length >= ys.length * 0.8;
  const k = Math.round(H * 0.1);
  return band([...Array(k).keys()]) && band([...Array(k).keys()].map((i) => H - 1 - i));
}
async function materialise(pick, n, idx, { root = ROOT, st, ask = null, log = () => {}, tmp = require("os").tmpdir() } = {}) {
  const hit = st.cache[pick.key];
  if (hit && hit.file && fs.existsSync(path.join(root, hit.file))) return hit;
  if (hit && hit.failed && Date.now() - Date.parse(hit.at) < 6 * 3600000) return null; // failed recently: retry in 6 h, not every run
  const fail = (why) => { st.cache[pick.key] = { failed: true, why, at: new Date().toISOString() }; log(`flight story: ${pick.slot} ${why}`); return null; };
  const dir = `images/story/f${n}`, rel = `${dir}/${String(idx + 1).padStart(2, "0")}-${pick.slot.replace(/_/g, "-")}-${pick.post.id}.jpg`, abs = path.join(root, rel);
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  const work = fs.mkdtempSync(path.join(tmp, "story-"));
  try {
    if (pick.pic.kind === "photo") {
      const r = ff(["-i", pick.pic.url, "-frames:v", "1", "-vf", "scale='min(2560,iw)':-2", "-q:v", "3", abs]);
      if (r.status !== 0) return fail(`download failed ${pick.pic.url}`);
    } else {
      if (!pick.pic.video_url) return fail("no video file");
      const r = ff(["-i", pick.pic.video_url, "-t", "90", "-vf", `fps=1,${HUD_CROP}`, "-q:v", "2", path.join(work, "f%03d.jpg")]);
      if (r.status !== 0) return fail(`frames failed for ${pick.post.url}`);
      const be = require("./best-frame.js");
      const files = fs.readdirSync(work).filter((f) => /^f\d+\.jpg$/.test(f)).sort().map((f) => path.join(work, f));
      const ranked = files.map((f, i) => ({ f, t: i, ...be.scoreFile(f, pick.slot === "liftoff" || pick.slot === "hot_staging" ? "launch" : null) }))
        .filter((x) => { const raw = rawOf(x.f); return raw && !require("./fleet.js").bannerOf(raw).banner && !panelLayout(raw); }).sort((a, b) => b.score - a.score);
      const top = []; for (const x of ranked) { if (top.length >= 4) break; if (top.every((o) => Math.abs(o.t - x.t) >= 3)) top.push(x); }
      if (!top.length) return fail("no clean frame");
      let best = top[0];
      if (ask && top.length > 1) { try { const v = await ask(`These ${top.length} frames come from SpaceX's video "${pick.post.text}". For a flight photo story slot that must show ${DESC[pick.slot]}, which frame is best (sharp, vehicle visible, no text overlay)? Reply JSON {"best": number 1-${top.length}, "confidence": 0-1, "seen": "few words"}.`, top.map((x) => `data:image/jpeg;base64,${fs.readFileSync(x.f).toString("base64")}`)); if (Number.isInteger(v.best) && top[v.best - 1]) best = top[v.best - 1]; } catch (e) { log(`flight story: frame pick by score (${e.message})`); } }
      const r2 = ff(["-i", best.f, "-vf", "scale='min(2560,iw)':-2", "-q:v", "3", abs]);
      if (r2.status !== 0) return fail("frame save failed");
    }
    const raw = rawOf(abs);
    if (raw && require("./fleet.js").bannerOf(raw).banner) { fs.rmSync(abs, { force: true }); return fail("picture rejected (screen grab)"); }
    const d = dims(abs) || { w: pick.pic.w, h: pick.pic.h };
    return (st.cache[pick.key] = { file: rel, w: d.w, h: d.h, at: new Date().toISOString() });
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
const askChoice = (ask, memo, max) => async (slot, p, pool) => { // Grok picks among several photos of one post (memoised per candidate set)
  const sig = `${slot}|${p.id}|${pool.map((c) => c.url).join(",")}`;
  if (memo[sig]) return pool.find((c) => c.url === memo[sig]) || null;
  if (!ask || max.left <= 0) return null;
  max.left--;
  try { const v = await ask(`These ${pool.length} photos are from one SpaceX post: "${p.text}". For a flight photo story slot that must show ${DESC[slot]}, which photo is best (vehicle clearly visible, sharp, landscape, no text)? (slot:${slot}) Reply JSON {"best": number 1-${pool.length}, "confidence": 0-1, "seen": "few words"}.`, pool.map((c) => c.url));
    const c = Number.isInteger(v.best) && pool[v.best - 1]; if (c) memo[sig] = c.url; return c || null; } catch { return null; }
};
// plan with async Grok choices: run plan() once to learn which posts need a choice, ask, then plan again with the answers
async function planAsync(fl, f, { ask = null, maxAsk = MAX_ASK, now = Date.now() } = {}) {
  fl.choices = fl.choices || {};
  const need = [];
  plan(fl, f, { choose: (slot, p, pool) => { const sig = `${slot}|${p.id}|${pool.map((c) => c.url).join(",")}`; if (!fl.choices[sig]) need.push({ slot, p, pool }); return pool.find((c) => c.url === fl.choices[sig]) || null; }, now });
  const left = { left: maxAsk }, choose = askChoice(ask, fl.choices, left);
  for (const x of need) await choose(x.slot, x.p, x.pool);
  return plan(fl, f, { choose: (slot, p, pool) => { const sig = `${slot}|${p.id}|${pool.map((c) => c.url).join(",")}`; return pool.find((c) => c.url === fl.choices[sig]) || null; }, now });
}
// build / refresh every launched flight whose window is open; frozen after. Returns { changed, files, flights }.
async function build(st, road, { appJsText = "", ask = null, now = Date.now(), root = ROOT, log = () => {}, materialiseFn = materialise, maxAsk = MAX_ASK } = {}) {
  const flights = flightsFrom(appJsText), res = { changed: false, files: [], flights: {} };
  for (const [k, fl] of Object.entries(st.flights)) {
    const n = +k, f = flights.find((x) => x.n === n); if (!f || f.at > now || fl.frozen) continue;
    const { window: win, picks } = await planAsync(fl, f, { ask, maxAsk, now });
    fl.window = { from: new Date(win.from).toISOString(), last: new Date(win.last).toISOString(), to: new Date(win.to).toISOString() };
    const story = [];
    for (const [i, pk] of picks.entries()) {
      const c = await materialiseFn(pk, n, i, { root, st, ask, log });
      if (!c) continue;
      if (!res.files.includes(c.file)) res.files.push(c.file);
      story.push({ slot: pk.slot, src: c.file, credit: (acctOf(pk.post) || {}).src || pk.post.author, author: pk.post.author, source_post: pk.post.url,
        ...(pk.pic.kind === "photo" ? { source_url: pk.pic.url } : { source_video: pk.pic.video_url || null }), kind: pk.pic.kind, w: c.w, h: c.h, ...(c.w < MIN_W ? { small: true } : {}), posted: pk.post.at });
    }
    road.archive = road.archive || {};
    const a = (road.archive[n] = road.archive[n] && !Array.isArray(road.archive[n]) ? road.archive[n] : { entries: road.archive[n] || [] });
    if (!Array.isArray(a.entries)) a.entries = [];
    if (story.length && JSON.stringify(a.story_photos || []) !== JSON.stringify(story)) { a.story_photos = story; res.changed = true; log(`flight story: Flight ${n} — ${story.length} photo(s): ${story.map((s) => s.slot).join(", ")}`); }
    if (now > win.to) { fl.frozen = true; res.changed = true; log(`flight story: Flight ${n} window closed — set frozen`); }
    res.flights[n] = story;
  }
  return res;
}
module.exports = { panelLayout, FILE, SLOTS, MAX, MIN_W, HERO_ORDER, WINDOW_AFTER_MS, origUrl, beatsOf, flightOf, flightsFrom, ctxFrom, load, save, ingest, plan, planAsync, build, materialise, windowOf, picsOf, sourceRank, compact, HUD_CROP };
