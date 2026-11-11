/* Offline: launch-day push policy (11 Nov rehearsal D1/D2/D3/D5). push-policy.js only: no network, no FCM, no git, no files written.
   Replays the 8 rehearsal steps (variant A: X posts as mission updates; variant B: X posts as Road "Launch date" cards) through
   orderBatch + decide, the way sendPush does for one run, then reruns every step and expects 0 new pushes.
   Exact would-send titles / bodies are the real check-flights / check-road strings. node scripts/test-pushpolicy-launchday.js */
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0";
const pp = require("./push-policy.js");
let fail = 0; const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const V = ["B22", "S42"];
// one run: order the batch, decide each push against the history, log it (sent rows carry their key, like notifications.json)
function run(batch, at, hist) {
  const now = Date.parse(at), sent = [];
  for (const n0 of pp.orderBatch(batch.map((n) => ({ at, ...n })), { vehicles: V })) {
    const d = pp.decide(n0, hist, { now, vehicles: V });
    hist.push({ ...n0, sent_at: at, key: d.cls.key, verdict: d.push ? "sent" : `silent: ${d.reason}` });
    if (d.push) sent.push(`${n0.title} / ${n0.body}`);
  }
  return sent;
}
const LIVE = { title: "📡 Livestream ready", body: "Liftoff in 60 min - tap to watch" };
const mission = (body) => ({ title: "Flight 15 update", body });
const card = (body) => ({ title: "🗓️ Launch date · Flight 15", body });
// what each step hands to sendPush in one run (check-flights queue + check-road notifications), per variant
const STEPS = (v) => [
  { n: 1, at: "2026-11-12T10:00:00Z", batch: v === "B" ? [{ title: "🗓️ Launch date: Confirmed", body: "SpaceX set the Flight 15 launch window for 13 Nov at 22:45 UK." }, { title: "✅ Launch time confirmed", body: "13 Nov 22:45" }] : [{ title: "✅ Launch time confirmed", body: "13 Nov 22:45" }],
    want: v === "B" ? ["🗓️ Launch date: Confirmed / SpaceX set the Flight 15 launch window for 13 Nov at 22:45 UK."] : ["✅ Launch time confirmed / 13 Nov 22:45"] },
  { n: 2, at: "2026-11-13T21:50:00Z", batch: v === "B" ? [card("Flight 15 T-0 is 22:45 UK on 13 Nov."), LIVE] : [LIVE], want: ["📡 Livestream ready / Liftoff in 60 min - tap to watch"] },
  { n: 3, at: "2026-11-13T22:30:00Z", batch: v === "B" ? [card("SpaceX moved Flight 15 to 14 Nov at 22:45 UK."), { title: "🚧 Launch delayed", body: "Now 14 Nov 22:45" }] : [{ title: "🚧 Launch delayed", body: "Now 14 Nov 22:45" }],
    want: v === "B" ? ["🗓️ Launch date · Flight 15 / SpaceX moved Flight 15 to 14 Nov at 22:45 UK."] : ["🚧 Launch delayed / Now 14 Nov 22:45"] },
  { n: "3b", at: "2026-11-14T21:50:00Z", batch: [LIVE], want: ["📡 Livestream ready / Liftoff in 60 min - tap to watch"] },
  { n: 4, at: "2026-11-14T22:46:00Z", batch: [mission("Starship Flight 15 lifted off from Pad 2 (SpaceX, 14 Nov)."), { title: "🚀 Liftoff!", body: "Flight 15 is in the air · Watch now" }], want: ["🚀 Liftoff! / Flight 15 is in the air · Watch now"] },
  { n: 5, at: "2026-11-14T22:55:00Z", batch: [mission("Booster 22 was caught by the Pad 2 tower (SpaceX, 14 Nov).")], want: ["Flight 15 update / Booster 22 was caught by the Pad 2 tower (SpaceX, 14 Nov)."] },
  { n: 6, at: "2026-11-14T23:35:00Z", batch: [mission("Ship 42 was caught by the tower after reentry (SpaceX, 14 Nov).")], want: ["Flight 15 update / Ship 42 was caught by the tower after reentry (SpaceX, 14 Nov)."] },
  { n: 7, at: "2026-11-15T00:20:00Z", batch: [{ title: "🏁 Flight 15 — Success", body: "The story's up in the app." }], want: ["🏁 Flight 15 — Success / The story's up in the app."] },
  { n: 8, at: "2026-11-15T09:20:00Z", batch: [{ title: "🚀 Road to Flight 16", body: "Flight 15 is in the log. Now tracking the road to Flight 16." }], want: ["🚀 Road to Flight 16 / Flight 15 is in the log. Now tracking the road to Flight 16."] },
];
const PRIME = { title: "📅 Flight 15", body: "Flight 15 estimated NET 13 Nov · unofficial", at: "2026-11-11T09:30:00Z", sent_at: "2026-11-11T09:30:00Z", verdict: "sent", key: "flight|launch_date@13 Nov|11 Nov" };
for (const v of ["A", "B"]) {
  const hist = [{ ...PRIME }];
  for (const s of STEPS(v)) {
    const got = run(s.batch, s.at, hist);
    ok(JSON.stringify(got) === JSON.stringify(s.want), `${v} step ${s.n}: sends ${JSON.stringify(got)}`);
    const again = run(s.batch, new Date(Date.parse(s.at) + 15 * 60000).toISOString(), hist);
    ok(again.length === 0, `${v} step ${s.n}: rerun 15 min later sends nothing (${again.length})`);
    const re = run(s.batch, new Date(Date.parse(s.at) + 20 * 60000).toISOString(), hist); // same UK day (the dedupe key is per UK day)
    ok(re.length === 0, `${v} step ${s.n}: same items re-served sends nothing (${re.length})`);
  }
  ok(hist.filter((r) => r.verdict === "sent").length === 1 + STEPS(v).length, `${v}: exactly one push per event (${hist.filter((r) => r.verdict === "sent").length - 1} after the priming push)`);
}
// slip / scrub on the SAME UK day as a confirmation still pushes (launch-date dedupe is per date/time, not per day)
{ const h = []; const a = run([{ title: "✅ Launch time confirmed", body: "13 Nov 22:45" }], "2026-11-13T09:00:00Z", h), b = run([{ title: "🚧 Launch delayed", body: "Now 14 Nov 22:45" }], "2026-11-13T22:30:00Z", h);
  ok(a.length === 1 && b.length === 1, `same-day confirm then slip → 2 pushes (${[...a, ...b].join(" | ")})`); }
