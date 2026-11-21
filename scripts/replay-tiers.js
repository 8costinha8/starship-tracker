// Replays the logged push candidates of the whole Flight 15 cycle (notifications.json, 23 Oct → 21 Nov) through the
// three-tier model with a FAKE sender (nothing is sent; nothing is written except the out files).
// node scripts/replay-tiers.js [notifications.json] [outdir]
const fs = require("fs"), path = require("path");
const tiers = require("./push-tiers.js");
const src = process.argv[2] || path.join(__dirname, "..", "notifications.json"), outDir = process.argv[3] || path.join(__dirname, "..", "data");
const all = JSON.parse(fs.readFileSync(src, "utf8")).pushes;
const ts = (r) => Date.parse(r.sent_at || r.at);
const cand = all.filter((r) => (r.verdict === "sent" || /^silent: (minor|duplicate|stale|media)/.test(r.verdict)) && !r.dedupe_only).sort((a, b) => ts(a) - ts(b));
const RESULT_AT = Date.parse(all.find((r) => r.verdict === "sent" && /🏁 Flight 15/.test(r.title)).sent_at);
const ukDay = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(t));
const kept = []; const rows = [];
const fakeSend = []; // the fake push function: records instead of sending
for (const r of cand) {
  const vehicles = ts(r) < RESULT_AT + 3600000 ? ["B22", "S42"] : ["B23", "S43"], flight = ts(r) < RESULT_AT + 3600000 ? 15 : 16;
  const d = tiers.decide({ ...r, at: r.at || r.sent_at }, kept, { vehicles, flight });
  const oldSent = r.verdict === "sent";
  if (d.push) { const m = tiers.tierOf(r, {}); kept.push({ ...r, verdict: "sent", tier: d.tier, event: d.event, vehicle: d.key.split("|")[2], target: d.event === "launch_date" ? d.key.split("|")[2] || undefined : undefined, confirmed: /confirmed|official/i.test(r.title + r.body) && !/unconfirmed|unofficial/i.test(r.title + r.body) }); fakeSend.push(r.title); }
  rows.push({ at: r.sent_at || r.at, uk_day: ukDay(ts(r)), title: r.title, body: r.body, old: oldSent ? "sent" : "silent", new: d.push ? "PUSH" : "no push", tier: d.tier, event: d.event, reason: d.reason });
}
const days = {}; for (const x of rows) { const d = (days[x.uk_day] = days[x.uk_day] || { before: 0, after: 0, A: 0, B: 0 }); if (x.old === "sent") d.before++; if (x.new === "PUSH") { d.after++; d[x.tier]++; } }
const sum = (k) => Object.values(days).reduce((a, d) => a + d[k], 0);
const lost = rows.filter((x) => x.old === "sent" && x.new !== "PUSH"), added = rows.filter((x) => x.old !== "sent" && x.new === "PUSH");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "tier-replay.json"), JSON.stringify({ rows, days, totals: { before: sum("before"), after: sum("after"), A: sum("A"), B: sum("B") }, fakeSend: fakeSend.length }, null, 2));
fs.writeFileSync(path.join(outDir, "tier-replay.tsv"), ["at\tuk_day\told\tnew\ttier\tevent\ttitle\tbody\treason", ...rows.map((x) => [x.at, x.uk_day, x.old, x.new, x.tier, x.event, x.title, x.body, x.reason].join("\t"))].join("\n") + "\n");
console.log(`candidates ${rows.length} | before: ${sum("before")} pushes | after: ${sum("after")} (A ${sum("A")}, B ${sum("B")}) | newly pushed (old silent): ${added.length} | dropped (old sent): ${lost.length}`);
module.exports = { rows, days, lost, added };
