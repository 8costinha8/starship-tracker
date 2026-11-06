/* ─────────────────────────────────────────────────────────────
   News pushes ("🚀 Starship"), kept by check-road.js. Pure helpers, no network.
   Each run: trusted items already fetched (X incl. SpaceX / NSF / Elon, the
   trusted news feeds) that this module hasn't seen → cheap prefilter → ONE
   Grok call that picks genuinely new Starship stories, groups items about
   the same story, and compares them with what was pushed in the last 48h.
   - First run (no state.news yet): every current item is seeded as seen,
     nothing is pushed.
   - Max NEWS_DAILY_CAP pushes per London day (state.news.day / count).
   - A story is pushed once: same group in this batch → one push; Grok
     "dup" of a recent push, or same URL/key → skipped.
   - Headline must be grounded in the item text (numbers and vehicle names
     must appear in it; most words too). Ungrounded → skipped, not rewritten.
   ───────────────────────────────────────────────────────────── */

const NEWS_DAILY_CAP = 6;
const NEWS_MAX_ITEMS = 10;     // items per Grok call
const NEWS_FRESH_H = 12;       // older items are never "new"
const NEWS_MEMORY_H = 48;      // pushed stories compared against
const NEWS_SEEN_KEEP = 1500;
const H = 3600000;

const londonDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

function freshNewsState(now) {
  return { seen: [], sent: [], day: londonDay(now), count: 0, pending: [], seededAt: new Date(now).toISOString() };
}

// Cheap filter before Grok: trusted, fresh, not seen, about Starship, not a reply/RT.
function newsCandidates(items, news, { isTrusted, looksStarship, now }) {
  const seen = new Set(news.seen), sentKeys = new Set(news.sent.flatMap((s) => [s.key, s.url].filter(Boolean)));
  const out = [], skipped = [];
  for (const it of items) {
    if (!it || !it.key || seen.has(it.key) || out.some((o) => o.key === it.key)) continue;
    if (sentKeys.has(it.key) || (it.url && sentKeys.has(it.url))) { skipped.push(it); continue; }
    if (!isTrusted(it.tier)) { skipped.push(it); continue; }
    if (it.publishedAt && now - new Date(it.publishedAt).getTime() > NEWS_FRESH_H * H) { skipped.push(it); continue; }
    const text = `${it.title || ""} ${it.text || ""}`;
    if (/^\s*(RT @|@\w+)/.test(it.text || "") || !looksStarship(text)) { skipped.push(it); continue; }
    out.push(it);
  }
  return { candidates: out, skipped };
}

function buildNewsPrompt(items, recent) {
  const rec = recent.length ? recent.map((s, i) => `R${i + 1}. [${s.src}] ${s.headline}`).join("\n") : "(none)";
  const list = items.map((it, i) => `${i + 1}. [${it.src}] ${it.title} — ${String(it.text || "").slice(0, 700)}`).join("\n");
  return `You pick push-notification-worthy SpaceX Starship news for a tracker app.

Already pushed in the last 48 hours:
${rec}

New items:
${list}

For EACH item decide:
- "push": true only for a genuinely new, concrete Starship development (tests, vehicle moves, launch dates, licences, results, official announcements). false for trivia, jokes/memes, opinions, replies, livestream/ads, non-Starship topics, vague teasers, or anything already covered by a recent push (R…).
- "dup": "R<n>" if it is the same story as a recent push, else null.
- "story": a short id; items that report the SAME story get the SAME id (e.g. NSF and SpaceX on one static fire).
- "headline": one FULL past-tense sentence under 85 characters that ONLY restates what the item says (no new facts, numbers or names; keep hedges like "may"/"reportedly"). Must contain a finite verb and END with a full stop. Proper caps ("Pad 39A", "Flight 15", "Ship 42", "Booster 22"). British English. No source name, no emoji. Never a verbless headline fragment ("Pad 39a undergoes full water deluge test" → "Pad 39A completed a full water deluge test.").
- "reason": max 10 words.
Reply with ONLY a JSON array, one entry per item: [{"item": 1, "push": true, "dup": null, "story": "b22-static-fire", "headline": "Booster 22 completed a static fire at Massey's.", "reason": "..."}]`;
}

