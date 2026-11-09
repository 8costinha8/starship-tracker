/* 9 Nov follow-up (Tusk): four Flight Log / Road wording fixes in road.json, data only — nothing pushed, no feed item, no
   notification, sent push records untouched. No network: node scripts/test-nov09-followup.js */
const fs = require("fs"), path = require("path"), L = require("./log-text.js"), RC = require("./render-check.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const live = read("road.json"), snap = path.join(ROOT, "data/snapshots/2026-11-09-followup");
const cat = (id) => live.categories.find((c) => c.id === id), entry = (cid, id) => cat(cid).history.find((h) => h.id === id);
const upd = (cid, id, at) => ((entry(cid, id) || {}).updates || []).find((u) => u.at === at) || {};

// (a) the Launch date overview line is short and plain
const dc = cat("date");
check(dc.latest === "Flight 15 NET 13 Nov." && dc.log_latest === "Flight 15 NET 13 Nov." && !L.lintStatusLine(dc.log_latest).length && !L.lintLogText(dc.log_latest).length, "(a) Launch date line: 'Flight 15 NET 13 Nov.' (card + Flight Log), passes both lints");
// (b) the three updates have their own past-tense Flight Log line, same facts as the post's card/feed line
const B = [["raptor", "x-2113834862339617215-pad", "2026-10-25T19:49:01.000Z", "Booster 22 completed a full-duration static fire for Flight 15."],
  ["static", "x-2114686191627030843", "2026-10-26T06:57:53.000Z", "Booster 22 was moved onto its transporter ahead of returning to Megabay 1."],
  ["static", "x-2115701002095755563", "2026-10-29T07:04:29.000Z", "Ship 42 and the tiled barrel section arrived back at the production site."]];
for (const [cid, id, at, want] of B) { const u = upd(cid, id, at), fi = live.feed_items.find((f) => f.url === u.url);
  check(u.log_text === want && !L.lintLogText(want).length && (!fi || fi.body === want), `(b) ${u.date} ${cid} update has log_text "${want}" (matches its feed line)`); }
// (c) the 14 Oct line says only what was announced then, card and Flight Log consistent
const d14 = dc.history.find((h) => h.date === "14 Oct"), pin14 = live.flightlog_pins.boxes.date.cards.flatMap((k) => k.lines).find((l) => l.day === "14 Oct");
check(d14.card_text === d14.log_text && d14.card_text === "Flight 15 was targeting NET 8 November, with plans to catch both vehicles." && pin14.text === "Reports said Flight 15 was targeting NET 8 November.", "(c) 14 Oct: card_text = log_text, Flight Log pin without '(since moved…)'");
check(!/since moved/.test(JSON.stringify(live.categories) + JSON.stringify(live.flightlog_pins)), "(c) no 'since moved' left on any card or Flight Log line");
// (d) the 2 Nov launch mount line
const p2 = entry("pad", "x-2117381830253101176");
check(p2.card_text === "Pad 2 launch mount painted dark grey." && p2.log_text === p2.card_text && !/OLM/.test(p2.card_text + p2.log_text), "(d) 2 Nov: 'Pad 2 launch mount painted dark grey.' (card + Flight Log)");
// data only: nothing pushed or queued, sent push records untouched
const before = JSON.parse(fs.readFileSync(path.join(snap, "road.json"), "utf8"));
check(JSON.stringify(live.feed_items) === JSON.stringify(before.feed_items), "no feed item added or changed");
check(fs.readFileSync(path.join(snap, "notifications.json"), "utf8") === fs.readFileSync(path.join(ROOT, "notifications.json"), "utf8"), "notifications.json unchanged");
const pushes = (r) => JSON.stringify(r.categories.map((c) => c.history.map((h) => [h.id, h.push || null, h.push_text || null, h.pushed || null])));
check(pushes(live) === pushes(before), "sent push records (push, push_text, pushed) untouched");
check(JSON.stringify(live.milestones) === JSON.stringify(before.milestones) && JSON.stringify(live.predicted || null) === JSON.stringify(before.predicted || null), "milestones and predicted date unchanged");
check(RC.check(live).length === 0, "render-check clean");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
