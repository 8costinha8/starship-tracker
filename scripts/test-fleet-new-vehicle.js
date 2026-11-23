/* Scenario 2 — a brand-new vehicle (synthetic "B26", no code knows it): first seen with no flight, later assigned from the
   text of a trusted post, then a milestone pushes once. Nothing about B26 / Flight 18 exists in code — only in this fixture. */
const { F, ok, done, appJsText, road0, post, liveReplay } = require("./fleet-test-helpers.js");
(async () => {
  const road = road0(), reg = F.empty(); F.seed(reg, { road, appJsText, now: Date.parse("2026-12-01T00:00Z") });
  ok(!reg.vehicles.B26, "B26 is not in the seeded registry");
  await liveReplay(reg, [post("9100000000000000001", "RGVaerialphotos", "2026-12-02T10:00:00.000Z", "Booster 26's LOX tank section was moved into Megabay 1 this morning.")], road);
  ok(reg.vehicles.B26 && reg.vehicles.B26.flight === null && reg.vehicles.B26.state === "build" && reg.vehicles.B26.first_src && reg.vehicles.B26.events.length === 1, "B26 auto-added from a trusted post: no flight, state build, source kept");
  let g = F.groups(reg, road);
  ok((g.get("unassigned") || []).some((v) => v.id === "B26"), "Future vehicles: B26 under 'No flight yet'");
  // rumour must not assign
  await liveReplay(reg, [post("9100000000000000002", "StarbaseWatcher", "2026-12-03T10:00:00.000Z", "Booster 26 could possibly fly on Flight 18?")], road);
  ok(reg.vehicles.B26.flight === null, "a hedged post ('could possibly … ?') does not assign a flight");
  const r = await liveReplay(reg, [post("9100000000000000003", "NASASpaceflight", "2026-12-05T12:00:00.000Z", "Starship Flight 18: Booster 26 and Ship 46 are the vehicles for this flight.")], road);
  ok(reg.vehicles.B26.flight === 18 && reg.vehicles.S46 && reg.vehicles.S46.flight === 18, "assignment learned from text: B26 + S46 → Flight 18 (S46 auto-added)");
  ok(r.decisions.every((d) => !d.push), "an assignment alone is not a push");
  g = F.groups(reg, road);
  ok(g.get(18) && g.get(18).map((v) => v.id).sort().join() === "B26,S46", "Future vehicles: Flight 18 group = B26, S46");
  const c = await liveReplay(reg, [post("9100000000000000004", "BocaChicaGal", "2026-12-08T22:00:00.000Z", "Booster 26 has started cryo testing at Massey's tonight. Frost line visible.")], road);
  const c2 = await liveReplay(reg, [post("9100000000000000005", "LabPadre", "2026-12-08T22:30:00.000Z", "Booster 26 cryo testing is underway at Massey's.")], road);
  ok(c.sent.length === 1 && c.sent[0].fleet_key === "B26|cryo_start" && c2.sent.length === 0, "B26 cryo start pushes once; a second source 30 min later does not");
  ok(reg.vehicles.B26.state === "cryo" && reg.vehicles.B26.events.find((e) => e.type === "cryo_start").sources.length === 2, "lifecycle build → cryo; second post kept as a source");
  // older vehicle numbers never become "new"
  await liveReplay(reg, [post("9100000000000000006", "RGVaerialphotos", "2026-12-09T10:00:00.000Z", "Booster 21 seen at the rocket garden.")], road);
  ok(reg.vehicles.B21.flight === 14 && !reg.vehicles.B21.events.length, "a flown booster (B21) is never re-added or given events");
  done();
})().catch((e) => { console.log("❌ crashed: " + e.stack); process.exit(1); });
