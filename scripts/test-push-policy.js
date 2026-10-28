/* Offline tests: push policy (scripts/push-policy.js via push-sync sendPush). No network, no real pushes. */
const pp = require("./push-policy.js"), ps = require("./push-sync.js");
let fail = 0; const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const V = ["B22", "S42"], H = 3600000;
const at = "2026-10-27T02:18:00Z";
// 1. milestone allowlist
const MS = { static_fire: "Ship 42 conducts a single-engine static fire test at Massey's.", rollout: "Booster 22 rolls to the launch site.", cryo_complete: "Ship 43 completed its cryo tests.",
  raptors_installed: "Booster 22 has all 33 Raptors installed.", stacking: "Ship 42 stacked on Booster 22.", wdr: "Flight 15 wet dress rehearsal completed.", faa_licence: "FAA licence issued for Flight 15.",
  launch_date: "Flight 15 is now targeting NET 8 November.", launch: "Starship Flight 15 lifts off.", catch: "Booster 22 caught by the chopsticks.", flight_results: "Ship 42 splashed down in the Indian Ocean." };
for (const [type, body] of Object.entries(MS)) { const c = pp.classify({ title: "t", body, at }, { vehicles: V }); ok(c.milestone && c.type === type, `milestone ${type}: "${body}" → ${c.type}`); }
// 2. minor events are not milestones (silent inside the quiet window)
const MINOR = ["Road closed ahead of static fire test.", "Booster 22 propellant loading has begun for static fire test", "Booster 22 lifting jig raised in Megabay 1.", "Booster 22 lifts to catch height at the launch mount.",
  "Ship 42 heads to Massey's.", "Booster 22 lifted onto transport stand ahead of rollout to launch site.", "Starbase Pad 1 Flame Trench wall work is progressing."];
for (const body of MINOR) ok(!pp.classify({ title: "t", body, at }, { vehicles: V }).milestone, `minor: "${body}"`);
ok(!pp.classify({ title: "💥 Static fires (unconfirmed)", body: "Starship Flight 15 static fire conducted.", at }).milestone, "unconfirmed never a milestone");
const recent = [{ verdict: "sent", sent_at: new Date(Date.parse(at) - 2 * H).toISOString(), title: "x", body: "Booster 22 completed its static fire.", at: "2026-10-26T00:00:00Z" }];
ok(!pp.decide({ title: "t", body: MINOR[2], at }, recent, { now: Date.parse(at), vehicles: V }).push, "minor within the quiet window → silent in-app");
// 3. quiet-period rule
const quiet = [{ ...recent[0], sent_at: new Date(Date.parse(at) - 25 * H).toISOString() }];
ok(pp.decide({ title: "t", body: MINOR[2], at }, quiet, { now: Date.parse(at), vehicles: V }).push, `minor after >${pp.QUIET_WINDOW_HOURS}h quiet → pushes`);
ok(!pp.decide({ title: "t", body: MINOR[2], at }, [{ ...recent[0], sent_at: new Date(Date.parse(at) - 23.9 * H).toISOString() }], { now: Date.parse(at), vehicles: V }).push, "minor 23.9h after ANY push → silent");
{ const h = [...quiet]; let n = 0; for (const [i, body] of MINOR.entries()) { const nn = { title: "t", body, at: new Date(Date.parse(at) + i * 60000).toISOString() }; const d = pp.decide(nn, h, { now: Date.parse(nn.at), vehicles: V }); if (d.push) { n++; h.push({ ...nn, verdict: "sent", sent_at: nn.at, key: d.cls.key }); } } ok(n === 1, `at most 1 minor push per quiet stretch (${n})`); }
{ const batch = [{ title: "t", body: MINOR[0], at }, { title: "t", body: "Ship 42 heads to Massey's.", at }, { title: "t", body: MS.static_fire, at }]; const o = pp.orderBatch(batch, { vehicles: V }); ok(o[0].body === MS.static_fire && o[1].body === "Ship 42 heads to Massey's.", "batch order: milestone first, then the most significant minor"); }
ok(pp.decide({ title: "t", body: MS.static_fire, at }, recent, { now: Date.parse(at), vehicles: V }).push, "milestones unaffected by the quiet window");
// 4. cross-feed dedupe (vehicle + event + day), fixtures = the 25 pushes of 23–26 Oct
const past = require("./fixtures/pushes-23-26oct.json").pushes;
ok(past.length === 25, "fixture: 25 past pushes");
const h = []; const sent = [];
for (const r of past) { const d = pp.decide(r, h, { now: Date.parse(r.sent_at), vehicles: V }); if (d.push) { sent.push(r.body); h.push({ ...r, verdict: "sent", key: d.cls.key }); } }
ok(sent.length === 6, `replay: ${sent.length} of 25 would push under the new policy`);
ok(sent.includes("Booster 22 completed its static fire at the launch site."), "replay keeps the B22 static fire (25 Oct)");
const news = past.find((r) => /Full duration static fire completed/.test(r.body)), road = past.find((r) => /Booster 22 completed its static fire/.test(r.body));
ok(pp.classify(news, { vehicles: V }).key === pp.classify(road, { vehicles: V }).key, `cross-feed key: news "🚀 Starship" = Road card (${pp.classify(news, { vehicles: V }).key})`);
const rollouts = past.filter((r) => pp.classify(r, { vehicles: V }).key === "B22|rollout|24 Oct");
ok(rollouts.length >= 3 && rollouts.filter((r) => sent.includes(r.body)).length === 1, `B22 rollout reported ${rollouts.length}× across feeds → pushed once`);
ok(!sent.some((b) => /Massey/.test(b)), "no S42 Massey's push (minor, inside quiet window)");
// 5. sendPush wires it: duplicate across feeds is logged silent, never sent
(async () => {
  const r0 = { vehicles: V, categories: [{ id: "static", history: [{ id: "e1", log_text: road.body, push: { title: road.title, url: road.url, at: road.at } }] }], feed_items: [{ id: "n1", title: news.title, body: news.body, url: news.url, at: news.at }] };
  const out = [], rows = [];
  await ps.sendPush({ title: road.title, body: road.body, url: road.url, at: road.at, visible: { where: "road", box: "static", id: "e1" } }, { road: r0, send: async (m) => out.push(m), logRows: rows, log: () => {}, now: () => Date.parse(road.sent_at) });
  await ps.sendPush({ title: news.title, body: news.body, url: news.url, at: news.at, visible: { where: "feed", id: "n1" } }, { road: r0, send: async (m) => out.push(m), logRows: rows, log: () => {}, now: () => Date.parse(news.sent_at) });
  ok(out.length === 1 && rows[1].verdict.startsWith("silent: duplicate"), `sendPush: Road + news of the same B22 static fire → 1 push (${rows.map((r) => r.verdict).join(" | ")})`);
  console.log(fail ? `\n❌ ${fail} check(s) failed` : "\nAll push-policy checks passed."); process.exit(fail ? 1 : 0);
})();
