/* Offline replay (no network, no sends): the real push candidates of 26 Oct 12:00 → 29 Oct 12:00 (UK = GMT)
   through the new push gate + policy, one checker run every 15 min. Prints a table: old verdict vs new verdict.
   node scripts/replay-push.js [--json] */
const fs = require("fs"), path = require("path");
const gate = require("./push-gate.js"), pp = require("./push-policy.js"), wd = require("./watchdog.js");
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "replay-26-29oct.json"), "utf8"));
const VEH = ["B22", "S42"];
async function replay() {
  const history = fx.history_before.map((r) => ({ ...r }));
  const state = { pending: [] }, out = [];
  const items = fx.items.map((x, i) => ({ ...x, i, n: { title: x.title, body: x.body, url: x.url, at: x.post_at, source_text: x.source_text, has_media: x.has_media, author: (x.url.match(/x\.com\/([^/]+)\//) || [])[1] || "", where: x.where } }));
  // runs every 15 min across the window; the 28 Oct 09:30–13:30 outage still loses those runs (watchdog alarm instead)
  const t0 = Date.parse("2026-10-26T12:00:00Z"), t1 = Date.parse("2026-10-29T12:00:00Z"), STEP = 15 * 60000;
  const alarms = []; let wstate = {};
  const queue = [];
  for (let t = t0; t <= t1; t += STEP) {
    const down = t >= Date.parse(fx.outage.from) && t < Date.parse(fx.outage.to);
    if (down) { const a = wd.check(wstate, { terms: ["B22"], candidates: 0, xFailed: "X search HTTP 402" }); if (a.length && !alarms.length) alarms.push({ at: new Date(t).toISOString(), alarm: a.join("; ") }); continue; }
    for (const it of items) if (!it.queued && Date.parse(it.run_at) <= t) { it.queued = true; queue.push(it); }
    const batch = queue.splice(0);
    const hAt = (h) => h.filter((r) => Date.parse(r.sent_at) <= t); // rows that existed at this run (the backfill marker landed 28 Oct 08:54)
    const seen = items.filter((x) => Date.parse(x.post_at) <= t).map((x) => ({ text: x.source_text || x.body, created_at: x.post_at, url: x.url }));
    for (const it of pp.orderBatch(batch.map((b) => b), { vehicles: VEH })) {
      const g = await gate.evaluate(it.n, { history: hAt(history), state, now: t, seenPosts: seen, vehicles: VEH, refetch: async (u) => fx.refetch[u] || null });
      if (g.action === "hold") { (it.holds = it.holds || []).push(new Date(t).toISOString()); queue.push(it); continue; }
      let n = g.n, verdict;
      if (g.action !== "send") verdict = g.action === "media_only" ? `media-only (card picture may swap, no push) — ${g.reason}` : `no push, no card — ${g.reason}`;
      else {
        if (g.edited) n = { ...n, body: fx.rewrite[g.n.source_text] || n.body, edited: true };
        const d = pp.decide(n, hAt(history), { now: t, vehicles: VEH, big: !!g.big });
        verdict = d.push ? `PUSH — ${g.edited ? "edited source re-read: " : ""}${d.reason}${g.big ? " (big)" : ""}` : `silent — ${d.reason}`;
        if (d.push) history.push({ title: n.title, body: n.body, url: n.url, at: n.at, sent_at: new Date(t).toISOString(), verdict: "sent", key: d.cls.key });
      }
      out.push({ post_at: it.post_at, run_at: new Date(t).toISOString(), old_run: it.run_at, old: it.orig_verdict, title: n.title, body: n.body, url: n.url, held: it.holds || [], verdict, synthetic: !!it.synthetic });
    }
  }
  // baseline: today's main (push-policy only, no gate), same posts at their original run times
  const bh = fx.history_before.map((r) => ({ ...r }));
  for (const it of [...items].sort((a, b) => a.run_at.localeCompare(b.run_at))) {
    const t = Date.parse(it.run_at), d = pp.decide(it.n, bh.filter((r) => Date.parse(r.sent_at) <= t), { now: t, vehicles: VEH });
    if (d.push) bh.push({ ...it.n, sent_at: it.run_at, verdict: "sent", key: d.cls.key });
    const row = out.find((r) => r.url === it.url && r.post_at === it.post_at); if (row) row.main = d.push ? `PUSH — ${d.reason}` : `silent — ${d.reason}`;
  }
  return { rows: out.sort((a, b) => a.run_at.localeCompare(b.run_at) || a.post_at.localeCompare(b.post_at)), alarms };
}
const uk = (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
if (require.main === module) replay().then(({ rows, alarms }) => {
  if (process.argv.includes("--json")) return console.log(JSON.stringify({ rows, alarms }, null, 2));
  for (const a of alarms) console.log(`🚨 ${uk(a.at)} watchdog alarm (run fails red → GitHub email): ${a.alarm}`);
  for (const r of rows) console.log(`${uk(r.post_at)} post | run ${uk(r.run_at)}${r.held.length ? ` (held ${r.held.length})` : ""} | ${r.synthetic ? "[synthetic] " : ""}${r.body.slice(0, 70)}\n    log: ${String(r.old).slice(0, 70)}\n    main: ${r.main}\n    new: ${r.verdict}`);
});
module.exports = { replay };