// a date that only repeats the last pushed one is not an event; a confirmation of an estimate is
{ const h = []; run([{ title: "📅 New estimated time", body: "NET 13 Nov · 22:45 UK" }], "2026-11-11T09:00:00Z", h);
  ok(run([card("Flight 15 T-0 is 22:45 UK on 13 Nov.")], "2026-11-12T09:00:00Z", h).length === 0, "restated date (same time, no confirmation) → no push");
  ok(run([{ title: "✅ Launch time confirmed", body: "13 Nov 22:45" }], "2026-11-12T12:00:00Z", h).length === 1, "confirmation of the same estimated time → push"); }
// loss paths (milestones even right after other pushes), exactly once on rerun
for (const [name, b] of [["booster loss", "Booster 22 was lost after boostback (SpaceX, 14 Nov)."], ["ship loss", "Ship 42 was lost during reentry (SpaceX, 14 Nov)."], ["ship catch failed", "Ship 42 catch attempt failed (SpaceX, 14 Nov)."]]) {
  const h = [{ title: "🚀 Liftoff!", body: "Flight 15 is in the air · Watch now", sent_at: "2026-11-14T22:46:00Z", verdict: "sent", key: "F15|launch|14 Nov" }];
  const c = pp.classify({ title: "Flight 15 update", body: b, at: "2026-11-14T23:00:00Z" }, { vehicles: V, liftoffAt: h[0].sent_at });
  ok(c.milestone && c.type === "vehicle_lost", `${name}: milestone ${c.key}`);
  ok(JSON.stringify(run([mission(b)], "2026-11-14T23:00:00Z", h)) === JSON.stringify([`Flight 15 update / ${b}`]), `${name}: pushes 14 min after liftoff push`);
  ok(run([mission(b)], "2026-11-14T23:15:00Z", h).length === 0, `${name}: rerun sends nothing`);
}
{ const h = [{ title: "x", body: "y", sent_at: "2026-11-15T00:00:00Z", verdict: "sent", key: "S42|catch|15 Nov" }];
  ok(JSON.stringify(run([{ title: "🏁 Flight 15 — Failure", body: "The story's up in the app." }], "2026-11-15T00:20:00Z", h)) === JSON.stringify(["🏁 Flight 15 — Failure / The story's up in the app."]), "result Failure pushes inside the quiet window"); }
