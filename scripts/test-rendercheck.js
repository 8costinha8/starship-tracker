/* Rendered-output check (scripts/render-check.js). No network, no pushes: node scripts/test-rendercheck.js
   Fixture: the 31 Oct pre-fix snapshot (the 16:20 UK live check found these on screen) → every class is caught;
   after scripts/backfill-2026-10-31-render.js → the rendered output is clean. */
const fs = require("fs"), path = require("path");
const RC = require("./render-check.js"), BF = require("./backfill-2026-10-31-render.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const snap = path.join(__dirname, "..", "data", "snapshots", "2026-10-31-render", "road.json");
const road = JSON.parse(fs.readFileSync(snap, "utf8"));
const before = RC.check(road), has = (t, re) => before.some((f) => f.type === `render-${t}` && re.test(f.msg));
// 10 Nov: the Road view keeps only the newest Launch date card (including unboxed
// launch_date feed items), so this snapshot's 30 Oct slip is the card render-check
// sees and it matches predicted NET. The stale-card detector is still covered
// when later launch_date items are removed.
check(!has("date", /newest Launch date card says /), "launch date: 31 Oct snapshot's newest card matches predicted NET");
{ const syn = JSON.parse(JSON.stringify(road));
  syn.feed_items = (syn.feed_items || []).filter((f) => f.kind !== "launch_date");
  check(RC.check(syn).some((f) => f.type === "render-date" && /newest Launch date card says "Flight 15 is now targeting NET 8 November/.test(f.msg)), "launch date: stale NET 8 Nov card still caught when it is the newest"); }
check(has("date", /static S42: Flight Log shows 27 Oct · 21:45, Road card shows 28 Oct · 11:25/), "S42 static fire: two event times caught");
// 9 Nov: the Flight Log's pinned pad lines now also show in the vehicle's Road pad drawer (app.js rtfCards), so the 31 Oct case
// (pinned 13 Sep 05:02 line with no Road post) is fixed by design; the detector still catches a Flight Log line the card does not show.
{ const c = RC.view(road).cards.find((x) => x.id === "rtf-pad-S42");
  check(!has("date", /pad S42:/) && c && c.rows.some((r) => r.when === "13 Sep · 05:02"), "S42 pad: pinned 13 Sep 05:02 Flight Log line now on the Road card drawer (no mismatch)");
  const syn = JSON.parse(JSON.stringify(road)); syn.categories.find((x) => x.id === "pad").history.unshift({ id: "x-syn", date: "30 Oct", at: "2026-10-30T20:10:00.000Z", text: "Pad 2 chopsticks lifted Ship 42 to catch height again.", url: "https://x.com/Example/status/1", src: "@Example", trust: "trusted", hardware: "S42", flight: 15, feed_hide: true });
  check(RC.check(syn).some((f) => f.type === "render-date" && /pad S42: Flight Log shows 30 Oct/.test(f.msg)), "S42 pad: a Flight Log line hidden from the Road card is still caught"); }
check(!before.some((f) => f.type === "render-status"), "pad: the Flight Log headline follows its own pill (never 'Not yet' beside 'under way', 3 Nov handover fix)");
check(["quick disconnects purging", "performing more catch", "has been moved", "completes three static fires", "completes full duration", "propellant loading has begun"].every((p) => before.some((f) => f.type === "render-tense" && f.msg.includes(p))), "present tense on screen caught (cards, drawers, Flight Log)");
check(has("date", /cryo S42: Flight Log shows 9 Oct · 21:30, Road card shows 9 Oct · 15:36/), "S42 cryo 9 Oct: two times caught");
check(has("crossover", /Raptor engines · Booster 22 shows "Ship 42 headed back/) && has("crossover", /Raptor engines · Ship 42 shows .*Booster 22/), "ship/booster crossover caught both ways");
check(has("duplicate", /Five Raptor 3s were removed from Ship 42/), "30 Sep duplicate removal rows caught");
const fixed = JSON.parse(JSON.stringify(road)); const r = BF.apply(fixed, { log: () => {} });
const PB = require("./backfill-2026-10-31-polish.js"), pol = JSON.parse(JSON.stringify(fixed)); PB.apply(pol, { log: () => {} });
const after = RC.check(pol).filter((f) => !/^render-(badge|punctuation|links|fragment|shorthand|mismatch)$/.test(f.type)); // 1 Nov classes: covered by test-nov01.js / test-nov01c.js
for (const f of after) console.log(`   left: [${f.type}] ${f.msg}`);
check(after.length === 0, `after the render-fix + polish backfills: rendered output clean (${after.length} left)`);
check(BF.apply(fixed, { log: () => {} }).changes.length === 0, "backfill is idempotent");
const urls = (x) => new Set(JSON.stringify(x).match(/https:\/\/[^"]+/g)); const ua = urls(fixed);
check([...urls(road)].every((u) => ua.has(u)), "no source link dropped");
check(JSON.stringify(fixed.milestones) === JSON.stringify(road.milestones) && fixed.feed_items.length === road.feed_items.length, "no milestone or feed item added/removed");
const mo = (x) => JSON.stringify(x.categories.map((c) => c.history.map((h) => [h.media_override || null, h.keep_image || null])));
check(mo(fixed) === mo(road), "media locks / keep_image untouched");
check(fixed.feed_items.filter((f) => f.push_text).every((f) => road.feed_items.find((o) => o.id === f.id).body === f.push_text), "push wording kept (push_text = original body)");
check(r.review.length >= 1, "unclear cryo time logged for review");
// verbless fragments and 'being X' wording (31 Oct polish)
const RC2 = (lines) => { const r = JSON.parse(JSON.stringify(pol)); r.feed_items = [...r.feed_items, ...lines.map((body, i) => ({ id: `t-${i}`, kind: "news", body, at: "2026-10-30T12:00:00Z" }))]; return RC.check(r).filter((f) => /^Feed t-/.test(f.item || "")).map((f) => f.msg); };
const frag = RC2(["Ship 42 ready with all 6 Raptors.", "Lifting jig raised for Booster 22 engine testing in Megabay 1.", "Pad 2 chopsticks under maintenance.", "Ship 43 is being transported by road to the production site", "Ship 42's Raptors were reportedly being reinstalled."]);
check(frag.filter((m) => /has no verb|headline fragment/.test(m)).length === 3, "verbless fragments flagged (no verb / headline participle)");
check(frag.filter((m) => /'being …'/.test(m)).length === 2, "'being X' progressive wording flagged");
check(RC2(["Ship 42 was ready with all 6 Raptors.", "The lifting jig was raised for Booster 22 engine testing in Megabay 1.", "Chopsticks lifted Booster 22 off the launch mount to catch height.", "Ship 42 and the tiled barrel section arrived back at the production site."]).length === 0, "full past-tense sentences pass (no false positives)");
check(PB.apply(pol, { log: () => {} }).changes.length === 0, "polish backfill is idempotent");
check(pol.feed_items.filter((f) => f.kind === "launch_date").every((f, i) => f.body === fixed.feed_items.filter((x) => x.kind === "launch_date")[i].body), "launch_date feed bodies untouched (no re-push)");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
