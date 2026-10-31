/* Offline: vehicle journey memory (scripts/journey.js + data/phrases.json) and its X-first wiring. No network, nothing sent.
   node scripts/test-journey.js */
const J = require("./journey.js"), xf = require("./x-first.js"), fs = require("fs"), path = require("path");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const road = (extra = {}) => ({ flight: 15, vehicles: ["B22", "S42"], hardware_flights: { B22: 15, S42: 15, B23: 16, S43: 16 }, categories: [
  { id: "cryo", name: "Cryo tests", history: [] }, { id: "raptor", name: "Raptor", history: [] }, { id: "static", name: "Static fires", history: [] }, { id: "pad", name: "Pad", history: [] },
  { id: "faa", history: [] }, { id: "date", history: [] }], ...extra });
const run = (v, posts, st = J.blank()) => posts.map(([text, at, id]) => { const r = J.step(st, text, { v, at, id, road: road() }); st = r.state; return r; });

// phrases come from the data file
check(Array.isArray(J.PHRASES.frost) && J.PHRASES.frost.includes("frost") && J.PHRASES.locations["Massey's"], "data/phrases.json: per-milestone phrase lists (rollout, stand, frost, done …) loaded");
// 1. state saved per vehicle (one engine for S42 and B22)
const rd = road(); rd.journeys = {};
rd.journeys.S42 = J.blank(); rd.journeys.B22 = J.blank();
J.observe(rd, "S42 leaves Megabay 2 for Massey's", "S42", { at: "2026-09-02T05:00:00Z", id: "m1" });
J.observe(rd, "Booster 22 moved to Massey's", "B22", { at: "2026-09-08T11:00:00Z", id: "b1" });
check(rd.journeys.S42.location === "Massey's" && rd.journeys.S42.next_test === "cryo" && rd.journeys.S42.open_test === null, "S42 state: location Massey's, no open test, likely next test cryo");
check(rd.journeys.B22.location === "Massey's" && rd.journeys.B22.pending.includes("b1"), "B22 state kept separately by the same engine");
// 2. routing
let rs = run("S42", [["S42 leaves Megabay 2 for Massey's", "2026-09-02T05:00:00Z", "m1"], ["Ship 42 lifted onto the cryo stand", "2026-09-03T03:00:00Z", "m2"]]);
check(rs[0].card === "pad" && rs[0].likely, "ambiguous move → that vehicle's Pad card, marked likely");
check(rs[1].card === "cryo" && rs[1].moveToTest && rs[1].moveToTest.ids.includes("m1") && rs[1].moveToTest.to === "cryo", "test evidenced → the likely move line moves into the Cryo card");
rs = run("B22", [["Booster 22 rolled out to Pad 2", "2026-10-24T05:00:00Z", "r1"], ["Booster 22 completed its static fire on Pad 2", "2026-10-25T19:00:00Z", "r2"], ["Booster 22 returned to Megabay 1", "2026-10-26T09:00:00Z", "r3"]]);
check(rs[0].card === "pad" && rs[0].likely && rs[1].card === "static" && rs[1].moveToTest.ids.includes("r1"), "booster: rollout → Pad (likely) → static fire evidenced → moved to Static fires");
check(rs[2].card === "static", "'returned to Megabay' just after a static fire → Static fires card");
rs = run("S42", [["Ship 42 completed a cryo test", "2026-09-04T05:00:00Z"], ["Ship 42 returned to Megabay 2", "2026-09-06T05:00:00Z"]]);
check(rs[1].card === "cryo", "'returned to Megabay' just after cryo → Cryo card");
rs = run("S42", [["Ship 42 lifted onto the cryo stand", "2026-10-09T03:00:00Z"], ["Ship 42 lifted onto the stand again", "2026-10-09T04:00:00Z"]]);
check(rs[1].card === "cryo", "'lifted onto stand' during an open cryo test → Cryo card");
rs = run("S42", [["Ship 42 returned to Megabay 2", "2026-12-01T05:00:00Z"]]);
check(rs[0].card === "pad" && !rs[0].likely, "'returned to Megabay' with no open or recent test → Pad card");
rs = run("S42", [["Ship 42 completed a cryo test", "2026-09-04T05:00:00Z"], ["Ship 42 returned to Megabay 2", "2026-09-20T05:00:00Z"]]);
check(rs[1].card === "pad", "a test finished long ago is not 'just finished' → Pad card");
rs = run("S42", [["Ship 42 returned to Megabay 2 after static fire", "2026-10-29T05:00:00Z"]]);
check(rs[0].card === "static" && rs[0].state.open_test === null, "'returned … after static fire' → Static fires, closes the test");
// 3. plain-meaning rewrite + confirmation of the same line
rs = run("S42", [["Ship 42 completed a cryo test", "2026-09-04T05:00:00Z"], ["Ship 42 lifted onto the cryo stand again", "2026-10-09T03:00:00Z"], ["Frost on both of Ship 42's tanks", "2026-10-09T20:00:00Z", "f1"], ["Ship 42 completed another cryo test", "2026-10-10T08:00:00Z", "c1"]]);
check(rs[2].card === "cryo" && rs[2].likely && rs[2].text === "Frost on both tanks: Ship 42 likely in another cryo test.", `frost → '${rs[2].text}' (likely)`);
check(rs[3].confirms === "f1" && rs[3].text === "Ship 42 completed another cryo test.", "confirming post → same line becomes 'Ship 42 completed another cryo test.'");
const r3 = road(); r3.categories[0].history.push({ id: "f1", text: "Frost on both tanks: Ship 42 likely in another cryo test.", url: "https://x.com/a/status/1", likely: true, hardware: "S42" });
J.confirmLine(r3, "f1", "Ship 42 completed another cryo test.", "https://x.com/b/status/2", "@b");
const l3 = r3.categories[0].history; check(l3.length === 1 && l3[0].text === "Ship 42 completed another cryo test." && l3[0].url === "https://x.com/b/status/2" && !l3[0].likely, "confirmLine: one line, new text, link swapped to the confirming post");
check(!rs.some((r) => r.text && /likely\b[^.]*\bcomplet/i.test(r.text)), "no hedged 'completed' wording for anything unconfirmed");
// 4. frost contexts
const st = (o) => ({ ...J.blank(), ...o });
const f = (s0, text = "Frost on Ship 42's LOX tank") => J.step(s0, text, { v: /Booster|B22/.test(text) ? "B22" : "S42", at: "2026-10-30T10:00:00Z", road: road() });
check(f(st({ location: "Massey's" })).card === "cryo", "frost at Massey's → cryo");
check(f(st({ location: "cryo stand" })).card === "cryo", "frost on the cryo/test stand → cryo");
let r = f(st({ location: "pad", stacked: true, engines: true }));
check(r.card === "pad" && r.card !== "cryo" && /launch rehearsal/.test(r.text), "frost while stacked on the pad → Pad card (WDR), never cryo");
check(f(st({ location: "pad" }), "Frost on the stack during the wet dress rehearsal, Ship 42").card === "pad", "WDR / rehearsal wording → Pad card");
r = f(st({ location: "static fire stand", engines: true, done: { cryo: 2, static: 0 } }));
check(r.card === "static" && /static fire/.test(r.text), "frost on a static fire stand with engines fitted → static fire prep");
check(f(st({ location: "Massey's", engines: false }), "Frost on Ship 42 at Massey's").card === "cryo", "Massey's without engines → cryo");
// regression from git history: b675c0b removed x-2114339995121332263 — @Blobifie 25 Oct 2026 "Frost is forming on B22's lox tank!"
// filed as a Cryo card ("Booster 22 undergoing cryo tests at the launch site") while B22 sat on the Pad 2 launch mount for its static fire
const b22 = run("B22", [["Booster 22's Raptors were all in before its rollout.", "2026-10-24T04:00:00Z"], ["Booster 22 rolled out to Pad 2", "2026-10-24T05:00:00Z", "r1"], ["Booster 22 is being lifted onto Pad 2 OLM", "2026-10-24T09:00:00Z", "r2"],
  ["Frost is forming on B22's lox tank! https://t.co/PgOnR4GXa9", "2026-10-25T12:55:12Z", "x-2114339995121332263"]]);
