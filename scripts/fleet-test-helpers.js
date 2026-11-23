// Shared helpers for the fleet scenario tests (no network, no Firebase, no secrets; the sender is a stub = DRY RUN).
process.env.PUSH_SHADOW = "0";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const F = require("./fleet.js"), ps = require("./push-sync.js");
let fails = 0; const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
const done = () => { console.log(fails ? `\n❌ ${fails} check(s) failed` : "\n✅ all checks passed"); process.exit(fails ? 1 : 0); };
const appJsText = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
// a frozen tracked-flight Road (live road.json shape, 23 Nov): Flight 16 = B23 + S43
const road0 = () => ({ flight: 16, vehicles: ["B23", "S43"], hardware_flights: { B23: 16, S43: 16 }, categories: [], feed_items: [] });
const users = {};
// synthetic post in the x-first card shape (author must be a trusted sources.js account)
const post = (id, author, at, text, media = []) => ({ post_id: String(id), url: `https://x.com/${author}/status/${id}`, created_at: at, text, author: { username: author }, media });
const noProbe = () => ({ banner: false });
// one simulated live run per post: ingest at post time + 10 min, then each push decision through the real sendPush (stub sender)
async function liveReplay(reg, posts, road, { history = [], sent = [] } = {}) {
  const decisions = [];
  for (const p of [...posts].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    const now = Date.parse(p.created_at) + 10 * 60000;
    const r = F.ingest(reg, [p], { road, now });
    await F.screenImages(reg, { probe: noProbe });
    for (const d of r.pushes) {
      decisions.push(d);
      if (!d.push) continue;
      const row = await ps.sendPush({ ...d.n, link: `${ps.SITE}?feed=1&item=${d.n.visible.id}` }, { road, fleet: reg, send: async (n) => { sent.push(n); return { tokens: 1, success: 1, failure: 0, removed: 0 }; }, logRows: history, log: () => {}, now: () => now, history: [], gate: null, guards: true });
      d.row = row;
    }
  }
  return { decisions, sent, history };
}
module.exports = { F, ps, ok, done, appJsText, road0, post, liveReplay, noProbe, ROOT };