// Deterministic post-process: proper caps, past-tense nudges for common present verbs, always a full stop.
// Fragments with no finite verb are flagged (ok:false) so decideNews skips them rather than inventing facts.
const FINITE = /\b(?:was|were|is|are|had|has|have|did|does|do|could|would|should|will|may|might|can|said|says|made|took|went|came|left|ran|began|rose|got|held|saw|set|put|lit|led|sat|met|told|kept|brought|found|gave|shot|stood|spun|fell|drove|flew|built|sent|won|hit|cut|let|shut|split|struck|wound|swung|tore|wore|threw|grew|knew|drew|broke|chose|rode|spoke|stuck|hung|dug|slid|bent|lost|paid|read|heard|meant|felt|caught|bought|fought|taught|thought|sought|lay|laid|appears?|shows?|remains?|took place|took place)\b|\b\w{3,}ed\b/i;
function finishHeadline(s) {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, reason: "empty", text: "" };
  t = t.replace(/\bpad\s+(\d+[a-z]?)\b/gi, (_, p) => `Pad ${p.toUpperCase()}`)
       .replace(/\bflight\s+(\d+)\b/gi, (_, n) => `Flight ${n}`)
       .replace(/\bship\s+(\d+)\b/gi, (_, n) => `Ship ${n}`)
       .replace(/\bbooster\s+(\d+)\b/gi, (_, n) => `Booster ${n}`);
  // common present-tense news verbs → past (only whole-word; keep hedges like "may")
  t = t.replace(/\bundergoes\b(?=\s+(?!a\b|an\b|the\b))/gi, "completed a").replace(/\bundergoes\b/gi, "completed").replace(/\bundergo\b(?=\s+(?!a\b|an\b|the\b))/gi, "complete a").replace(/\bundergo\b/gi, "complete")
       .replace(/\bcompletes\b/gi, "completed").replace(/\bperforms\b/gi, "performed")
       .replace(/\bconducts\b/gi, "conducted").replace(/\bfires\b/gi, "fired")
       .replace(/\brolls\b/gi, "rolled").replace(/\barrives\b/gi, "arrived")
       .replace(/\bheads\b/gi, "headed").replace(/\bleaves\b/gi, "left")
       .replace(/\breturns\b/gi, "returned").replace(/\bmoves\b/gi, "moved");
  t = t.replace(/[.!?\s]+$/, "") + ".";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length > 90) return { ok: false, reason: "too long", text: t };
  if (t.split(/\s+/).length >= 3 && !FINITE.test(t)) return { ok: false, reason: "no verb (fragment)", text: t };
  return { ok: true, text: t };
}

// Words / numbers / vehicle names in the headline must come from the item.
function grounded(headline, text) {
  const h = String(headline || "").toLowerCase(), t = String(text || "").toLowerCase().replace(/’/g, "'");
  if (!h || h.length > 90) return false;
  for (const n of h.match(/\d+/g) || []) if (!new RegExp(`(^|\\D)${n}(\\D|$)`).test(t)) return false;
  const words = (h.match(/[a-z][a-z']{3,}/g) || []).filter((w) => !["with", "from", "that", "this", "have", "been", "will", "into", "after", "before", "about", "their", "they", "could", "would", "should", "reportedly", "possibly", "starship", "spacex", "flight", "being", "more", "than", "next", "week"].includes(w));
  if (!words.length) return true;
  const hit = words.filter((w) => t.includes(w.slice(0, Math.max(4, w.length - 3)))).length;
  return hit / words.length >= 0.6;
}

// Grok's reply → pushes to send (respecting dedup + the daily cap). Mutates news.
function decideNews(items, reply, news, now, log = () => {}) {
  if (news.day !== londonDay(now)) { news.day = londonDay(now); news.count = 0; }
  const byItem = new Map((Array.isArray(reply) ? reply : []).filter((r) => r && Number.isInteger(r.item)).map((r) => [r.item, r]));
  const stories = new Set(), pushes = [];
  // official first, then oldest first, so the original report wins a story
  const order = items.map((it, i) => ({ it, r: byItem.get(i + 1) }))
    .sort((a, b) => (a.it.tier === "official" ? 0 : 1) - (b.it.tier === "official" ? 0 : 1) || String(a.it.publishedAt || "").localeCompare(String(b.it.publishedAt || "")));
  for (const { it, r } of order) {
    if (!r || r.push !== true) { log(`news: skip "${it.title}" (${it.src}) — ${r ? r.reason || "not news" : "no answer"}`); continue; }
    if (r.dup) { log(`news: skip "${it.title}" — same story as recent push ${r.dup}`); continue; }
    const sid = String(r.story || it.key).toLowerCase();
    if (stories.has(sid)) { log(`news: skip "${it.title}" (${it.src}) — same story as another item this run (${sid})`); continue; }
    stories.add(sid);
    const raw = String(r.headline || "").replace(/\s+/g, " ").trim();
    const done = finishHeadline(raw);
    if (!done.ok) { log(`news: skip "${it.title}" — headline ${done.reason}: "${raw}"`); continue; }
    const headline = done.text;
    if (!grounded(headline.replace(/[.!?]$/, ""), `${it.title} ${it.text}`)) { log(`news: skip "${it.title}" — headline not grounded in the item: "${headline}"`); continue; }
    if (news.count >= NEWS_DAILY_CAP) { log(`news: daily cap (${NEWS_DAILY_CAP}) reached — not sent: "${headline}"`); continue; }
    news.count++;
    news.sent.push({ key: it.key, url: it.url || undefined, story: sid, headline, src: it.src, at: new Date(now).toISOString() });
    pushes.push({ title: "🚀 Starship", body: headline, link: NEWS_LINK, kind: "news", url: it.url || "", at: it.publishedAt && Number.isFinite(Date.parse(it.publishedAt)) ? new Date(it.publishedAt).toISOString() : new Date(now).toISOString() }); // at: the source post's own time; body = the feed line (one source)
  }
  return pushes;
}

const NEWS_LINK = "https://8costinha8.github.io/starship-tracker/?feed=1";

function trimNews(news, now) {
  news.sent = news.sent.filter((s) => now - new Date(s.at).getTime() < NEWS_MEMORY_H * H);
  news.seen = news.seen.slice(-NEWS_SEEN_KEEP);
  news.pending = (news.pending || []).slice(0, 15);
  return news;
}

module.exports = { NEWS_DAILY_CAP, NEWS_LINK, londonDay, freshNewsState, newsCandidates, buildNewsPrompt, finishHeadline, grounded, decideNews, trimNews };
