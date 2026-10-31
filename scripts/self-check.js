/* Daily self-check (consistency audit) — runs inside check-road.js, once a UK day: the first run at/after 06:00 Europe/London
   (state.selfCheck.day). Compares the hero (road.predicted), the Launch-date pill/card (categories.date), the progress cards
   and the Updates feed (feed_items) for the same vehicle and event, then FIXES what deterministic rules can settle and
   FLAGS the rest. Never sends a push, never adds a feed item, never creates or edits a milestone, never touches a card's
   picture (media_override / keep_image / SpaceX locks / tier order) and never drops a link or source: wording + metadata only.
   When two facts clash and the rules can't settle it, the higher-tier source's value is kept and the clash is logged;
   an optional judge (Grok, max JUDGE_CAP calls a day, every call logged) may only pick between the two existing values.
   Usage in code: selfCheck.due(state, now) → selfCheck.audit(road, { now, log, judge, dryRun }).
   CLI: node scripts/self-check.js [--dry]   (no network except caching pbs.twimg images when not --dry) */
const fs = require("fs"), path = require("path");
const TS = require("./text-split.js");
const ROOT = path.join(__dirname, "..");
const JUDGE_CAP = 5;
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const uk = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, key: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}` }; };
const ukDay = (iso) => { const p = uk(iso); return `${p.d} ${MON3[p.m - 1]}`; };
// whole UK calendar days between two instants (the day-gap rule used by app.js daysBetween)
const ukDayNum = (iso) => { const p = uk(iso); return Date.UTC(p.y, p.m - 1, p.d) / 86400000; };
const daysBetweenUK = (a, b) => ukDayNum(b) - ukDayNum(a);
const vehOf = (t) => { const out = new Set(); for (const m of String(t || "").matchAll(/\b(?:(B|S)(\d{2,3})|(Booster|Ship)\s+(\d{2,3}))\b/gi)) out.add(((m[1] || m[3])[0]).toUpperCase() + (m[2] || m[4])); return [...out]; };
const handleOf = (url) => (String(url || "").match(/x\.com\/([A-Za-z0-9_]{1,15})\/status\//) || [])[1] || null;
const pid = (url) => (String(url || "").match(/status\/(\d+)/) || [])[1] || null;
let tierOf = () => 3; try { tierOf = require("./road-pick.js").tierOf || tierOf; } catch {}
try { const SRC = require("./sources.js"); const t1 = SRC.handles((a) => a.tier === 1).map((x) => x.toLowerCase()), t2 = SRC.handles((a) => a.tier === 2).map((x) => x.toLowerCase()); tierOf = (h) => { const k = String(h || "").replace(/^@/, "").toLowerCase(); return t1.includes(k) ? 1 : t2.includes(k) ? 2 : 3; }; } catch {}

// due: first run on a UK day at/after 06:00 London that hasn't run the check yet
function due(state, now = Date.now()) {
  const p = uk(new Date(now).toISOString());
  return p.h >= 6 && !(state && state.selfCheck && state.selfCheck.day === p.key);
}
function markDone(state, now, summary) { state.selfCheck = { day: uk(new Date(now).toISOString()).key, at: new Date(now).toISOString(), ...summary }; }

const EVENT = [["static", /\bstatic fire|\bfired\b|\bfiring\b/i], ["cryo", /\bcryo/i], ["catch-lift", /catch height|chopsticks|top of the tower/i]];
const eventOf = (t) => (EVENT.find(([, re]) => re.test(t || "")) || [])[0] || null;
const DONE = /\b(completed?|completes|fired|finished|conducted)\b/i;
const PRESENT = /\b(?:is|are) (?:being |now )?(?:under ?way|progressing|moving|heading|rolling|in |at |on |back )|\bis being \w+ed\b|\bhas been \w+ed\b|^(?:(?:Ship|Booster) \d+) (?:rolls|arrives|heads|leaves|returns|moves|lifts)\b/i;
const v0 = (h) => h.id || h.date;
const tidy = (s) => String(s).replace(/\s+([.,;:!?])(?=\s|$)/g, "$1").replace(/\.{2,}$/, ".").replace(/ {2,}/g, " ").trim();

async function audit(road, { now = Date.now(), log = console.log, judge = null, dryRun = false, root = ROOT, fetchFn = null } = {}) {
  const fixes = [], flags = [], judged = [];
  const fix = (type, msg, before, after) => { fixes.push({ type, msg, before, after }); log(`SELFCHECK fix [${type}] ${msg}${before !== undefined ? ` | "${before}" → "${after}"` : ""}`); };
  const flag = (type, msg, kept, extra = {}) => { flags.push({ type, msg, kept, ...extra }); log(`SELFCHECK flag [${type}] ${msg}${kept ? ` — kept: ${kept}` : ""}`); };
  let calls = 0;
  const ask = async (q, a, b) => { // judge only picks between two existing values; capped + logged
    if (!judge || calls >= JUDGE_CAP) return null; calls++;
    let pick = null; try { pick = await judge(q, a, b); } catch (e) { log(`SELFCHECK judge failed: ${e.message}`); }
    judged.push({ q, a, b, pick }); log(`SELFCHECK judge ${calls}/${JUDGE_CAP}: ${q} → ${pick || "no answer (higher tier kept)"}`); return pick === "a" || pick === "b" ? pick : null;
  };
  const cats = road.categories || [], cat = (id) => cats.find((c) => c.id === id);
  const F = road.flight, tracked = (road.vehicles || []).map(String);
  const rows = []; // every card row + update row
  for (const c of cats) for (const h of c.history || []) { rows.push({ c, r: h, card: h }); for (const u of h.updates || []) rows.push({ c, r: u, card: h, up: true }); }

  // 1. launch date: hero (predicted.net) vs Launch-date card/pill vs feed
  const P = road.predicted, dc = cat("date");
  if (P && P.net && Number(P.flight) === F && dc) {
    const label = ukDay(`${P.net}T12:00:00Z`), netRe = /\bNET (\d{1,2} [A-Z][a-z]{2})[a-z]*/;
    const newest = Math.max(0, ...(dc.history || []).map((h) => Date.parse(h.at) || 0));
    for (const k of ["latest", "log_latest"]) {
      const m = String(dc[k] || "").match(netRe);
      if (m && m[1] !== label) {
        if ((Date.parse(P.updatedAt) || 0) > newest) { const before = dc[k]; dc[k] = k === "latest" ? `Flight ${F} targets NET ${label} (unofficial)` : `Flight ${F} NET ${label} (unofficial).`; fix("launch-date", `date card ${k} said NET ${m[1]}, hero says NET ${label} (${P.basis}, newer)`, before, dc[k]); }
        else flag("launch-date", `date card ${k} NET ${m[1]} vs hero NET ${label}: card is newer`, `card NET ${m[1]}`);
      }
    }
    if (dc.status === "pending" || dc.status === "none") { const before = dc.status; dc.status = "progress"; fix("launch-date", `pill read "Not yet" while the hero shows an estimated NET ${label}`, before, "progress"); }
    const fd = (road.feed_items || []).filter((f) => f.flight === F && (f.kind === "launch_date" || f.kind === "flight")).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const top = fd[0];
    if (top && !String(top.body).includes(label)) flag("launch-date", `newest feed date item "${top.body}" (${top.id}) is not NET ${label}; feed items are history, not rewritten`, `hero NET ${label}`);
    for (const f of fd) if (f.kind === "flight" && /^NET [A-Z][a-z]{2} \d{4}$/.test(f.body)) flag("launch-date", `feed "${f.body}" (${f.id}) is a month-only Launch Library date; hero day NET ${label} is the higher-tier value`, `hero NET ${label}`, { item: f.id, values: [f.body, `NET ${label}`], sources: [P.basis], reason: "feed item is history (not rewritten); hero/card use the higher-tier day" });
  } else if (dc && P && !P.net) flag("launch-date", "no hero NET; nothing to compare");

  // 2. same event, different time: progress card vs feed item (same vehicle + event, within 36 h)
  const feed = road.feed_items || [];
  for (const c of cats) for (const h of c.history || []) {
    const ev = eventOf(h.text); if (!ev || !DONE.test(h.text) || !h.at) continue;
    const vs = vehOf(h.text).length ? vehOf(h.text) : [String(h.hardware || "")];
    for (const f of feed) {
      if (!f.url || f.flight !== F || eventOf(f.body) !== ev || !DONE.test(f.body)) continue;
      const fv = vehOf(f.body); if (fv.length && !fv.some((v) => vs.includes(v))) continue;
      if (!fv.length && !/\b(ship|booster)\b/i.test(f.body)) continue;
      if (!fv.length && !vs.some((v) => (/^S/.test(v) && /\bship\b/i.test(f.body)) || (/^B/.test(v) && /\bbooster\b/i.test(f.body)))) continue;
      const dt = Math.abs(Date.parse(f.at) - Date.parse(h.at)); if (dt < 3600e3 || dt > 36 * 3600e3) continue;
      if (f.event_card === h.id && f.event_at === h.at) continue;
      const ct = tierOf(handleOf(h.url) || h.src), ft = tierOf(handleOf(f.url));
      const same = [h.url, ...(h.updates || []).map((u) => u.url)].some((u) => pid(u) && pid(u) === pid(f.url)) || (h.x_posts || []).map(String).includes(pid(f.url));
      if (!same) { // not provably the same firing (e.g. a later test the card doesn't have): keep both, judge or flag
        const p = await ask(`Is "${f.body}" (${f.at}) the same ${ev} event as "${h.text}" (${h.at})? a = same event, b = a different event`, "same", "different");
        if (p !== "a") { flag("event-time", `${v0(h)} card "${h.text}" ${h.at} vs feed ${f.id} "${f.body}" ${f.at}: not provably the same event; both kept (tiers ${ct}/${ft})`, `card ${h.at}`, { item: f.id, values: [h.at, f.at], sources: [h.url, f.url].filter(Boolean), reason: "same vehicle + event within 36 h, different times; not provably the same firing" }); continue; }
      }
      if (same && ukDay(f.at) !== ukDay(h.at) && ft <= ct) { // linked, but a higher/equal-tier post on another day may be a later firing
        const p = await ask(`Is "${f.body}" (${f.at}) the same ${ev} event as "${h.text}" (${h.at})? a = same event, b = a different event`, "same", "different");
        if (p !== "a") { flag("event-time", `${v0(h)} card "${h.text}" ${ukDay(h.at)} vs feed ${f.id} "${f.body}" ${ukDay(f.at)}: post is on the card but on another UK day and tier ${ft} ≤ ${ct}; could be a later firing, both kept`, `card ${h.at} / feed ${f.at}`, { item: f.id, values: [h.at, f.at], sources: [h.url, f.url].filter(Boolean), reason: "same post linked on the card but a different day; higher/equal-tier source" }); continue; }
      }
      const before = f.event_at || f.at; f.event_at = h.at; f.event_card = h.id;
      fix("event-time", `feed ${f.id} is the post time of ${h.id}'s ${ev}; feed now shows the event time (post time kept in "at")`, before, h.at);
    }
  }
  // 2b. a card marked done earlier than a later in-test observation on the same card (cryo 9 Oct style)
  for (const c of cats) for (const h of c.history || []) {
    if (!DONE.test(h.text || "") || !h.at) continue;
    const later = (h.updates || []).filter((u) => u.at && Date.parse(u.at) > Date.parse(h.at) && ukDay(u.at) === ukDay(h.at) && /\blikely in|under ?way|frost|in progress|propellant loading/i.test(u.text || ""));
    for (const u of later) if (!(h.self_check_flags || []).includes(`after:${u.at}`)) {
      const p = await ask(`"${h.text}" is timed ${h.at}, but "${u.text}" (same card) is at ${u.at}. Which is the completion time?`, h.at, u.at);
      if (p === "b") { const before = h.completed_at || h.at; h.completed_at = u.at; fix("event-time", `${h.id || h.text}: completion after the in-test observation (judge)`, before, u.at); }
      else flag("event-time", `${h.id || h.text} "${h.text}" ${ukDay(h.at)} ${uk(h.at).h}:xx UK precedes in-test row "${u.text}" ${u.at} on the same card`, `card time ${h.at} (higher-tier/first source)`, { item: h.id || h.text, values: [h.at, u.at], sources: [h.url, u.url].filter(Boolean), reason: "completion time precedes an in-test observation on the same card" });
    }
  }
  // 2c. a single-event card whose date range ends on another day than its own time (pad 11–13 Sep vs 12 Sep)
  for (const c of cats) for (const h of c.history || []) {
    if (!h.at || !/[–-]/.test(String(h.date || "")) || /[;]| and /.test(h.text || "")) continue;
    const day = ukDay(h.at); if (String(h.date).endsWith(day.split(" ")[1]) && String(h.date).replace(/^.*[–-]\s*/, "").startsWith(day.split(" ")[0] + " ")) continue;
    const before = h.date; h.date_range = before; h.date = day; fix("event-time", `${h.id || h.text}: one event ("${h.text}") shown as ${before}; its time is ${day}`, before, day);
  }
  // 2d. feed news about a tracked vehicle whose action is on no card → Earlier-updates row on that vehicle's card (B22 transporter)
  const ACT = /\b(transporter|lifted|lowered|returned|returning|returns|arrived|arrives|left|leaves|moved|rolled|rolls|static fire|cryo|stacked|caught)/i;
  const stem = (w) => String(w || "").toLowerCase().replace(/^(return|arriv|leav|left|roll|lift|lower|mov)\w*$/, "$1");
  const actOf = (t) => { const m = String(t || "").replace(/\bhas been moved onto its transporter\b/i, "transporter").match(ACT); return m ? stem(m[1]) : null; };
  const postsOf = (h) => new Set([pid(h.url), h.x_post && h.x_post.post_id, ...(h.x_posts || []).map(String), ...(h.also_posts || []).map((x) => pid((x && x.url) || x))].filter(Boolean).map(String));
  for (const f of feed) {
    if (f.kind !== "news" || f.flight !== F || !pid(f.url)) continue;
    const vs = vehOf(f.body).filter((v) => tracked.includes(v)); if (vs.length !== 1 || vehOf(f.body).length !== 1) continue;
    const v = vs[0], t = Date.parse(f.at), fp = pid(f.url), act = actOf(f.body); if (!act) continue;
    const vehCards = []; for (const c of cats) if (["cryo", "raptor", "static", "pad"].includes(c.id)) for (const h of c.history || []) if (h.flight === F && String(h.hardware || vehOf(h.text)[0] || "") === v) vehCards.push({ c, h });
    const covered = vehCards.some(({ h }) => (postsOf(h).has(fp) && (actOf(h.text) === act || (h.updates || []).some((u) => actOf(u.text) === act))) || (h.updates || []).some((u) => pid(u.url) === fp && actOf(u.text) === act));
    if (covered) continue;
    let hit = vehCards.find(({ h }) => postsOf(h).has(fp));
    if (!hit) hit = vehCards.filter(({ h }) => h.at && Date.parse(h.at) >= t && Date.parse(h.at) - t <= 12 * 3600e3).sort((a, b) => Date.parse(a.h.at) - Date.parse(b.h.at))[0];
    if (!hit) { flag("missing-row", `feed ${f.id} "${f.body}" (${v}) is on no card and no same-vehicle card follows within 12 h`); continue; }
    const row = { date: ukDay(f.at), at: f.at, text: TS.fix(f.body).replace(/[^.!?]$/, "$&."), card_text: TS.toCard(f.body, { confirmed: true }), url: f.url, src: `@${handleOf(f.url)}`, handle: handleOf(f.url), phase: "progress", tier: tierOf(handleOf(f.url)), self_check: "from feed " + f.id };
    const ups = hit.h.updates = hit.h.updates || []; const i = ups.findIndex((u) => (Date.parse(u.at) || 0) > t); ups.splice(i < 0 ? ups.length : i, 0, row);
    fix("missing-row", `${hit.c.id} ${hit.h.id}: feed post ${f.id} ("${act}") was on no card row → Earlier update on the same-vehicle ${v} card`, "(missing)", row.card_text);
  }

  // 3. "Not yet" pill next to under-way text
  for (const c of cats) if ((c.status === "none" || c.status === "pending") && /\b(under ?way|in progress|is being|has begun|started)\b/i.test(`${c.latest || ""} ${c.log_latest || ""}`) && c.id !== "faa") { const b = c.status; c.status = "progress"; fix("status", `${c.id}: pill "Not yet" but its line says "${c.latest}"`, b, "progress"); }

  // 4. present-tense card wording (card_text; text/x_text untouched, they feed pushes and the push log)
  for (const { c, r, card, up } of rows) {
    if (!r.text || TS.isMissionLine(r.text) || r.text_locked) continue;
    const cur = r.card_text || r.text; if (!PRESENT.test(cur) && !(r.card_text && TS.toCard(r.card_text) !== tidy(r.card_text).replace(/[^.!?]$/, "$&."))) continue;
    const confirmed = TS.isConfirmed(r) && (!up || card.trust !== "unconfirmed");
    const next = TS.toCard(cur, { confirmed }); if (!next || next === cur || next === r.card_text) continue;
    const before = cur; r.card_text = next; fix("past-tense", `${c.id} ${card.id || card.date}${up ? ` › ${r.at || r.date}` : ""}`, before, next);
  }

  // 5. stale superseded updates (inferred later state beats an older in-progress line)
  for (const [v, inf] of Object.entries(road.inferred || {})) for (const [k, x] of Object.entries(inf || {})) {
    const c = cat(k); if (!c || !x || !x.date) continue;
    for (const h of c.history || []) {
      if (!vehOf(h.text).includes(v) || !/\b(being|reportedly|could|expected|removed)\b/i.test(h.text) || h.superseded) continue;
      const hd = Date.parse(h.at || 0), xd = Date.parse(`${x.date} ${uk(h.at || new Date(now).toISOString()).y} 12:00 UTC`);
      if (!(xd > hd)) continue;
      const before = h.card_text || h.text, past = TS.toCard(h.text, { confirmed: true }).replace(/\.$/, "");
      if (!/being/.test(h.text)) continue; // only in-progress lines are superseded (a removal stays a fact)
      h.superseded = { by: `inferred ${v} ${k}`, date: x.date, why: x.why };
      const later = x.why.replace(/^.*?, so /, "").replace(/\.$/, "").replace(/\bare (installed|in)\b/, "were $1").replace(/\bis (installed|in)\b/, "was $1");
      h.card_text = `${past}; ${later} by ${x.date}.`.replace(/^\w/, (m) => m.toUpperCase());
      fix("superseded", `${c.id} ${h.id || h.date}: "${h.text}" (${ukDay(h.at)}) superseded by ${x.date} (${x.by})`, before, h.card_text);
    }
  }

  // 7. typos / spacing in shown lines (wording only)
  const tf = (o, k, where) => { if (typeof o[k] !== "string") return; const t = tidy(o[k]); if (t !== o[k]) { fix("typo", where + " " + k, o[k], t); o[k] = t; } };
  for (const c of cats) { tf(c, "latest", c.id); tf(c, "log_latest", c.id); }
  for (const { c, r, card } of rows) for (const k of ["text", "card_text", "log_text", "status_line"]) tf(r, k, `${c.id} ${card.id || card.date}`);
  for (const [n, list] of Object.entries(road.mission_updates || {})) for (const u of list || []) tf(u, "line", `mission ${n}`);
  for (const f of feed) tf(f, "body", `feed ${f.id}`);

  // 9. missing source badges on feed items (handle from the item's own link)
  for (const f of feed) { const h = handleOf(f.url); if (h && !f.src) { f.src = `@${h}`; fix("source-badge", `feed ${f.id}`, "(none)", f.src); } else if (!f.url && f.kind === "news") flag("source-badge", `feed ${f.id} has no link`); }

  // 10a. broken / missing local card picture → next best allowed picture (same or better tier); locked pictures are never swapped
  let RP = null; try { RP = require("./road-pick.js"); } catch {}
  const rankOf = (mo) => { try { return require("./guards.js").mediaRank(mo); } catch { return 9; } };
  for (const c of cats) for (const h of c.history || []) {
    const mo = h.media_override; if (!mo || !mo.image || /^https?:/.test(mo.image)) continue;
    let size = -1; try { size = fs.statSync(path.join(root, mo.image)).size; } catch {}
    if (size > 0) continue;
    const locked = mo.keep_image || mo.locked || h.media_locked || rankOf(mo) === 0;
    if (locked) { flag("image", `${c.id} ${h.id}: locked picture ${mo.image} is ${size < 0 ? "missing" : "empty"}; lock kept (app falls back on screen)`, mo.image, { item: h.id, values: [mo.image], reason: "locked media cannot be swapped" }); continue; }
    const alts = (h.photo_alternatives || []).filter((a) => a && a.image && a.image !== mo.image && rankOf({ image: a.image, author: a.author }) <= rankOf(mo));
    const remote = (h.x_post && (h.x_post.media || []).map((m) => m.url || m.poster).find(Boolean)) || null;
    const next = alts[0] ? { ...mo, image: alts[0].image, author: alts[0].author || mo.author, post_url: alts[0].post_url || mo.post_url } : remote ? { ...mo, image: remote } : null;
    if (!next) { flag("image", `${c.id} ${h.id}: picture ${mo.image} broken, no allowed fallback`, mo.image, { item: h.id, values: [mo.image], reason: "no same-or-better-tier alternative" }); continue; }
    const before = mo.image; h.media_override = next; fix("image-fallback", `${c.id} ${h.id}: ${before} ${size < 0 ? "missing" : "0 bytes"}`, before, next.image);
  }

  // 10. placeholder / hotlinked pbs.twimg pictures: cache a local copy (image_cache map; the picked image URL is never changed)
  road.image_cache = road.image_cache || {};
  const files = [], pics = [];
  for (const c of cats) for (const h of c.history || []) { const mo = h.media_override; if (mo && mo.image) pics.push({ where: `${c.id} ${h.id || h.date}`, image: mo.image }); if (mo && /rtf-placeholder/.test(mo.image || "")) flag("image", `${c.id} ${h.id || h.date} shows the placeholder picture`); }
  let picks = []; try { picks = JSON.parse(fs.readFileSync(path.join(root, "road-media.json"), "utf8")).picks || []; } catch {}
  for (const p of picks) if (p.image) pics.push({ where: `pick ${p.category} ${p.date}`, image: p.image });
  for (const { where, image } of pics) {
    if (!/^https:\/\/pbs\.twimg\.com\//.test(image) || road.image_cache[image]) continue;
    const name = image.replace(/^https:\/\/pbs\.twimg\.com\//, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.(jpg|jpeg|png|webp)$/i, "") + ".jpg", rel = `images/cache/${name}`;
    if (dryRun) { fix("image-cache", `${where}: hotlinked ${image}`, image, `${rel} (dry run: not downloaded)`); continue; }
    try {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) { const r = await require("./retry.js").withRetry(fetchFn || fetch)(image); if (!r.ok) throw new Error(`HTTP ${r.status}`); const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 1000) throw new Error("too small"); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, buf); }
      road.image_cache[image] = rel; files.push(rel); fix("image-cache", `${where}: hotlinked picture cached`, image, rel);
    } catch (e) { flag("image", `${where}: could not cache ${image} (${e.message})`); }
  }
  if (!Object.keys(road.image_cache).length) delete road.image_cache;

  const counts = {}; for (const x of fixes) counts[x.type] = (counts[x.type] || 0) + 1;
  road.self_check = { at: new Date(now).toISOString(), fixes: fixes.length, flags: flags.length, counts, judge_calls: calls, flagged: flags.map((f) => `[${f.type}] ${f.msg}`).slice(0, 40) };
  return { fixes, flags, judged, calls, files, counts, pushes: [], milestones: [] };
}

