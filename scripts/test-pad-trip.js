// Pad trips (scripts/move-route.js): a vehicle's trip to the pad, its work there and its return are ONE pad activity.
// Fixture: Ship 43's 26-28 Oct Pad 2 trip (scripts/fixtures/pad-trip-s43.json).   node scripts/test-pad-trip.js
const fs = require("fs"), path = require("path");
const P = require("./move-route.js");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/pad-trip-s43.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const sid = (u) => (String(u || "").match(/status\/(\d+)/) || [])[1];
const cat = (r, id) => r.categories.find((c) => c.id === id);
const T = (x) => Date.parse(x.at);
const before = JSON.stringify(fx);
const r = P.applyToRoad(fx);
check(JSON.stringify(fx) === before, "pure: the input road is not changed");
const trip = cat(r, "pad").history.filter((h) => h.pad_trip);
check(trip.length === 1, "one Pad card for the whole trip (roll out + chopstick lifts + return)");
const t = trip[0] || { updates: [] };
check(t.text === "Ship 43 lifted on the chopsticks at Pad 2." && sid(t.url) === "2114880263264346277", "headline: the chopstick lift at Pad 2 (Blobifie 27 Oct 00:42, its own post)");
check(!("trip_order" in t), "no trip-only order flag: the card's Earlier updates use the one shared order (newest first, app.js earlierNewestFirst; scripts/test-earlier-order.js)");
const ids = t.updates.flatMap((u) => [sid(u.url), ...(u.merged || []).map((m) => sid(m.url))]);
for (const [id, what] of [["2114798577293635905", "26 Oct roll to Pad 2 (NSF)"], ["2114804150693429509", "26 Oct headed to Pad 2 (LabPadre)"], ["2114869747624112210", "27 Oct lifted above the stand (Blobifie)"],
  ["2114875305244369184", "27 Oct airborne on the chopsticks (RGV)"], ["2115280953019080989", "28 Oct headed back (Blobifie)"], ["2115300604247671193", "28 Oct arrived back (RGV)"], ["2115315741709001123", "28 Oct returned to Megabay 2 (TrackingTheSB)"]])
  check(ids.includes(id), `trip keeps ${what}`);