check(b22[3].card === "static" && b22[3].card !== "cryo", "regression b675c0b: B22 frost on the launch mount (engines in) → Static fires, not Cryo");
check(b22[3].moveToTest && b22[3].moveToTest.ids.includes("r1"), "… and the likely Pad rollout lines move into Static fires");
// 5. strict vehicle match
check(J.step(J.blank(), "Booster 23 returned to Megabay 1", { v: "S42", road: road() }).card === null, "B23 news never on Ship 42's card");
check(J.step(J.blank(), "Booster 22 returned to Megabay 1", { v: "S42", road: road() }).card === null, "booster news never on the ship card");
check(J.step(J.blank(), "Ship 42 left Megabay 2", { v: "B22", road: road() }).card === null, "ship news never on the booster card");
check(J.clauseFor("Ship 42 headed back for its six Raptors; Booster 22 returned to Megabay 1 for its engines.", "B22") === "Booster 22 returned to Megabay 1 for its engines.", "mixed post: only the vehicle's own clause is routed");
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const replay = require("./journey-replay.js");
const s42c = replay.card(live, "cryo", "S42");
check(!s42c.earlier.some((t) => /Booster 23 returned to Megabay 1|Booster 23 has returned/.test(t)), "road.json: no 'Booster 23 returned to Megabay 1' in Ship 42's Cryo Earlier updates");
check(live.journeys && live.journeys.S42 && live.journeys.B22 && "location" in live.journeys.S42 && "open_test" in live.journeys.B22 && "next_test" in live.journeys.S42, "road.json: per-vehicle journey state saved (location, open test, next test)");
const rows = (v) => replay.replay(live, v).rows;
check(rows("S42").every((l) => !l.to || !J.vehOf(l.text).length || J.vehOf(J.clauseFor(l.text, "S42")).includes("S42")), "replay: every S42 line names Ship 42 (or no vehicle)");
check(rows("B22").every((l) => l.to !== null || J.vehOf(l.text).length), "replay: B22 lines all routed");
// 6. X-first wiring: journey state decides the card; strict match skips other-vehicle posts
const g = road(); g.journeys = { S42: { ...J.blank(), location: "Massey's", open_test: null } };
const post = (text) => ({ post_id: "9", text, created_at: "2026-10-30T10:00:00Z", author: { username: "Blobifie" }, url: "https://x.com/Blobifie/status/9" });
let gv = xf.guardPost(g, post("Frost on both of Ship 42's tanks"), { kind: "road", stage: "static", hardware: "S42", event: "static_fire", phase: "progress", status: "progress", text: "Frost on Ship 42" });
check(gv.v && gv.v.stage === "cryo" && /likely in a cryo test/.test(gv.v.text) && gv.v.journey_likely, "X-first: frost at Massey's (journey state) → Cryo, rewritten + likely");
const g2 = road(); g2.journeys = { S42: { ...J.blank(), location: "pad", stacked: true, engines: true } };
gv = xf.guardPost(g2, post("Frost on Ship 42 on the stack"), { kind: "road", stage: "cryo", hardware: "S42", event: "cryo_test", phase: "progress", status: "progress", text: "Frost on Ship 42" });
check(gv.v && gv.v.stage === "pad" && gv.v.event !== "cryo_test", "X-first: frost while stacked → Pad, never cryo");
gv = xf.guardPost(g, post("Booster 22 returned to Megabay 1"), { kind: "road", stage: "cryo", hardware: "S42", event: null, phase: "progress", status: "progress", text: "x" });
check(!!gv.skip, "X-first: a booster post tagged to the ship is skipped (strict match)");
gv = xf.guardPost(road(), post("Frost on Ship 42"), { kind: "road", stage: "cryo", hardware: "S42", event: "cryo_test", phase: "progress", status: "progress", text: "x" });
check(gv.v && gv.v.stage === "cryo" && !gv.v.journey, "X-first: no saved journey → old guards only (unchanged behaviour)");
console.log(fails ? `\n❌ ${fails} check(s) failed` : "\nAll journey checks passed."); process.exit(fails ? 1 : 0);