// generic for any flight number
{ const c = pp.classify({ title: "🚧 Launch delayed", body: "Now 3 Feb 18:00", at: "2027-01-30T10:00:00Z" }), l = pp.classify({ title: "🚀 Liftoff!", body: "Flight 23 is in the air · Watch now", at: "2027-02-03T18:01:00Z" }), r = pp.classify({ title: "🚀 Road to Flight 24", body: "Flight 23 is in the log. Now tracking the road to Flight 24.", at: "2027-02-04T09:00:00Z" });
  ok(c.milestone && c.type === "launch_date" && l.milestone && l.key === "F23|launch|3 Feb" && r.milestone && r.type === "rollover", "Flight 23 / 24 strings classify the same way (no hard-coded 15)"); }
// "moved" is a date change only when the launch is the subject; vehicle moves stay transport
ok(pp.classify({ title: "🗓️ Launch date · Flight 15", body: "SpaceX moved Flight 15 to 14 Nov at 22:45 UK.", at: "2026-11-13T22:30:00Z" }).type === "launch_date", "'moved Flight 15 to 14 Nov' → launch_date");
ok(pp.classify({ title: "🚀 Starship", body: "Ship 40 was moved into the Gigabay starfactory bay.", at: "2026-11-10T10:00:00Z" }, { vehicles: V }).type === "transport", "'Ship 40 was moved into the Gigabay' → transport (minor), unchanged");
ok(pp.classify({ title: "🚀 Starship", body: "Booster 22 moved to Pad 2.", at: "2026-11-10T10:00:00Z" }, { vehicles: V }).type === "rollout", "'Booster 22 moved to Pad 2' → rollout, unchanged (not a launch date)");
ok(!pp.classify({ title: "💥 Static fires · Flight 15", body: "Ship 43 static fire moved to 20 Nov.", at: "2026-11-10T10:00:00Z" }, { vehicles: V }).milestone, "'static fire moved to 20 Nov' is not a launch-date milestone");
ok(!pp.classify({ title: "🚀 Starship", body: "Flight 15 could slip to 15 Nov.", at: "2026-11-10T10:00:00Z" }).milestone, "hedged 'could slip to' is not a milestone");
ok(!pp.classify({ title: "💥 Static fires: In progress", body: "Booster 22 propellant loading has begun for static fire test", at: "2026-11-10T10:00:00Z" }, { vehicles: V }).milestone, "category title 'Static fires: In progress' does not make a milestone");
// (a) vehicle_lost only for the current flight's vehicles, between liftoff and liftoff + 3h (liftoff read from the history)
{ const LIFT = { title: "🚀 Liftoff!", body: "Flight 15 is in the air · Watch now", sent_at: "2026-11-14T22:46:00Z", verdict: "sent", key: "F15|launch|14 Nov" };
  const dc = (body, at, h = [LIFT], vehicles = V) => pp.decide({ title: "Flight 15 update", body, at }, h, { now: Date.parse(at), vehicles });
  const old = dc("Ship 36 exploded in June 2025.", "2026-11-14T23:00:00Z");
  ok(!old.cls.milestone && old.cls.type !== "vehicle_lost", `'Ship 36 exploded in June 2025' (not a current vehicle) → not a milestone (${old.cls.key})`);
  ok(!pp.classify({ title: "🚀 Starship", body: "Ship 36 exploded in June 2025.", at: "2026-11-14T23:00:00Z" }, { vehicles: V, liftoffAt: LIFT.sent_at }).milestone, "'Ship 36 exploded in June 2025' → not a milestone even inside the liftoff window");
  const cur = dc("Ship 42 exploded during reentry (SpaceX, 14 Nov).", "2026-11-15T00:30:00Z");
  ok(cur.cls.milestone && cur.cls.type === "vehicle_lost" && cur.push, `current ship loss 1h44 after liftoff → vehicle_lost milestone, pushes (${cur.cls.key})`);
  const rud = dc("Booster 22 experienced a RUD during boostback.", "2026-11-14T22:52:00Z");
  ok(rud.cls.type === "vehicle_lost" && rud.push, `current booster RUD 6 min after liftoff → vehicle_lost (${rud.cls.key})`);
  const gen = dc("The booster was lost shortly after stage separation.", "2026-11-14T22:50:00Z");
  ok(gen.cls.type === "vehicle_lost" && gen.cls.vehicle === "B22", `'the booster was lost' inside the window → current booster B22 (${gen.cls.key})`);
  ok(dc("Ship 42 exploded during reentry.", "2026-11-15T01:47:00Z").cls.type !== "vehicle_lost", "current-vehicle loss 3h01 after liftoff → not vehicle_lost");
  ok(dc("Ship 42 exploded during reentry.", "2026-11-14T22:40:00Z").cls.type !== "vehicle_lost", "current-vehicle loss before liftoff → not vehicle_lost");
  ok(dc("Ship 42 exploded during reentry.", "2026-11-14T23:00:00Z", []).cls.type !== "vehicle_lost", "no liftoff in the history → not vehicle_lost");
  ok(dc("Ship 42 exploded during reentry.", "2026-11-14T23:00:00Z", [LIFT], []).cls.type !== "vehicle_lost", "no current vehicles known → not vehicle_lost");
  ok(dc("Ship 42 exploded, like Ship 36 did in 2025.", "2026-11-14T23:00:00Z").cls.type !== "vehicle_lost", "a loss naming a non-current vehicle too → not vehicle_lost");
  ok(dc("Ship 42 exploded during reentry.", "2026-11-14T23:00:00Z", [{ ...LIFT, retracted: true }]).cls.type !== "vehicle_lost", "a retracted liftoff row does not open the window");
  ok(dc("Ship 42 exploded during reentry.", "2026-11-14T23:00:00Z", [{ title: "Flight 15 update", body: "Starship Flight 15 lifted off from Pad 2.", sent_at: "2026-11-14T22:46:00Z", verdict: "silent: duplicate F15|launch|14 Nov" }]).cls.type === "vehicle_lost", "a deduped generic liftoff row still opens the window");
  ok(!pp.classify({ title: "t", body: "Ship 42 exploded during reentry.", at: "2026-11-14T23:00:00Z" }, { vehicles: V }).milestone, "classify without a liftoff time → not a milestone (generic for any flight)");
  const f23 = pp.classify({ title: "Flight 23 update", body: "Ship 51 was lost during reentry.", at: "2027-02-03T19:00:00Z" }, { vehicles: ["B30", "S51"], liftoffAt: "2027-02-03T18:01:00Z" });
  ok(f23.type === "vehicle_lost" && f23.key === "S51|vehicle_lost|3 Feb", `Flight 23 vehicles / liftoff → vehicle_lost (${f23.key})`); }
