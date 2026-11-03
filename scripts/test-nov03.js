/* 3 Nov: (4) Ship 42 cryo card = restored images/ship-cryo.jpg manual pick (@LabPadre post), locked against every auto picker;
   (5) only the latest estimate is kept on any card. No network, no pushes: node scripts/test-nov03.js */
const fs = require("fs"), path = require("path"), RP = require("./road-pick.js"), MW = require("./media-watch.js"), CL = require("./cleanup.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const media = JSON.parse(fs.readFileSync(path.join(ROOT, "road-media.json"), "utf8"));
const LP = "https://x.com/LabPadre/status/2108486994401825101";
const s42 = live.categories.find((c) => c.id === "cryo").history.find((h) => h.url === LP);
check(s42 && s42.media_override.image === "images/ship-cryo.jpg" && s42.media_override.post_url === LP && s42.media_override.author === "LabPadre" && s42.media_override.keep_image && s42.media_locked, "S42 cryo: ship-cryo.jpg, links to and credits the @LabPadre post, keep_image + media_locked");
check(fs.existsSync(path.join(ROOT, "images/ship-cryo.jpg")), "images/ship-cryo.jpg exists");
const pk = media.picks.find((p) => p.post_id === "2108486994401825101");
check(pk && pk.image === "images/ship-cryo.jpg" && pk.keep_image === true, "road-media.json pick is the manual keep_image pick");
check(MW.lockedReason(s42, "cryo", new Set()) === "keep_image", "media-watch skips the card (keep_image lock)");
const spacex = { url: "https://x.com/SpaceX/status/1", at: s42.at, text: s42.text, x_post: { url: "https://x.com/SpaceX/status/1", author: { username: "SpaceX" }, media: [{ type: "photo", url: "https://pbs.twimg.com/media/new.jpg", width: 4000 }] } };
check(RP.cardPicture([s42, spacex], { cid: "cryo", done: s42 }).image === "images/ship-cryo.jpg", "road-pick: even a SpaceX 4K photo of the same event never beats the manual pick");
check(/h\.media_override && h\.media_override\.keep_image\)\) break/.test(fs.readFileSync(path.join(__dirname, "media-cascade.js"), "utf8")), "media-cascade stops at a keep_image card");
// (5) latest estimate only
const card = { id: "t", updates: [
  { date: "30 Sep", at: "2026-09-30T10:00:00Z", text: "Booster 22 could be ready for a static fire within two weeks.", phase: "expected" },
  { date: "9 Oct", at: "2026-10-09T10:00:00Z", text: "Booster 22 could be ready earlier, as early as next week.", phase: "expected" },
  { date: "17 Oct", at: "2026-10-17T10:00:00Z", text: "Booster 22 was waiting to roll out.", phase: "progress" },
  { date: "25 Oct", at: "2026-10-25T10:00:00Z", text: "Booster 22 completed its static fire.", phase: "completed" }] };
const road = { categories: [{ id: "static", history: [card] }] };
const gone = CL.latestEstimateOnly(road);
check(gone.length === 1 && card.updates.length === 3 && !card.updates.some((u) => u.date === "30 Sep") && card.updates.some((u) => u.date === "9 Oct"), "newer estimate replaces the older one (removed, not kept in Earlier updates)");
check(CL.latestEstimateOnly(road).length === 0, "idempotent");
const own = { id: "o", at: "2026-10-20T00:00:00Z", text: "Ship 42 could be ready for flight NET November.", updates: [{ at: "2026-10-01T00:00:00Z", text: "Ship 42 could be flight-ready by the end of October." }] };
CL.latestEstimateOnly({ categories: [{ id: "x", history: [own] }] });
check(own.updates.length === 0, "a card's own newer estimate replaces an older update estimate");
check(CL.latestEstimateOnly(JSON.parse(JSON.stringify(live))).length === 0, "live road.json already follows the rule");
check(/latestEstimateOnly\(road\)/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")) && /latestEstimateUpdates\(h\)/.test(fs.readFileSync(path.join(ROOT, "app.js"), "utf8")), "applied by the pipeline before save and by the Road page");
// B22 static fire page polish
const b22 = live.categories.find((c) => c.id === "static").history.find((h) => h.id === "x-2111327584122437857");
const texts = [b22.card_text, b22.status_line, ...b22.updates.map((u) => u.card_text || u.text)];
check(b22.updates.length === 2 && live.feed_items.filter((f) => f.card_hide).length === 3 && !texts.some((t) => /\b(is|are) waiting\b|\bdone\.$|\breleased\b|Test flight mission|\bOLM\b/.test(t)), "B22 static fire: no duplicates, past tense, no shorthand");
{ const RC = require("./render-check.js"), rows = RC.view(live).cards.find((c) => c.id === "rtf-static-B22").rows.map((x) => x.text);
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  check(new Set(rows.map(norm)).size === rows.length && !rows.some((t) => /completed a full-duration/.test(t)) && rows.every((t) => /^[A-Z].*\.$/.test(t)), "B22 static fire page: no duplicate rows, no repeat of the main completion line, full sentences"); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
