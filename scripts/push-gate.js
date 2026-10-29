/* Push gate (accuracy layer in front of push-policy; used by sendPush and the X-first card step).
   A. Hold: a push waits until a SECOND trusted source (different account) reports the same vehicle + event,
      or HOLD_RUNS checker runs (15 min each) have passed. SpaceX / Elon posts and corrections never wait.
      Right before a held push is sent, the source post is re-read (refetch); if it was edited, the card and the push
      take the edited text (an edit is never reported as "minor").
   B. Staleness: a recap ("Starship Update", "recap", weekly round-up…) or a post about a milestone that already
      PUSHED on an earlier UK day (same vehicle + event, no "second/another/new" wording) never pushes and never
      makes a new card. If it carries media it is a media-only update: the existing card may take the better
      picture via the media cascade (tier climb), keeping its date and wording.
   C. Big news: SpaceX / Elon posts about Flight N milestones skip the 24h quiet window (dedupe and staleness still apply).
   D. Corrections: a trusted post that contradicts a push already SENT (same vehicle, within CORRECTION_H, the
      location changed launch site ↔ production site / Megabay) always pushes as "Correction" and updates the card.
   Shadow mode: push-shadow.json { "until": ISO } in the repo root (or PUSH_SHADOW=1) → sendPush logs
   "shadow: would push" rows to notifications.json and sends nothing. No workflow change needed. */
