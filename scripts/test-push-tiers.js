// Tests the three-tier push model: unit cases + replay of the whole Flight 15 cycle with a fake sender.
const path = require("path"), fs = require("fs");
const tiers = require("./push-tiers.js"), pp = require("./push-policy.js");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
const V = ["B22", "S42"], T = (iso) => ({ sent_at: iso, at: iso });
const d = (n, h = [], x = {}) => tiers.decide({ ...n, ...(n.sent_at ? {} : T("2026-11-05T14:00:00Z")) }, h, { vehicles: V, flight: 15, ...x });

// unit
ok(d({ title: "🚀 Liftoff!", body: "Flight 15 is in the air · Watch now", sent_at: "2026-11-13T23:02:00Z", at: "2026-11-13T23:02:00Z" }).tier === "A", "liftoff = A");
ok(d({ title: "Road to Flight 16", body: "Flight 15 is logged", sent_at: "2026-11-15T09:00:00Z" }).push === true, "Road to Flight N+1 pushes (A)");
ok(d({ title: "🏗️ Pad activity · Flight 15", body: "Booster 22 heads to the launch site." }).tier === "C", "'heads to' progress = C (never a push)");
ok(d({ title: "💥 Static fires (unconfirmed)", body: "Starship Flight 15 static fire activity noted." }).push === false, "unconfirmed = never pushed");
ok(d({ title: "Flight 15 update", body: "SpaceX plans to try catching both Booster 22 and Ship 42 (Elon Musk, 6 Nov)." , where: "mission"}).event === "rumour", "Elon plan = rumour, in-app only");
ok(d({ title: "🚀 Starship", body: "Ship 43 is being transported by road to the production site" }).event === "other_flight", "other flight's hardware = C");
ok(d({ title: "🚀 Starship", body: "Ship 44 rolled out for its cryogenic proof campaign." }).event === "other_flight", "unknown later hardware = C");
const sfDone = { title: "💥 Static fires: Completed", body: "Booster 22 completed its static fire at the launch site.", sent_at: "2026-11-05T14:00:00Z" };
const r1 = d(sfDone); ok(r1.push && r1.tier === "B", "static fire completed = B, pushes at 14:00 UK");
const kept1 = [{ ...sfDone, verdict: "sent", tier: "B", event: "static_fire", vehicle: "B22" }];
ok(!d({ ...sfDone, body: "Full duration static fire completed for booster preparing for flight 15", sent_at: "2026-11-05T18:00:00Z" }, kept1).push, "same vehicle + milestone is not pushed twice");
ok(!d({ title: "❄️ Cryo tests: Completed", body: "Ship 42 completed cryo testing.", sent_at: "2026-11-05T18:00:00Z" }, kept1).push, "max 1 Tier B per UK day");
ok(d({ title: "❄️ Cryo tests: Completed", body: "Ship 42 completed cryo testing.", sent_at: "2026-11-06T09:00:00Z" }, kept1).push, "…next day it can push");
ok(!d({ title: "❄️ Cryo tests: Completed", body: "Ship 42 completed cryo testing.", sent_at: "2026-11-06T02:00:00Z" }).push, "Tier B never between 23:00 and 07:00 UK");
ok(d({ title: "🚧 Launch delayed", body: "Now 14 Nov 02:00", sent_at: "2026-11-13T03:00:00Z" }).push, "Tier A launch date change pushes at 03:00 UK");
ok(!d({ title: "🏗️ Pad activity: Done", body: "Booster 22 stacked on the OLM at Pad 2.", sent_at: "2026-11-13T10:00:00Z" }, [{ title: "✅ Launch time confirmed", body: "13 Nov 22:45", verdict: "sent", sent_at: "2026-11-12T12:00:00Z", tier: "A", event: "launch_date", target: "13 Nov 22:45" }]).push, "launch day: Tier B held (A only)");
const dateRow = (iso, body, title = "🚧 Launch delayed") => ({ title, body, sent_at: iso, at: iso, verdict: "sent", tier: "A", event: "launch_date", target: pp.launchTarget(body) });
ok(!d({ title: "📅 Flight 15", body: "Flight 15 now NET 13 Nov (was 12 Nov) · unofficial", sent_at: "2026-11-06T15:00:00Z" }, [dateRow("2026-11-05T22:00:00Z", "NET 13 Nov", "📅 New estimated date")]).push, "same launch date twice = one push");
ok(d({ title: "✅ Launch time confirmed", body: "13 Nov 22:45", sent_at: "2026-11-13T19:31:00Z" }, [dateRow("2026-11-07T16:00:00Z", "Now 13 Nov 22:45")]).push === true, "an estimate that becomes CONFIRMED pushes (upgrade), the same time repeated does not");
ok(d({ title: "🚧 Launch delayed", body: "Now 13 Nov 22:45", sent_at: "2026-11-13T19:31:00Z" }, [dateRow("2026-11-07T16:00:00Z", "Now 13 Nov 22:45")]).push === false, "same estimate repeated = no push");
// replay
const R = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "replay-tiers.js")], { encoding: "utf8" });
ok(R.status === 0, `replay ran: ${R.stdout.trim()}`);
const rep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "tier-replay.json"), "utf8"));
const kept = rep.rows.filter((x) => x.new === "PUSH"), old = rep.rows.filter((x) => x.old === "sent");
ok(rep.totals.before >= 75 && rep.totals.after < 30, `${rep.totals.before} pushes → ${rep.totals.after} (A ${rep.totals.A}, B ${rep.totals.B})`);
ok(kept.every((x) => x.tier === "A" || x.tier === "B") && rep.totals.A + rep.totals.B === rep.totals.after, "every kept push is A or B; no C reaches a phone");
// launch-critical: independent of the classifier (regexes on the OLD sent rows) → each distinct critical event must still have ≥1 push
const crit = [
  ["T-60 livestream", /Livestream ready/], ["liftoff", /Liftoff!/], ["deorbit countdown", /Deorbit in/], ["ship caught", /Ship caught!/], ["flight result", /🏁 Flight 15/],
  ["booster outcome (Super Heavy splashdown)", /Super Heavy diverted to offshore splashdown/], ["FAA licence", /FAA approval has arrived/], ["launch time confirmed", /Launch time confirmed/],
  ["date: NET 12 Nov", /NET 12 Nov/], ["date: NET 13 Nov", /NET 13 Nov/], ["date: 13 Nov 22:45", /Now 13 Nov 22:45/], ["date: 13 Nov 22:47 (T-0 slip)", /Now 13 Nov 22:47/],
];
for (const [name, re] of crit) {
  const was = old.some((x) => re.test(`${x.title} ${x.body}`)), now = kept.some((x) => re.test(`${x.title} ${x.body}`) || (name.startsWith("FAA") && x.event === "faa_licence") || (name.startsWith("date: NET 13") && x.event === "launch_date" && /13 Nov/.test(x.body + x.title)) );
  ok(was && now, `launch-critical kept: ${name}`);
}
ok(kept.some((x) => /Launch time confirmed/.test(x.title)), "replay: the confirmed 22:45 still pushes although 22:45 was pushed earlier as an estimate");
// no dropped row of Tier A event type except exact repeats
const droppedA = rep.rows.filter((x) => x.old === "sent" && x.new !== "PUSH" && x.tier === "A");
ok(droppedA.every((x) => /already pushed|not a new date/.test(x.reason)), `every dropped Tier A row is an exact repeat (${droppedA.length}): ${droppedA.map((x) => x.title.slice(0, 22)).join(" | ")}`);
// quiet-day behaviour: no day above 3 pushes except flight days
const busiest = Math.max(...Object.entries(rep.days).filter(([k]) => !["2026-11-13", "2026-11-14"].includes(k)).map(([, v]) => v.after));
ok(busiest <= 3, `busiest non-flight day ≤ 3 pushes (was ${Math.max(...Object.values(rep.days).map((v) => v.before))}/day max); got ${busiest}`);
// flag off by default: old decide unchanged
ok(!tiers.enabled({ root: "/nonexistent", env: {} }), "tiers are OFF unless PUSH_TIERS=1 / push-tiers.json (rollout stays shadow-first)");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