const rolled = t.updates.find((u) => sid(u.url) === "2114798577293635905");
check(rolled && (rolled.merged || []).some((m) => sid(m.url) === "2114804150693429509"), "same move merges: 'headed to Pad 2' (19:39) folds into 'rolled to Pad 2' (19:17)");
const back = t.updates.find((u) => sid(u.url) === "2115300604247671193");
check(back && (back.merged || []).some((m) => sid(m.url) === "2115315741709001123"), "same move merges: 'returned to Megabay 2' (05:32) folds into 'arrived back at the production site' (04:32)");
check(!t.updates.some((u) => sid(u.url) === "2115315741709001123"), "the TrackingTheSB return is not a second row");
check(t.updates.some((u) => sid(u.url) === "2115280953019080989") && t.updates.some((u) => sid(u.url) === "2114824660571537495"), "set-off and arrival stay separate rows (different phase)");
const cryoAll = cat(r, "cryo").history.flatMap((h) => [h, ...(h.updates || [])]);
check(!cryoAll.some((x) => /^2026-10-2[78]/.test(x.at)), "nothing of the 27/28 Oct pad trip stays in Cryo");
check(cat(r, "cryo").history.some((h) => sid(h.url) === "2114757145245671915"), "26 Oct 16:32 'returned to Megabay 2 after cryo testing' (LabPadre) stays in Cryo: before the pad trip (19:17)");
check(!cat(r, "pad").history.some((h) => !h.pad_trip && ["2114798577293635905", "2114880263264346277", "2115315741709001123"].includes(sid(h.url))), "the trip's old Pad entries are folded (no second card)");
// the return filed under Cryo (e.g. by an inherit-latest-test rule) still goes to Pad: a return from the pad is pad activity
const m = clone(fx), padH = cat(m, "pad").history, i = padH.findIndex((h) => sid(h.url) === "2115315741709001123");
cat(m, "cryo").history.push(padH.splice(i, 1)[0]);
const r2 = P.applyToRoad(m), t2 = cat(r2, "pad").history.find((h) => h.pad_trip);
check(t2 && t2.pad_trip.members.includes("f16-s43-2115315741709001123") && !cat(r2, "cryo").history.some((h) => sid(h.url) === "2115315741709001123"), "a return from the pad filed under Cryo moves to the Pad card (never inherits the latest test)");
// idempotent
check(JSON.stringify(P.applyToRoad(r)) === JSON.stringify(r), "idempotent: a folded road folds to itself");
// no pad trip → untouched (a return after cryo testing)
const solo = { categories: [{ id: "cryo", history: [{ id: "x1", hardware: "S50", at: "2026-12-01T10:00:00Z", text: "Ship 50 returned to Megabay 2 after cryo testing.", url: "https://x.com/a/status/1", updates: [{ at: "2026-12-01T08:00:00Z", text: "Ship 50 headed back to the build site.", url: "https://x.com/b/status/2" }] }] }, { id: "pad", history: [] }] };
check(P.applyToRoad(solo) === solo, "a return with no pad trip before it is left alone");
// classify
const K = (t) => { const c = P.tripKind(t); return c.kind + (c.site ? ":" + c.site : ""); };
check(K("Ship 43 rolled to Pad 2 for chopstick tests.") === "to_site:pad" && K("Ship 43 returned to Megabay 2 after cryo testing.") === "from_site" && K("Ship 43 headed back from Massey's.") === "from_site:massey"
  && K("Booster 24 headed to Massey's.") === "to_site:massey" && K("Booster 24 began cryo testing at Massey's.") === "at_site:massey" && K("Booster 23 headed back to Massey's for more cryo testing.") === "to_site:massey"
  && K("Ship 44 followed Booster 24 in the first double roll.") === "move", "classify: to / at / from a test site (pad, Massey's), and a bare move");

// ── Massey's: Booster 24 + Ship 44 (F17, 20–24 Nov), fixture scripts/fixtures/test-trip-b24-s44.json
const fx2 = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/test-trip-b24-s44.json"), "utf8"));
const BOX = { cryo_start: "cryo", cryo_done: "cryo", move: "cryo" }; // as move-route files them today (the inherit rule)
const roadOf = (vs) => ({ trip_feed: fx2.feed_items, categories: [{ id: "cryo", history: [] }, { id: "pad", history: [] }].map((c) => ({ ...c, history: vs.flatMap((v) => fx2.vehicles[v].filter((e) => (BOX[e.type] || "pad") === c.id)
  .map((e) => ({ id: e.id, at: e.at, date: e.date, text: e.text, url: e.url, src: e.src, hardware: v, sources: e.sources, ...(e.type === "cryo_done" ? { complete: true, milestone: { phase: "completed" } } : {}) }))) })) });
// the B24 return filed under Pad (as on the live page before move-route) still folds into the cryo card
const rb = roadOf(["B24", "S44"]); const mv = rb.categories[0].history.findIndex((h) => h.id === "fv-768cebc29b"); rb.categories[1].history.push(rb.categories[0].history.splice(mv, 1)[0]);
const r3 = P.applyToRoad(rb);
const card = (v) => cat(r3, "cryo").history.filter((h) => h.hardware === v && h.test_trip);
const b = card("B24")[0] || { updates: [] }, s4 = card("S44")[0] || { updates: [] };
check(card("B24").length === 1 && card("S44").length === 1, "Massey's: one cryo trip card each for Booster 24 and Ship 44");
check(!cat(r3, "pad").history.some((h) => h.hardware === "B24") && !cat(r3, "cryo").history.some((h) => h.hardware === "B24" && !h.test_trip), "fv-768cebc29b (B24 left Massey's) is not its own card: no other B24 entry is left");
check(b.text === "Booster 24 completed its first round of cryo testing at Massey's." && b.test_trip.box === "cryo", "B24 headline is the test (first round of cryo done, 23 Nov), on Cryo tests");
check(!("trip_order" in b), "B24: no trip-only order flag (Earlier updates shown newest first like every card)");
const bIds = [b, ...b.updates].flatMap((u) => [sid(u.url), ...(u.merged || []).map((m) => sid(m.url)), ...((u.sources || []).map((m) => sid(m.url)))]);
for (const [id, what] of [["2123658897949159619", "20 Nov out (TrackingTheSB)"], ["2123774597967540724", "NSF 20 Nov at Massey's (combined S44 + B24)"], ["2124637434797346916", "NSF cryo start (F17)"], ["2124765411627643131", "RGV first round done"],
  ["2125104765050974276", "RGV leaves the stand"], ["2125115713677594697", "RGV double roll (combined)"], ["2125117229482279118", "efraser77 back to Production (combined)"], ["2125222150252675155", "Blobifie back in Megabay (combined)"]])
  check(bIds.includes(id), `B24 cryo card covers ${what}`);