// (c) a flight-subject "is now <date>" / "now <date/time>" is a date change; other subjects are not
for (const b of ["Flight 15 is now 14 Nov", "Flight 15 now 14 Nov 22:45", "Flight 23 is now NET 3 Feb", "The launch is now 14 Nov at 22:45 UK.", "Flight 15 now 23:15 UK"]) {
  const c = pp.classify({ title: "🚀 Starship", body: b, at: "2026-11-13T22:30:00Z" }, { vehicles: V });
  ok(c.milestone && c.type === "launch_date", `'${b}' → launch_date (${c.key})`); }
{ const c = pp.classify({ title: "🚀 Starship", body: "Flight 15 now 14 Nov 22:45", at: "2026-11-13T22:30:00Z" }); ok(c.target === "14 Nov 22:45", `'Flight 15 now 14 Nov 22:45' target ${c.target}`); }
for (const b of ["Ship 43 is now 14 Nov", "Static fire is now 20 Nov", "Booster 22 now 14 Nov 22:45", "Pad 2 is now 14 Nov ready", "Flight 15 could now be 14 Nov", "Flight 15 is now in the log."]) {
  const c = pp.classify({ title: "🚀 Starship", body: b, at: "2026-11-13T22:30:00Z" }, { vehicles: V });
  ok(c.type !== "launch_date", `'${b}' → not launch_date (${c.key})`); }
{ const h = [{ ...PRIME }]; ok(JSON.stringify(run([{ title: "Flight 15 update", body: "Flight 15 is now 14 Nov" }], "2026-11-13T22:30:00Z", h)) === JSON.stringify(["Flight 15 update / Flight 15 is now 14 Nov"]), "'Flight 15 is now 14 Nov' pushes after a 13 Nov push (inside the quiet window)");
  ok(run([{ title: "Flight 15 update", body: "Flight 15 is now 14 Nov" }], "2026-11-13T22:45:00Z", h).length === 0, "…and its rerun sends nothing"); }
