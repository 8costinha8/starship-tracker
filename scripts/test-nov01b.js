/* 1 Nov follow-up: Flight 16 vehicles (S43, B23) never sit on Flight 15 sections; S42 cryo card shows its own LabPadre
   media (badged); B22 cryo is ONE test and its drawer says so. No network, no pushes: node scripts/test-nov01b.js */
const fs = require("fs"), path = require("path"), SC = require("./scope.js"), BF = require("./backfill-2026-11-01b.js"), RC = require("./render-check.js"), JR = require("./journey-replay.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), clone = (x) => JSON.parse(JSON.stringify(x));
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const pre = clone(live);
// put the three Flight 16 items back on Flight 15 boxes (as they were before) and a fresh S43 one
const put = { "news-mvrm1w14-668ed2": "pad", "news-mvopynkg-826d56": "cryo", "news-mvuqvczs-7b7a15": "cryo" };
for (const f of pre.feed_items) if (put[f.id]) { f.box = put[f.id]; delete f.later_flight; }
pre.feed_items.push({ id: "t-s44", kind: "news", flight: 15, box: "pad", body: "Ship 43 rolled to Pad 2.", at: "2026-11-01T00:00:00Z" });
const moved = SC.enforce(pre);
check(Object.keys(put).every((id) => { const f = pre.feed_items.find((x) => x.id === id); return !f.box && f.later_flight && f.flight === 16; }), "S43/B23 feed items → Flight 16, off Flight 15 sections");
const t = pre.feed_items.find((x) => x.id === "t-s44"); check(!t.box && t.flight === 16, "a new S43 item filed to a Flight 15 box is moved to Flight 16");
check(!pre.feed_items.some((f) => f.box && f.flight === 15 && SC.vehOf(f.body).some((v) => SC.flightOfVehicle(pre, v) > 15)), "no Flight 16 vehicle left on a Flight 15 section");
const keys = (r) => JSON.stringify(r.feed_items.map((f) => [f.id, f.url, f.push_text, f.body, f.at]));
const orig = clone(live); for (const f of orig.feed_items) if (put[f.id]) { f.box = put[f.id]; delete f.later_flight; } SC.enforce(orig);
check(keys(orig) === keys(live), "ids, links, push wording and times unchanged (nothing re-fires)");
check(SC.enforce(clone(live)).length === 0, "live data clean (idempotent)");
const fbody = (r) => r.feed_items.filter((f) => f.box).map((f) => f.body).join(" ");
check(!/Ship 43|Booster 23/.test(fbody(live)), "live: no S43/B23 feed item on a Flight 15 section");
check(!live.categories.some((c) => (c.history || []).some((h) => /\b(S43|B23)\b/.test(h.hardware || "") && h.flight !== 16)), "live: every S43/B23 history entry is tagged Flight 16");
const src = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
check(/never lands on this flight's sections/.test(src), "check-road: Grok road lines naming only later-flight vehicles are skipped");
// S42 cryo media
const v = RC.view(live), cs = v.cards.find((c) => c.id === "rtf-cryo-S42");
check(cs && cs.media.image === "images/ship-cryo.jpg" && cs.media.badge === "LabPadre", "Cryo · S42 shows the restored ship-cryo.jpg manual pick with the @LabPadre badge (3 Nov)");
check(fs.existsSync(path.join(ROOT, "images", "s42-cryo-labpadre.jpg")) && fs.existsSync(path.join(ROOT, "images", "ship-cryo.jpg")), "new local file saved; old ship-cryo.jpg kept");
check(!!live.categories.find((c) => c.id === "cryo").history.find((h) => h.url === "https://x.com/LabPadre/status/2108486994401825101").media_override.keep_image, "3 Nov: keep_image manual pick");
// B22 cryo = 1 and the drawer agrees
const b = v.cards.find((c) => c.id === "rtf-cryo-B22");
check(JR.replay(live, "B22").state.done.cryo === 1 && live.journeys.B22.done.cryo === 1, "B22 cryo count 1");
check(b.rows.some((r) => r.text === "In the same overnight test, Booster 22 was filled, held at pressure, then detanked.") && !b.rows.some((r) => /^Booster 22 filled and held/.test(r.text)), "drawer: the LabPadre row reads as the same test, not a second one");
check(["https://x.com/LabPadre/status/2098045579234259249", "https://x.com/Blobifie/status/2097943705911193755"].every((u) => b.rows.some((r) => r.url === u)), "both source links kept on the drawer");
check(RC.check(live).length === 0, "render-check clean");
{ const t = clone(live); const u = t.categories.find((c) => c.id === "cryo").history.find((h) => h.milestone && h.milestone.key === "cryo_test|15|B22").updates.find((x) => x.url === "https://x.com/LabPadre/status/2098045579234259249"); u.card_text = "LabPadre confirmed the same overnight test: Booster 22 was filled, held at pressure, then detanked.";
  check(RC.check(t).some((p) => p.type === "render-fragment"), "render-check flags a row left starting with a lowercase verb once the source name is removed"); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
