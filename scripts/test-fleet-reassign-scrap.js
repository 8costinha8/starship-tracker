/* Scenario 3 — a vehicle reassigned between flights, then scrapped: history kept, Page 2 folds it under "Retired",
   nothing deleted. Also: a pad (Massey's) is tracked like a vehicle. Synthetic vehicle numbers only in this fixture. */
const { F, ok, done, appJsText, road0, post, liveReplay } = require("./fleet-test-helpers.js");
(async () => {
  const road = road0(), reg = F.empty(); F.seed(reg, { road, appJsText, now: Date.parse("2026-12-01T00:00Z") });
  await liveReplay(reg, [post("9200000000000000001", "NASASpaceflight", "2026-12-02T10:00:00.000Z", "Ship 45 is slated for Flight 18.")], road);
  ok(reg.vehicles.S45 && reg.vehicles.S45.flight === 18, "S45 → Flight 18");
  await liveReplay(reg, [post("9200000000000000002", "NASASpaceflight", "2026-12-10T10:00:00.000Z", "Ship 45 has been reassigned to Flight 19 after the test stand issue.")], road);
  const h = reg.vehicles.S45.flight_history || [];
  ok(reg.vehicles.S45.flight === 19 && h.some((x) => x.flight === 18) && h.some((x) => x.flight === 19), "S45 reassigned → Flight 19, flight_history keeps 18 → 19 with sources");
  // an OLDER post arriving later never overrides the newer assignment
  await liveReplay(reg, [post("9200000000000000003", "SpaceflightNow", "2026-12-05T10:00:00.000Z", "Ship 45 assigned to Flight 18.")], road);
  ok(reg.vehicles.S45.flight === 19, "an older post read later does not undo the reassignment");
  let g = F.groups(reg, road);
  ok(g.get(19) && g.get(19).some((v) => v.id === "S45") && !(g.get(18) || []).some((v) => v.id === "S45"), "Future vehicles: S45 now listed under Flight 19 only");
  await liveReplay(reg, [post("9200000000000000004", "RGVaerialphotos", "2026-12-12T15:00:00.000Z", "Booster 22 seen being lifted onto the transporter.")], road);
  ok(reg.vehicles.B22.flight === 15, "flown B22 keeps Flight 15");
  const cr = await liveReplay(reg, [post("9200000000000000006", "BocaChicaGal", "2026-12-13T21:00:00.000Z", "Ship 45 has started cryo testing at Massey's.")], road);
  ok(cr.sent.length === 1 && cr.sent[0].fleet_key === "S45|cryo_start", "S45 cryo start pushes once (Flight 19 vehicle)");
  const s = await liveReplay(reg, [post("9200000000000000005", "NASASpaceflight", "2026-12-15T10:00:00.000Z", "Ship 45 has been scrapped after damage during testing.")], road);
  ok(reg.vehicles.S45.state === "scrapped" && F.TERMINAL.has("scrapped"), "S45 → scrapped (terminal)");
  ok(reg.vehicles.S45.events.some((e) => e.type === "cryo_start") && reg.vehicles.S45.flight_history.length >= 2 && /9200000000000000005/.test(reg.vehicles.S45.state_src), "scrapped vehicle keeps its events, flight history and the scrap source (never deleted)");
  ok(s.sent.length === 0, "scrapped / retired is not a push");
  g = F.groups(reg, road);
  ok((g.get("retired") || []).some((v) => v.id === "S45") && !(g.get(19) || []).some((v) => v.id === "S45"), "Future vehicles: S45 folds into 'Retired', out of the Flight 19 group");
  // pads are tracked the same way
  ok(reg.pads && ["PAD1", "PAD2", "MASSEYS", "LC39A"].every((k) => reg.pads[k]), "pads seeded: Pad 1, Pad 2, Massey's, LC-39A");
  done();
})().catch((e) => { console.log("❌ crashed: " + e.stack); process.exit(1); });