// (e) the livestream reminder has its own type: it cannot dedupe a real liftoff push that names no flight
{ const c = pp.classify({ ...LIVE, at: "2026-11-14T21:50:00Z" }); ok(c.milestone && c.type === "livestream" && c.rank === 100, `'📡 Livestream ready' → livestream milestone (${c.key})`);
  const h = [{ ...PRIME }];
  const a = run([LIVE], "2026-11-14T21:50:00Z", h), b = run([{ title: "🚀 Starship", body: "Starship lifted off" }], "2026-11-14T22:46:00Z", h);
  ok(a.length === 1 && b.length === 1, `livestream, then 'Starship lifted off' (no flight number) → both send (${[...a, ...b].join(" | ")})`);
  ok(run([LIVE], "2026-11-14T22:00:00Z", h).length === 0 && run([{ title: "🚀 Starship", body: "Starship lifted off" }], "2026-11-14T22:55:00Z", h).length === 0, "…and reruns of both send nothing"); }
// unchanged from main (fixed expectations): Static fires: In progress stays minor, B22 moved to Pad 2 stays rollout
ok(pp.classify({ title: "💥 Static fires: In progress", body: "Booster 22 propellant loading has begun for static fire test", at: "2026-11-10T10:00:00Z" }, { vehicles: V }).key === "B22|other|10 Nov", "'Static fires: In progress' → B22|other (minor), as on main");
ok(pp.classify({ title: "🚀 Starship", body: "B22 moved to Pad 2", at: "2026-11-10T10:00:00Z" }, { vehicles: V }).key === "B22|rollout|10 Nov", "'B22 moved to Pad 2' → B22|rollout milestone, as on main");
// no regression: real recent minor rows from notifications.json stay quiet-windowed (silent right after a push, one push after 24h quiet)
{ const rows = require("../notifications.json").pushes;
  const REAL = ["Booster 22 was lifted to the top of the tower.", "Pad 1 flame trench construction continues.", "Booster 22 was lifted for installation on Pad 2.", "The transport stand returned to production.", "Ship 40 was moved into the Gigabay starfactory bay.", "New marine hazard area announced for Starship Flight 15 on November 13 (LabPadre, 9 Nov).", "Flight 15 will catch the booster followed by the ship the next day (SpaceX, 7 Nov).", "Flight 15 has reportedly slipped by four days to 12 November"].map((b) => rows.find((r) => r.body === b)).filter(Boolean);
  ok(REAL.length === 8, `found ${REAL.length} real minor rows in notifications.json`);
  for (const r of REAL) {
    const t = Date.parse(r.sent_at), d = pp.decide(r, [{ title: "x", body: "Ship 42 completed its static fire.", sent_at: new Date(t - 2 * 3600000).toISOString(), verdict: "sent", key: "S42|static_fire|x" }], { now: t, vehicles: V });
    ok(!d.cls.milestone && !d.push, `real minor stays silent 2h after a push: "${r.title} / ${r.body}" (${d.reason})`);
    const q = pp.decide(r, [{ title: "x", body: "y", sent_at: new Date(t - 25 * 3600000).toISOString(), verdict: "sent", key: "S42|static_fire|x" }], { now: t, vehicles: V });
    ok(q.push && /^minor/.test(q.reason), `real minor pushes after 25h quiet (${q.reason})`);
  }
  // every real row except the flight-checker launch-date pushes keeps its old milestone / type verdict (compared against fixed expectations)
  const changed = rows.filter((r) => { const c = pp.classify(r, { vehicles: V }); return c.milestone && c.type === "launch_date" && !/\bNET \d+|targeting|launch date (?:set|moved|slips?|changed|now)|now targeting|launch (?:is )?(?:set|scheduled) for/i.test(r.body); });
  ok(changed.every((r) => /^(?:🚧 Launch delayed|📅 New estimated (?:date|time)|✅ Launch time confirmed)$/.test(r.title)), `new launch-date milestones in the real log are only flight-checker date pushes (${changed.map((r) => r.title + " / " + r.body).join(" | ") || "none"})`);
}
console.log(fail ? `\n❌ ${fail} check(s) failed` : "\nAll launch-day push-policy checks passed."); process.exit(fail ? 1 : 0);
