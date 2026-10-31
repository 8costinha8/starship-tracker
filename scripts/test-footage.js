// Offline: new footage of an event already logged (and already pushed) only refreshes the card's media —
// no new card, no new milestone, no history row, no push. No network, nothing sent.
const xf = require("./x-first.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const road = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [
  { id: "static", name: "Static fires", status: "progress", latest: "Booster 22 completed its static fire at the launch site.", history: [
    { id: "x-b22-sf", date: "25 Oct", at: "2026-10-25T11:45:42.000Z", text: "Booster 22 completed its static fire at the launch site.", hardware: "B22", trust: "trusted", x_first: true, complete: true,
      milestone: { key: "static_fire|15|B22", type: "static_fire", flight: 15, hardware: "B22", phase: "completed" },
      media_override: { post_url: "https://x.com/NASASpaceflight/status/2", post_id: "2", author: "NASASpaceflight", type: "video", image: "nsf.jpg" } }] }] });
const hist = [{ title: "💥 Static fire", body: "Booster 22 completed its static fire at the launch site.", at: "2026-10-25T11:45:42Z", sent_at: "2026-10-25T11:45:42Z", verdict: "sent", key: "B22|static_fire|25 Oct" }];
const POST = { id: "2116000000000000001", author_id: "1", created_at: "2026-10-29T10:00:00.000Z", text: "New views of Booster 22's static fire" };
const V = { kind: "road", stage: "static", hardware: "B22", event: "static_fire", phase: "completed", status: "done", flight: 15, media_fit: "shows-event", speculative: false, inferred: false,
  text: "Booster 22 completed its static fire.", log_text: "Booster 22 completed its static fire at the launch site.", reason: "SpaceX footage of the 25 Oct static fire" };
(async () => {
  const r0 = road(), before = JSON.stringify(r0), logs = [];
  const fetchFn = async () => ({ ok: true, json: async () => ({ data: [POST], meta: { newest_id: POST.id }, includes: { users: [{ id: "1", username: "SpaceX", name: "SpaceX" }] } }) });
  const postCard = (p) => ({ post_id: p.id, url: `https://x.com/SpaceX/status/${p.id}`, created_at: p.created_at, text: p.text, author: { username: "SpaceX", name: "SpaceX" }, media: [{ type: "video", url: "https://video.twimg.com/x.mp4" }] });
  const pushHistory = JSON.parse(JSON.stringify(hist)), milestones = [];
  const r = await xf.runXFirst(r0, { xFirst: { sinceId: "1" } }, { token: "fake", fetchFn, postCard, pushHistory, ask: async () => ({ entries: [{ item: 1, ...V }] }), log: (m) => logs.push(m),
    now: Date.parse("2026-10-29T10:05:00Z"), milestone: (...a) => { milestones.push(a); return null; } });
  const out = r.cards.concat(r.merged);
  check(!out.length, "new SpaceX footage of the logged B22 static fire → no new or merged card (nothing for push-sync to send)");
  check((r.stale || []).length === 1 && r.stale[0].media_only && r.stale[0].post.post_id === POST.id, "post handed on as media-only (the cascade may swap the picture)");
  check(JSON.stringify(r0) === before, "road unchanged by x-first: no history row, no milestone, no status change");
  check(!milestones.length, "no milestone call");
  check(JSON.stringify(pushHistory) === JSON.stringify(hist), "push history untouched (no push)");
  check(logs.some((l) => /stale @SpaceX .*media-only.*no card, no push/.test(l)), "logged as 'media-only … no card, no push'");
  console.log(fails ? `❌ ${fails} failed` : "✅ All footage checks passed."); process.exit(fails ? 1 : 0);
})();
