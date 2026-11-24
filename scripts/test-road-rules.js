/* Offline: Road consistency rules (tracker-2026-11-24-road-list-consistency, Tusk sweep #1–#7 + Bernardo's STICKY COMPLETE),
   general for every flight: pure rules in scripts/road-rules.js, the app's Page 2 pipeline on frozen 24 Nov data
   (fixtures/road-rules/*.json) and on synthetic flights. Nothing written. node scripts/test-road-rules.js */
const fs = require("fs"), path = require("path");
const R = require("./road-rules.js"), MR = require("./move-route.js"), F = require("./fleet.js");
globalThis.RoadPick = require("./road-pick.js"); globalThis.RoadRules = R; globalThis.RoadMoveRoute = MR; globalThis.PhotoGate = require("./photo-gate.js");
const { appFns } = require("./app-fns-test-helper.js");
const ROOT = path.join(__dirname, ".."), FX = path.join(ROOT, "fixtures", "road-rules");
let fails = 0; const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const road0 = JSON.parse(fs.readFileSync(path.join(FX, "road-2026-11-24.json"), "utf8"));
const reg0 = JSON.parse(fs.readFileSync(path.join(FX, "vehicles-2026-11-24.json"), "utf8"));
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

// #1 unverified / single-source never leads; arrivals are never completions; category summary on the row
ok(!R.headlineEligible({ text: "Booster 23 arrived at Massey's.", unverified: true }) && !R.headlineEligible({ text: "x", note: "single source" }) && R.headlineEligible({ text: "Ship 44 completed cryo testing." }), "#1 unverified / single-source updates are not headline-eligible");
{ const u = { text: "Booster 23 arrived at Massey's.", phase: "completed" }; ok(R.fixMovePhase(u) && u.phase === "progress", "#1 an arrival tagged 'completed' is re-tagged (never a completion)");
  const d = { text: "Ship 44 completed cryo testing.", phase: "completed" }; ok(!R.fixMovePhase(d) && d.phase === "completed", "#1 a real completion keeps its phase"); }
ok(/const catLatest = \(m\) =>[\s\S]{0,300}latest[\s\S]{0,200}const boxLine = \(m\) => catLatest\(m\) \|\|/.test(app), "#1 the Page 1 row summary reads the category summary first (boxLine → catLatest)");
ok(/\(globalThis\.RoadRules \|\| null\)\.headlineEligible\(u\)/.test(app), "#1 rtfCards: only headline-eligible newer rows may lead a card");
// STICKY COMPLETE
for (const n of [16, 17, 23]) { const prev = { flight: n, categories: [{ id: "cryo", status: "done", latest: "Both vehicles done." }, { id: "pad", status: "progress" }] };
  const next = { flight: n, categories: [{ id: "cryo", status: "progress", latest: "Nothing reported yet" }, { id: "pad", status: "none" }] }; const k = R.stickyRoad(prev, next);
  ok(next.categories[0].status === "done" && next.categories[0].latest === "Both vehicles done." && k.length === 1 && next.categories[1].status === "none", `STICKY (Flight ${n}): Complete cryo stays Complete after a later run says progress; a non-complete box is not frozen`); }