const fs = require("fs"), path = require("path");
const pp = require("./push-policy.js");
const HOLD_RUNS = 1, RUN_MS = 15 * 60000, CORROBORATE_H = 6, CORRECTION_H = 3;
const OFFICIAL = new Set(["spacex", "spacexstarship", "starbase", "elonmusk"]);
const TRUSTED = new Set(["nasaspaceflight", "labpadre", "rgvaerialphotos", "starbasesurfer", "csi_starbase", "blobifie", "trackingthesb", "starshipgazer", "efraser77", "nicans", "zackgolden_", "starship_spring", ...OFFICIAL]);
const RECAP = /\b(starship update|recap|round-?up|week in review|weekly|this week at starbase|max evans|static fire galore|is flight nearly here)\b/i;
const BIG = /\b(flight \d+|catch\w*|launch\w*|lift ?off|static fire|wet dress|wdr|stack\w*|licen[cs]e|net)\b/i; // a Flight N milestone in a SpaceX / Elon post
const NEW_TEST = /\b(another|second|third|again|repeat\w*|re-?test\w*|additional|new)\b/i;
const LAUNCH_SITE = /\b(launch site|pad \d|pad-\d|launch pad|olm|orbital launch)\b/i;
const PROD_SITE = /\b(production site|mega ?bay|build site|high bay|sanchez|massey'?s?)\b/i;
const lc = (s) => String(s || "").toLowerCase();
const handleOf = (n) => lc(n.author || (String(n.url || "").match(/x\.com\/([^/]+)\/status/i) || [])[1] || (n.src || "").replace(/^@|^X @/g, ""));
const isOfficial = (n) => OFFICIAL.has(handleOf(n));
const ms = (iso) => Date.parse(iso || "");
const textOf = (n) => `${n.body || ""} ${n.source_text || ""}`;

function shadowOn({ root = path.join(__dirname, ".."), env = process.env, now = Date.now() } = {}) {
  if (env.PUSH_SHADOW === "0") return false; // explicit off (offline tests pin this so a live push-shadow.json does not change them)
  if (env.PUSH_SHADOW === "1") return true;
  try { const j = JSON.parse(fs.readFileSync(path.join(root, "push-shadow.json"), "utf8")); return !!j && ms(j.until) > now; } catch { return false; }
}
// a recap / source text that only summarises earlier events
const isRecap = (n) => RECAP.test(`${n.source_text || ""} ${n.title_src || ""}`) || /youtube\.com|youtu\.be/.test(n.url || "") && RECAP.test(n.source_text || "");
// B. stale: milestone already pushed on an earlier UK day (sent rows only; a silent backfill only blocks its own day)
function staleCheck(n, history, { vehicles = [] } = {}) {
  const cls = pp.classify(n, { vehicles });
  const recap = isRecap(n);
  if (!cls.milestone) return recap ? { stale: true, reason: "recap (summary of earlier news)", cls } : { stale: false, cls };
  const earlier = (history || []).filter((r) => r && r.verdict === "sent" && !r.retracted).reverse().map((r) => ({ r, c: r.key ? { key: r.key } : pp.classify(r, { vehicles }) }))
    .find(({ r, c }) => { const [v, t, d] = String(c.key).split("|"); return v === cls.vehicle && t === cls.type && d !== cls.date && ms(r.sent_at) < ms(n.at || n.sent_at) + 3600000; });
  if (earlier && !NEW_TEST.test(n.body || "")) return { stale: true, reason: `already pushed ${earlier.c.key.split("|")[2]} (${cls.vehicle} ${cls.type})${recap ? " — recap" : ""}`, cls, media_only: !!n.has_media && !recap };
  if (recap) return { stale: true, reason: "recap of a known milestone", cls };
  return { stale: false, cls };
}
// A. corroboration: another trusted account reported the same vehicle + event within CORROBORATE_H
function corroborated(n, seenPosts, { vehicles = [] } = {}) {
  const cls = pp.classify(n, { vehicles }), me = handleOf(n);
  return (seenPosts || []).some((p) => { const h = handleOf(p); if (!TRUSTED.has(h) || h === me) return false; const c = pp.classify({ body: p.text || p.body, at: p.created_at || p.at }, { vehicles }); return c.vehicle === cls.vehicle && c.type === cls.type && Math.abs(ms(p.created_at || p.at) - ms(n.at)) <= CORROBORATE_H * 3600000; });
}
// D. correction: does this post contradict a push already sent? (location flip, same vehicle, close in time)
const where = (t) => (PROD_SITE.test(t) && /\b(back|return\w*|arriv\w*|rolled back)\b/i.test(t) ? "prod" : LAUNCH_SITE.test(t) ? "launch" : PROD_SITE.test(t) ? "prod" : null);
function correctionOf(n, history, { vehicles = [] } = {}) {
  const v = pp.vehicleOf(n.body, vehicles), w = where(n.body || ""); if (!w) return null;
  return (history || []).filter((r) => r && r.verdict === "sent" && !r.retracted && !/^Correction/.test(r.title || "")).reverse()
    .find((r) => pp.vehicleOf(r.body, vehicles) === v && Math.abs(ms(n.at) - ms(r.at)) <= CORRECTION_H * 3600000 && where(r.body || "") && where(r.body || "") !== w) || null;
}
/* evaluate one push. ctx: { history, state (state.pushGate), now, seenPosts, vehicles, refetch(url) → text|null }.
   Returns { action: send|hold|drop|media_only, n (possibly edited), reason, big, correction } */
async function evaluate(n, { history = [], state = {}, now = Date.now(), seenPosts = [], vehicles = [], refetch = null } = {}) {
  const pend = (state.pending = state.pending || []);
  const corr = correctionOf(n, history, { vehicles });
  if (corr) return { action: "send", n: { ...n, title: `Correction · ${n.title.replace(/^Correction · /, "")}` }, reason: `corrects "${corr.body}" (${corr.sent_at})`, correction: true, big: true };
  const st = staleCheck(n, history, { vehicles });
  if (st.stale) return { action: st.media_only ? "media_only" : "drop", n, reason: `stale: ${st.reason}` };
  const big = isOfficial(n) && (st.cls.milestone || BIG.test(`${n.body || ""} ${n.source_text || ""}`));
  if (n.kind === "notice" || n.where === "mission-scheduled" || isOfficial(n) || !/x\.com\//.test(n.url || "")) return { action: "send", n, reason: isOfficial(n) ? "official source" : "not an X tracker post", big };
  const key = n.url || n.body;
  let p = pend.find((x) => x.key === key);
  const ok = corroborated(n, seenPosts, { vehicles });
  // a post already older than the hold (e.g. found late after an outage) does not wait again — it is still re-read below
  const waited = p ? now - ms(p.first) >= HOLD_RUNS * RUN_MS : now - ms(n.at) >= 2 * HOLD_RUNS * RUN_MS;
  if (!ok && !waited) { if (!p) pend.push({ key, first: new Date(now).toISOString(), n }); return { action: "hold", n, reason: `held for a second source or ${HOLD_RUNS} run(s)` }; }
  state.pending = pend.filter((x) => x.key !== key);
  // re-read the source right before sending: an edit replaces the text
  let out = n, edited = false;
  if (refetch) { try { const t = await refetch(n.url); if (t && n.source_text && t.trim() !== n.source_text.trim()) { edited = true; out = { ...n, source_text: t, edited_from: n.source_text }; } } catch {} }
  return { action: "send", n: out, edited, reason: ok ? "second trusted source agrees" : p ? `hold passed (${HOLD_RUNS} run)` : "post already older than the hold", big: big || edited };
}
module.exports = { evaluate, staleCheck, corroborated, correctionOf, isRecap, isOfficial, shadowOn, where, HOLD_RUNS, RUN_MS, RECAP };
