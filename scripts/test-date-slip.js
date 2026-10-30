/* Offline: an estimated (unofficial) NET slip is detected and is push-worthy.
     node scripts/test-date-slip.js */
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0";
const P = require("./predicted.js"), pp = require("./push-policy.js"), gate = require("./push-gate.js");
let failed = 0; const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };
(async () => {
const NOW = Date.parse("2026-10-30T13:00:00Z");
const Q4 = { n: 15, status: "TBD", precision: "Q4", date: "2026-12-31T00:00:00Z" };
const MANUAL = { flight: 15, net: "2026-11-08", mode: "manual", basis: "FAA planning · NSF", sources: [{ name: "NSF" }, { name: "Elon Musk" }] };
const road = { flight: 15, vehicles: ["B22", "S42"], categories: [], predicted: MANUAL };
// the FAA post the classifier marked "unrelated" still passes the date prefilter
check(P.prefilter({ text: "Starship Flight 15 launch window: NET November 12 per updated air traffic planning" }, 15, [], NOW), "FAA planning-slide wording passes the date prefilter");
const mentions = [{ flight: 15, source: "X @FAANews", date: "2026-11-12", seen_at: "2026-10-30T12:40:00Z" }, { flight: 15, source: "X @NASASpaceflight", date: "2026-11-12", seen_at: "2026-10-30T09:10:00Z" }];
const r = P.computePredicted({ road, target: 15, next: Q4, lastLogged: 14, mentions, now: NOW });
check(r.predicted && r.predicted.net === "2026-11-12", "2 sources on 12 Nov replace the manual 8 Nov");
check(r.slip && r.slip.from === "2026-11-08" && r.slip.to === "2026-11-12", "slip 8 Nov → 12 Nov detected");
const n = P.slipPush(r.slip, NOW);
check(n.body === "Flight 15 now NET 12 Nov (was 8 Nov) · unofficial", `push text: ${n.body}`);
const recent = [{ title: "🚀 Starship", body: "Booster 23 has returned to Megabay 1", sent_at: "2026-10-30T09:45:00Z", verdict: "sent" }];
const d = pp.decide(n, recent, { now: NOW, vehicles: ["B22", "S42"] });
check(d.push && d.cls.milestone && d.cls.type === "launch_date", `push policy: milestone, skips quiet window (${d.reason})`);
const g = await gate.evaluate(n, { history: recent, state: { pending: [] }, now: NOW, seenPosts: [], vehicles: ["B22", "S42"] });
check(g.action === "send", `push gate sends it (${g.reason})`);
const ps = require("./push-sync.js"); const rd = { flight: 15, vehicles: ["B22", "S42"], categories: [] };
const fn = ps.addFeedItem(rd, { title: n.title, body: n.body, at: n.at, kind: "launch_date", flight: 15 });
const row = await ps.sendPush(fn, { road: rd, send: async () => { throw new Error("must not send"); }, save: false, history: recent, shadow: false, log: () => {} });
check(row.verdict === "not sent (test mode)", `sendPush (test mode, nothing sent): not blocked/silent → ${row.verdict}`);
const same = P.computePredicted({ road: { ...road, predicted: r.predicted }, target: 15, next: Q4, lastLogged: 14, mentions, now: NOW });
check(!same.slip, "no second push when the date is unchanged");
{ const f = P.computePredicted({ road: { ...road, predicted: null }, target: 15, next: Q4, lastLogged: 14, mentions, now: NOW });
  const fp = f.slip && P.slipPush(f.slip, NOW);
  check(fp && fp.body === "Flight 15 estimated NET 12 Nov · unofficial", `first estimate (Not confirmed → Estimated) pushes, labelled: ${fp && fp.body}`);
  check(fp && pp.decide(fp, recent, { now: NOW, vehicles: ["B22", "S42"] }).push, "first-estimate push passes the push policy"); }
// every estimated-date change → push, and every such push says it is an estimate
for (const [from, to] of [["2026-11-08", "2026-11-12"], ["2026-11-12", "2026-11-10"], [null, "2026-12-03"]]) {
  const prev = from ? { ...MANUAL, net: from } : null, cur = { ...MANUAL, net: to, mode: "auto" };
  const sl = P.slipOf(prev, cur), body = sl && P.slipPush(sl, NOW).body;
  check(!!body && /· unofficial$/.test(body) && /\bNET \d+ \w{3}\b/.test(body), `change ${from || "none"} → ${to}: push labelled as estimate (${body})`);
}
check(P.slipOf({ ...MANUAL }, null) === null, "estimate cleared (e.g. SpaceX confirmed) → no estimate push (check-flights sends the official one)");
check(P.slipOf({ ...MANUAL, flight: 15 }, { ...MANUAL, flight: 16, net: "2026-12-03" }).from === null, "new flight's first estimate is not compared with the old flight's date");
console.log(failed ? `\n${failed} failed` : "\nall passed"); process.exit(failed ? 1 : 0);
})();
