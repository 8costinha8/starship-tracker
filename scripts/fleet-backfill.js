/* Fleet backfill: run the SAME registry code (fleet.seed + fleet.ingest) over older source posts, so the registry and
   Page 2 "Future vehicles" show what the live checker skipped. Backfilled events are marked `backfill: true` and their
   push keys are pre-seeded in registry.pushed → they can never push (one push per vehicle + milestone stays intact for
   new events after the backfill).
   Input (one of):
     --posts <file> [--posts <file2>]  X API v2 search pages ({ data, includes: { media, users } }), e.g. fixtures/fleet/*.json
     (no --posts, X_BEARER_TOKEN set)   ONE search/recent call per page (max 3 pages) over the last --days (≤ 7) built from
                                        the registry (fleet.coverageQuery), trusted accounts filtered in code.
   --out <file>   registry to update (default data/vehicles.json). --road <file> (default road.json). --dry  print only.
   Never sends a push, never writes notifications.json. */
const fs = require("fs"), path = require("path");
const F = require("./fleet.js");
const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d), all = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
function cardsFrom(page) {
  const { xPostCard } = require("./check-road.js");
  const mk = Object.fromEntries((((page.includes || {}).media) || []).map((m) => [m.media_key, m])), us = Object.fromEntries((((page.includes || {}).users) || []).map((u) => [u.id, u]));
  return (page.data || []).map((p) => xPostCard(p, mk, us));
}
async function fetchPages(reg, { token, days = 7, now = Date.now(), fetchFn = fetch }) {
  const pages = []; let next = null;
  for (let i = 0; i < 3; i++) {
    const u = new URL("https://api.x.com/2/tweets/search/recent");
    u.searchParams.set("query", F.coverageQuery(reg)); u.searchParams.set("max_results", "100");
    u.searchParams.set("start_time", new Date(now - Math.min(days, 6.9) * 86400000).toISOString());
    for (const [k, v] of Object.entries({ "tweet.fields": "created_at,author_id,attachments,note_tweet,entities", expansions: "attachments.media_keys,author_id", "media.fields": "type,url,preview_image_url,width,height", "user.fields": "username,name" })) u.searchParams.set(k, v);
    if (next) u.searchParams.set("next_token", next);
    const r = await fetchFn(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`X search HTTP ${r.status}`);
    const j = await r.json(); pages.push(j); next = j.meta && j.meta.next_token; if (!next) break;
  }
  return pages;
}
async function backfill({ posts, road, appJsText, regPath, now = Date.now(), dry = false, log = console.log, probe = null }) {
  const reg = F.load(regPath);
  for (const c of F.seed(reg, { road, appJsText, now })) log(`seed: ${c}`);
  const res = F.ingest(reg, posts, { road, now, backfill: true, log });
  const sc = await F.screenImages(reg, { log, ...(probe ? { probe } : {}) }); log(`images: ${sc.checked} checked, ${sc.swapped} changed`);
  if (!dry) F.save(reg, regPath);
  return { reg, res };
}
if (require.main === module) (async () => {
  const road = JSON.parse(fs.readFileSync(arg("--road", path.join(ROOT, "road.json")), "utf8"));
  const appJsText = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const regPath = arg("--out", F.FILE), files = all("--posts");
  let pages = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  if (!pages.length) { if (!process.env.X_BEARER_TOKEN) { console.error("no --posts and no X_BEARER_TOKEN: nothing to read"); process.exit(2); } pages = await fetchPages(F.load(regPath), { token: process.env.X_BEARER_TOKEN, days: Number(arg("--days", 7)) }); }
  const posts = pages.flatMap(cardsFrom).filter((p, i, a) => a.findIndex((q) => q.post_id === p.post_id) === i);
  const { res } = await backfill({ posts, road, appJsText, regPath, dry: args.includes("--dry") });
  console.log(`backfill: ${posts.length} post(s) → ${res.events.length} event(s), ${res.added.length} new vehicle(s), ${res.assigned.length} assignment(s), ${res.pushes.filter((p) => p.push).length} push(es) (must be 0)`);
  if (res.pushes.some((p) => p.push)) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
module.exports = { backfill, cardsFrom, fetchPages };