const left = b.updates.find((u) => sid(u.url) === "2125114870563762434");
check(left && ["2125104765050974276", "2125115713677594697", "2125117229482279118"].every((id) => (left.merged || []).some((m) => sid(m.url) === id)), "same move merges: RGV 'left the stand', the double roll and efraser77 fold into 'left Massey's'");
check(b.updates.length === 4, `B24 rows: out, cryo start, left Massey's, back at the bay (got ${b.updates.length})`);
// 24 Nov v5: the X post ids carry their own post time (snowflake): Blobifie's "left Megabay 1" really was posted at 20:08,
// 14 h after TrackingTheSB had B24 on Highway 4 (06:05) and 6 h after NSF had it at Massey's (13:44): a late report of the
// same outbound move → merged into "headed to Massey's", never a row after it
const snow = (id) => new Date(Number((BigInt(id) >> 22n) + 1288834974657n)).toISOString().slice(0, 19);
check(snow("2123658897949159619") === "2026-11-20T06:05:11" && snow("2123871167119569323") === "2026-11-20T20:08:40" && snow("2123774597967540724") === "2026-11-20T13:44:56", "post times match the X post ids: 06:05 Highway 4, 13:44 at Massey's, 20:08 'left Megabay 1'");
const out = b.updates.find((u) => sid(u.url) === "2123658897949159619");
check(out && (out.merged || []).some((m) => sid(m.url) === "2123871167119569323" && m.late), "late 'left Megabay 1' (20:08) merges into the outbound move 'headed to Massey's' (06:05)");
// a trip never goes backwards: left the bay → road → site → test → return, on every trip card of both fixtures
for (const [nm, cards] of [["S43", cat(r, "pad").history.filter((h) => h.test_trip)], ["B24/S44", cat(r3, "cryo").history.filter((h) => h.test_trip)]])
  for (const c of cards) { const st = c.updates.map((u) => P.stepOf(u)).filter((x) => x != null && x !== 3);
    check(st.every((x, i) => !i || st[i - 1] <= x), `${nm} ${c.hardware || c.test_trip.vehicle}: steps never go backwards (${st.join(" ")})`); }
const sIds = [s4, ...s4.updates].flatMap((u) => [sid(u.url), ...(u.merged || []).map((m) => sid(m.url))]);
check(["2125115713677594697", "2125222150252675155", "2123774597967540724"].every((id) => sIds.includes(id)) && s4.text === "Ship 44 completed cryo testing.", "the combined posts attach to Ship 44's own trip too; S44 leads with its completed cryo test");
check(JSON.stringify(P.applyToRoad(r3)) === JSON.stringify(r3), "idempotent (Massey's trips)");
// a move with no test at the site yet is not folded (no bracket)
const lone = { categories: [{ id: "cryo", history: [{ id: "y1", hardware: "B30", at: "2026-12-01T05:00:00Z", text: "Booster 30 headed back to Massey's for more cryo testing.", url: "https://x.com/a/status/9" }] }, { id: "pad", history: [] }] };
check(P.applyToRoad(lone) === lone, "a move to Massey's with no test yet stays as it is");
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