// Grok judge (only when XAI_API_KEY is set). Answers "a" or "b".
function grokJudge(log = console.log) {
  if (!process.env.XAI_API_KEY) return null;
  const writer = require("./writer.js");
  return async (q, a, b) => { const r = await writer.askJson(`Two facts from Starship tracking sources clash. ${q}\nA: ${a}\nB: ${b}\nAnswer "a" or "b" only if one is clearly right, else "unsure".`, { schema: { type: "object", properties: { pick: { type: "string", enum: ["a", "b", "unsure"] } }, required: ["pick"], additionalProperties: false }, schemaName: "self_check_judge", maxTokens: 200, attempts: 1, log }); return r && r.pick; };
}
// needs-review list: data/needs-review.json { items: [{ date, type, item, values, sources, reason, kept, msg }] }, one per (type, msg)
function writeReview(flags, file, now = Date.now()) {
  let q = { items: [] }; try { q = JSON.parse(fs.readFileSync(file, "utf8")); if (!Array.isArray(q.items)) q = { items: [] }; } catch {}
  const have = new Set(q.items.map((x) => `${x.type}|${x.msg}`)); let added = 0;
  for (const f of flags) { const k = `${f.type}|${f.msg}`; if (have.has(k)) continue; have.add(k); added++;
    q.items.unshift({ date: new Date(now).toISOString(), type: f.type, item: f.item || null, values: f.values || [], sources: f.sources || [], reason: f.reason || f.msg, kept: f.kept || null, msg: f.msg }); }
  q.items = q.items.slice(0, 300); q._about = "Self-check (scripts/self-check.js) clashes it could not settle by rule: the higher-tier value was kept; a human decides.";
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(q, null, 2) + "\n"); return added;
}
module.exports = { writeReview, due, markDone, audit, grokJudge, daysBetweenUK, ukDay, JUDGE_CAP, tidy };

if (require.main === module) {
  (async () => {
    const dry = process.argv.includes("--dry"), file = path.join(ROOT, "road.json");
    const road = JSON.parse(fs.readFileSync(file, "utf8"));
    const r = await audit(road, { dryRun: dry, judge: grokJudge() });
    console.log(`\n${r.fixes.length} fixes ${JSON.stringify(r.counts)}, ${r.flags.length} flags, ${r.calls} judge calls`);
    if (!dry) { fs.writeFileSync(file, JSON.stringify(road, null, 2) + "\n"); writeReview(r.flags, path.join(ROOT, "data", "needs-review.json")); }
  })();
}