ok(R.mergeStatus("done", "progress", "cryo") === "done" && R.mergeStatus("done", "none", "static") === "done", "STICKY display: a Complete test box is never shown lower");
ok(/RRm\.stickyRoad\(prevRoad, road\)/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")), "STICKY: the checker applies it before writing road.json");
// #2 rows link to the post that states the text; photo dated by its own post; grouping window
ok(/url: h\.url \|\| urlOf\(h\)/.test(app) && /url: main\.url \|\| urlOf\(main\)/.test(app), "#2 history rows link to the post that states the text (h.url first, not the photo's post)");
ok(R.photoIso("https://x.com/Blobifie/status/2124973115566633088").startsWith("2026-11-23T21:0"), "#2 a photo is dated by its own post (snowflake: Blobifie grab = 23 Nov 21:0x UTC)");
{ const S44 = reg0.vehicles.S44.events, cs = S44.find((e) => e.type === "cryo_start");
  ok(!R.photoFits(cs, S44, cs.x_post && cs.x_post.url), "#2 S44 cryo_start (20 Nov): the 23 Nov grab is outside the window / after cryo_done → not its photo");
  const mv = S44.find((e) => e.id === "fv-28207b57d7"); ok(R.photoFits(mv, S44, mv.x_post.url), "#2 an in-window photo of the same event is kept"); }
ok(/\(globalThis\.RoadRules \|\| null\)\.photoFits\(e, v\.events, e\.x_post\.url\)/.test(app) && /PHOTO_WIN \|\| pt < et - RRf\.PHOTO_LEAD/.test(fs.readFileSync(path.join(__dirname, "fleet.js"), "utf8")), "#2 the app and the registry both apply the grouping window (36 h / 12 h, before the next milestone)");
// #3 direction
ok(R.direction("Booster 24 left the cryo station and moved to the Massey's exit.").dir === "from" && R.direction("Booster 24 headed to Massey's.").dir === "to", "#3 the parser reads direction ('… to the Massey's exit' = leaving)");
ok(R.directionFlip("Booster 24 left the cryo station and moved to the Massey's exit.", "Booster 24 headed to Massey's.") && !R.directionFlip("Ship 44 rolled to Massey's for cryo.", "Ship 44 headed to Massey's."), "#3 a rewrite that flips direction is detected; a faithful one is not");
{ const reg = { version: 1, vehicles: { B24: { id: "B24", type: "booster", name: "Booster 24", state: "cryo", flight: 17, flight_history: [], events: [] } }, pads: {}, pushed: {} };
  F.ingest(reg, [{ post_id: "2125104765050974276", url: "https://x.com/RGVaerialphotos/status/2125104765050974276", text: "Booster 24 left the cryo station and moved to the Massey's exit.", created_at: "2026-11-24T05:50:33.000Z", author: { username: "RGVaerialphotos" }, media: [] }], { road: { flight: 16 }, now: Date.parse("2026-11-24T06:00:00Z") });
  ok(reg.vehicles.B24.events.length === 1 && reg.vehicles.B24.events[0].text === "Booster 24 left Massey's.", `#3 registry: the B24 24 Nov 05:50 post becomes "Booster 24 left Massey's." (was "headed to Massey's") — got ${JSON.stringify(reg.vehicles.B24.events.map((e) => e.text))}`); }
ok(/directionFlip\(s, textFor/.test(fs.readFileSync(path.join(__dirname, "fleet.js"), "utf8")) && /type: "move_direction"/.test(fs.readFileSync(path.join(__dirname, "fleet.js"), "utf8")), "#3 a flipped rewrite is held (not published) and queued as move_direction for needs-review");
// #4 registry path: a reasonless move inherits the latest test; F17 Pad shows no cryo trips; #5 one status mapping
const checks = appFns(["upcomingFlight", "rtfRows", "roadForFlight", "fleetRoad", "peekCatItems", "rtfCards", "decorateFlogItem", "urlOf"], (A) => {
  const out = [], o = (c, m) => out.push([c, m]);
  const up = A.upcomingFlight(clone(road0), 17, clone(reg0));
  const byBox = (id) => up.posts.filter((p) => p.cat && p.cat.id === id);
  o(byBox("pad").length === 0, `#4 F17 (registry path): no Pad activity cards for cryo trips (got ${byBox("pad").map((p) => p.h.text).join(" | ") || "none"})`);
  o(byBox("cryo").length === 2 && byBox("cryo").every((p) => p.done), `#4 F17: S44 and B24 cryo trips file under Cryo tests, both Complete (${byBox("cryo").map((p) => p.h.text).join(" | ")})`);
  const it = A.peekCatItems(up.road); const pad = (it || []).find((m) => m.id === "pad");
  o(!pad || pad.status === "none" || pad.status === "pending", `#4 F17 Pad dot is not half-filled (status ${pad && pad.status})`);
  // every card: rows strictly time-ordered, no two rows with the same action within 2 h
  for (const n of [16, 17]) { const ps = n === 16 ? A.rtfRows(clone(road0)).rows.filter((r) => r.post && r.post.flight === 16).map((r) => r.post) : up.posts;
    for (const p of ps) { const rows = (p.h.updates || []); const t = rows.map((u) => Date.parse(u.at || "") || 0);
      o(t.every((x, i) => i === 0 || t[i - 1] >= x), `#6 F${n} ${p.cat.id}/${p.h.id}: Earlier updates in strict time order`);
      const keys = rows.map((u) => [R.actionKey(u.card_text || u.text), Date.parse(u.at || "") || 0]).filter((k) => k[0]);
      const pend = [...R.PENDING].some((id) => JSON.stringify(p.h).includes(id.split("-").pop())); // S43 Pad card: left as is pending Bernardo
      o(pend || !keys.some((a, i) => keys.some((b, j) => j > i && a[0] === b[0] && Math.abs(a[1] - b[1]) <= R.MERGE_MS)), `#6 F${n} ${p.cat.id}/${p.h.id}: no same-action rows within 2 h${pend ? " (S43 Pad card pending Bernardo: not merged)" : ""}`);
      o(rows.every((u) => !u.url || !u.photo_url_only), `#2 F${n} ${p.cat.id}: rows carry their text's post`); } }
  // #1 F16 B23 cryo headline is the verified one, not the unverified arrival
  const f16 = A.rtfRows(clone(road0)).rows.filter((r) => r.post && r.post.flight === 16).map((r) => r.post);
  const b23 = f16.find((p) => p.cat.id === "cryo" && /Booster 23/.test(p.cat.name));
  o(b23 && !/arrived at Massey/.test(b23.h.text) && b23.done, `#1 F16 B23 cryo headline is verified and the card stays Complete ("${b23 && b23.h.text}")`);
  // Decided (Bernardo via Tusk, 24 Nov 13:11, was PENDING): the S43 Pad trip is ONE Pad card led by the chopstick lift; the
  // 28 Oct Megabay 2 return (f16-s43-2115315741709001123) stays on that card (merged into the return row), never on Cryo
  const s43pad = f16.find((p) => p.cat.id === "pad" && /Ship 43/.test(p.cat.name));
  const onCard = (id) => s43pad && [s43pad.h, ...(s43pad.h.updates || [])].some((u) => (u.url || "").includes(id) || (u.merged || []).some((m) => (m.url || "").includes(id)));
  o(s43pad && /lifted on the chopsticks at Pad 2/.test(s43pad.h.text) && onCard("2115315741709001123") && !f16.some((p) => p.cat.id === "cryo" && JSON.stringify(p.h).includes("2115315741709001123")), "f16-s43-2115315741709001123 stays on the F16 Pad card (one pad trip, led by the chopstick lift), not on Cryo");
  // #5 one mapping: Pad progress in data is In progress on the hero, not "Not yet"
  const m = A.decorateFlogItem({ id: "pad", status: "progress" }, { status: "none", statusText: "Not yet", cards: [] }, clone(road0));
  o(m.status === "progress" && m.flog.statusText === "In progress", `#5 hero Pad: data 'progress' + Flight Log 'none' → In progress (got ${m.status} / ${m.flog && m.flog.statusText})`);
  const c = A.decorateFlogItem({ id: "cryo", status: "done" }, { status: "progress", statusText: "In progress", cards: [] }, clone(road0));
  o(c.status === "done" && c.flog.statusText === "Complete", "#5 + STICKY: a Complete box is never shown lower than Complete");
  // #7 B24 photo: the gated livestream grab is never drawn
  const b24 = up.posts.find((p) => /Booster 24/.test(p.cat.name));
  o(b24 && !JSON.stringify(b24.h.media_override || {}).includes("HX3sqLlaUAAWG6V"), `#7 F17 B24: the NSF four-panel grab is not the card photo (shown: ${b24 && b24.h.media_override ? b24.h.media_override.image : "placeholder"})`);
  return out;
});
for (const [c, m] of checks) ok(c, m);
// #6 merge rule (synthetic, every flight)
{ const rows = [{ text: "Ship 43's first cryo proof test was under way.", at: "2026-10-23T20:51:00Z", url: "u1" }, { text: "Ship 43 began its first cryo proof test.", at: "2026-10-23T21:17:00Z", url: "u2" },
  { text: "Booster 23 was placed on the cryo stand again.", at: "2026-10-28T02:01:00Z", url: "u3" }, { text: "Booster 23 was lifted onto the booster cryo stand.", at: "2026-10-28T02:15:00Z", url: "u4" },
  { text: "Booster 23 entered Highway 4 for Massey's.", at: "2026-10-13T05:00:00Z", url: "u5" }, { text: "Booster 23 rolled out to Massey's for cryo testing.", at: "2026-10-13T06:00:00Z", url: "u6" }, { text: "Booster 23 moved to Massey's.", at: "2026-10-14T09:00:00Z", url: "u7" },
  { text: "Booster 23 left Massey's.", at: "2026-10-18T09:00:00Z", url: "u8" }, { text: "Booster 23 headed back to Massey's.", at: "2026-10-19T09:00:00Z", url: "u9" }];
  const r = R.mergeRows(rows), urls = r.rows.map((u) => u.url);
  ok(urls.includes("u1") && !urls.includes("u2") && urls.includes("u3") && !urls.includes("u4"), "#6 began/under way and placed/lifted onto the stand within 2 h merge (earliest kept)");
  ok(urls.includes("u5") && !urls.includes("u6") && !urls.includes("u7"), "#6 the same move to the same place within 3 days is one row (Highway 4 / rolled out / moved to Massey's)");
  ok(urls.includes("u8") && urls.includes("u9"), "#6 a real second trip (left, then headed back) is kept");
  ok(r.rows.every((u, i, a) => i === 0 || Date.parse(a[i - 1].at) >= Date.parse(u.at)), "#6 rows come out newest first in strict time order");
  const p = R.mergeRows([{ id: "f16-s43-2115315741709001123", text: "Ship 43 returned to Megabay 2.", at: "2026-10-28T05:32:28Z" }, { text: "Ship 43 returned to Megabay 2 after cryo testing.", at: "2026-10-26T16:32:00Z" }]);
  ok(p.rows.length === 2, "PENDING entry is never merged away by the row merge"); }
// 24 Nov 13:11: a trip to the pad and back is Pad activity; the inherit rule is only for moves not to/from a pad (both paths use move-route)
{ const ev = [{ id: "c1", type: "cryo_done", at: "2026-10-20T10:00:00Z", text: "Ship 43 completed cryo testing." }, { id: "m1", type: "move", at: "2026-10-21T10:00:00Z", text: "Ship 43 rolled to Pad 2." },
    { id: "m2", type: "move", at: "2026-10-22T10:00:00Z", text: "Ship 43 returned to Megabay 2." }, { id: "m3", type: "move", at: "2026-10-23T10:00:00Z", text: "Ship 43 headed to Massey's." }, { id: "m4", type: "move", at: "2026-10-24T10:00:00Z", text: "Ship 43 left Pad 1." }];
  const r = MR.routeEvents(ev); ok(r.m1.box === "pad" && r.m2.box === "pad" && r.m3.box === "cryo" && r.m4.box === "pad", `pad trip and back → Pad (to pad: ${r.m1.box}, unnamed return: ${r.m2.box}); next non-pad move inherits the test (${r.m3.box}); a named return from a pad → Pad (${r.m4.box})`);
  ok(/MR\.routeEvents\(\(v\.events/.test(app), "the F17 fleet-registry path routes moves through the same move-route rules"); }
// move-route: S43 28 Oct stays Pad; F17 trips → Cryo (same rule both paths)
{ const evs = [{ id: "c1", type: "cryo_start", at: "2026-11-20T21:40:00Z", text: "Ship 44 began cryo testing" }, { id: "c2", type: "cryo_done", at: "2026-11-21T10:00:00Z", text: "Ship 44 completed cryo testing." }, { id: "m1", type: "move", at: "2026-11-24T06:40:00Z", text: "Ship 44 left Massey's." }];
  ok(MR.routeEvents(evs).m1.box === "cryo", "#4 move-route: a reasonless move 3 days after cryo inherits Cryo"); }
// layout (24 Nov batch): one-line Road summary clamp, equal row heights; About panel safe-area header
ok(/section\.road \.callout-latest \{[^}]*min-width: 0;[^}]*white-space: nowrap;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/.test(app), "Road row summary: one line, ellipsis, min-width 0 (every row the same height)");
ok(/\.about\{padding-top:calc\(env\(safe-area-inset-top,0px\)\+12px\);?\}/.test(app.replace(/\s+/g, "")) && /className="about-head"><h2>About<\/h2><button type="button" className="v-close"/.test(app), "About: top padding = safe-area inset + 12px; title and ✕ share one header row");
console.log(fails ? `\n❌ ${fails} failed` : "\nAll road-rules checks passed."); process.exit(fails ? 1 : 0);
