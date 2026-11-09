/* 1 Nov round 3: card (Flight Log) and feed (Road cards) agree per post; shorthand spelled out; colon-led fragments flagged;
   S42 cryo frame; push wording unchanged. No network, no pushes: node scripts/test-nov01c.js */
const fs = require("fs"), path = require("path"), RC = require("./render-check.js"), BF = require("./backfill-2026-11-01c.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), clone = (x) => JSON.parse(JSON.stringify(x)), live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const v = RC.view(live), card = (id) => v.cards.find((c) => c.id === id), pins = [];
for (const b of Object.values(live.flightlog_pins.boxes)) for (const k of b.cards) for (const l of k.lines) pins.push(l);
const pin = (u) => pins.find((l) => l.url === u);
// 9 Nov re-date: the 1 Nov backfill is a one-off (no checker runs it); live data added since then may contain shorthand it would spell out
// (2 Nov "Pad 2 OLM painted dark grey."), so idempotence is checked on the entries it covered (at ≤ 1 Nov)
{ const cut = clone(live); for (const c of cut.categories) { c.history = c.history.filter((h) => !h.at || h.at < "2026-11-02"); for (const h of c.history) h.updates = (h.updates || []).filter((u) => !u.at || u.at < "2026-11-02"); }
  check(BF.apply(cut, { log: () => {} }).length === 0, "backfill idempotent on the live entries it covered (≤ 1 Nov)"); }
check(RC.check(live).length === 0, "render-check clean");
const b22 = card("rtf-pad-B22").rows.find((r) => r.url === BF.S.B22pad);
check(b22.text === BF.T.B22pad && pin(BF.S.B22pad).text === BF.T.B22pad && live.feed_items.find((f) => f.url === BF.S.B22pad).body === BF.T.B22pad, "B22 26 Oct: one line on card, feed and feed item");
{ const c = card("rtf-pad-S42"), r = [c, ...c.rows].find((x) => x.url === BF.S.S42pad); // 9 Nov re-date: a newer 7 Nov S42 post leads the card; the 12 Sep line is a drawer row
check(r && r.text === BF.T.S42pad && pin(BF.S.S42pad).text === BF.T.S42pad, "S42 12 Sep: one source-accurate line (TrackingTheSB: 'now at catch height')"); }
const lp = card("rtf-pad-pad");
// 9 Nov re-date: the 20/21 Oct posts left the Launch pad card's 12-entry history; the Flight Log pins keep them, so only the pin side is checked
check(pin(BF.S.padTests).text === BF.T.padTests && pin(BF.S.padTests).day === "20 Oct" && pin(BF.S.padTests).time === "23:56", "Launch pad 20 Oct catch tests: same text, same 23:56 post time");
const bq = pin(BF.S.bqd); check(bq && bq.day === "21 Oct" && bq.time === "19:00" && /likely/.test(bq.text), "21 Oct BQD purge: 19:00 (post time 18:00 UTC) on card and Flight Log, 'likely' kept");
const sf = card("rtf-static-B22"); check(sf.text === BF.T.b22sf && pin(BF.S.b22sfNSF).text === BF.T.b22sf && pin(BF.S.b22sfNSF).also_url === BF.S.b22sfSFN && !/conducted/.test(JSON.stringify(sf)), "B22 static: 'completed' everywhere; SFN link kept");
check(live.categories.find((c) => c.id === "faa").history[0].text === BF.T.faa, "FAA line is a full sentence");
const txt = JSON.stringify(v.cards.map((c) => [c.text, c.rows.map((r) => r.text)])) + JSON.stringify(pins.map((l) => l.text));
check(!/\b(OLM|SQD|BQD|RVacs?|Pad-2|F15)\b/.test(txt), "no shorthand on screen");
check(/static fire test on Pad 2|Ship 43/.test(JSON.stringify(live.categories.find((c) => c.id === "static"))) && /Ship 43/.test(JSON.stringify(live.categories.find((c) => c.id === "static"))), "S43 mention in S42's static fire context kept");
// render-check catches each new case
const t1 = clone(live); t1.categories.find((c) => c.id === "pad").history.find((h) => h.url === BF.S.B22pad).card_text = "Booster 22 was lifted to catch height on the launch mount.";
check(RC.check(t1).some((p) => p.type === "render-mismatch"), "render-check flags card vs feed wording mismatch for the same post");
const t2 = clone(live); for (const b of Object.values(t2.flightlog_pins.boxes)) for (const k of b.cards) for (const l of k.lines) if (l.url === BF.S.B22pad) l.time = "19:00"; // 9 Nov re-date: B22 26 Oct is still on its Road card (padTests left the card)
check(RC.check(t2).some((p) => p.type === "render-mismatch" && /time/.test(p.msg)), "render-check flags card vs feed time mismatch");
const t3 = clone(live); t3.categories.find((c) => c.id === "static").history.find((h) => h.milestone && h.url === BF.S.b22sfNSF).card_text = "Booster 22 was lowered onto the OLM.";
check(RC.check(t3).some((p) => p.type === "render-shorthand"), "render-check flags shorthand");
const t4 = clone(live); t4.categories.find((c) => c.id === "cryo").history.forEach((h) => (h.updates || []).forEach((u) => { if (u.url === BF.S.lpB22) u.card_text = "Same overnight test: Booster 22 was filled, held at pressure, then detanked."; }));
check(RC.check(t4).some((p) => p.type === "render-fragment" && /colon/.test(p.msg)), "render-check flags colon-led fragments");
check(card("rtf-cryo-S42").media.image === "images/ship-cryo.jpg" && card("rtf-cryo-S42").media.badge === "LabPadre" && fs.existsSync(path.join(ROOT, "images/s42-cryo-labpadre.jpg")), "S42 cryo: Ship 42 frame, @LabPadre badge, earlier file kept");
const pre = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snapshots/2026-11-01/road.json"), "utf8"));
const pt = (r) => JSON.stringify(r.feed_items.map((f) => [f.id, f.push_text, f.url]).filter((x) => pre.feed_items.some((p) => p.id === x[0])));
check(pt(live) === JSON.stringify(pre.feed_items.map((f) => [f.id, f.push_text, f.url]).filter((x) => live.feed_items.some((p) => p.id === x[0]))), "push wording and links unchanged (nothing re-fires)");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
