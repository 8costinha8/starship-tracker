/* Page 2 flight template (tracker-2026-11-23-flight-template): every flight on Page 2 (current + next, any number) renders
   through the same 6-box Road template (Cryo tests, Raptor engines, Static fires, Pad activity, FAA licence, Launch date),
   one card per vehicle per box, the registry's events collapsed into that card; no invented category; no "Future vehicles"
   section; unknown registry event types stay off the page and are listed as "unmapped". Fixture: fixtures/fleet/f17-vehicles.json
   (S44 + B24: move, move, cryo_start, cryo_done each). Offline, nothing written. node scripts/test-flight-template.js */
const fs = require("fs"), path = require("path");
const F = require("./fleet.js");
const { appFns } = require("./app-fns-test-helper.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const road0 = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "fleet", "f17-vehicles.json"), "utf8"));
const SIX = ["cryo", "raptor", "static", "pad", "faa", "date"];
const clone = (x) => JSON.parse(JSON.stringify(x));

// page structure: the section and its invented category are gone
ok(!/FutureVehicles|fleetGroups|FleetRow|fleetPost|id="future-vehicles"|On the move/.test(app), "app.js: no 'Future vehicles' section, no fleetPost, no invented 'On the move' category");
{ const m = (app.match(/const FLEET_ROAD_BOX = (\{[^}]*\});/) || [])[1] || "";
  ok(["move", "rollout", "stacked"].every((k) => new RegExp(`\\b${k}: "pad"`).test(m)), "app.js: move, rollout and stacked map to Pad activity"); }

// a flight N+1 registry (N = the Road's flight, the fixture is relabelled to it): same vehicles, any number
const reg = (n) => { const r = clone(fx); for (const v of Object.values(r.vehicles)) if (v.flight != null) v.flight = n; return r; };
const checks = appFns(["upcomingFlight", "rtfRows", "roadForFlight", "fleetRoad", "peekCatItems", "roadPageRows", "pastRoadFlights", "FLIGHTS"], (A) => {
  const out = [], o = (c, m) => out.push([c, m]);
  const rep = (label, posts) => {
    const bad = posts.filter((p) => !SIX.includes(p.cat && p.cat.id));
    o(!bad.length, `${label}: every card is in one of the 6 boxes (${posts.map((p) => p.cat.id).join(", ") || "none"})${bad.length ? " — outside: " + bad.map((p) => `${p.cat && p.cat.id}/${p.cat && p.cat.name}`).join("; ") : ""}`);
    const empty = posts.filter((p) => !p.h || !String(p.h.card_text || p.h.text || "").trim() || p.empty || /nothing reported yet/i.test(String(p.h.text)) || (!p.h.url && !(p.h.updates || []).length && !p.h.media_override && !p.h.x_post));
    o(!empty.length, `${label}: no empty cards — every per-vehicle card holds at least one event (${posts.length} card(s))${empty.length ? " — empty: " + empty.map((p) => p.id).join(", ") : ""}`);
    const seen = {}; for (const p of posts) { const k = p.cat.id + "|" + (p.h && p.h.id); seen[k] = (seen[k] || 0) + 1; }
    const veh = {}; for (const p of posts) if (["cryo", "raptor", "static", "pad"].includes(p.cat.id)) { const k = p.cat.id + "|" + p.cat.name; veh[k] = (veh[k] || 0) + 1; }
    o(Object.values(seen).every((c) => c === 1) && Object.values(veh).every((c) => c === 1), `${label}: at most one card per vehicle per box (${Object.keys(veh).join("; ") || "none"})`);
    return veh;
  };
  for (const n of [road0.flight + 1, road0.flight + 2]) {
    const r = reg(n), u = A.upcomingFlight(road0, n, r), posts = u.posts, L = `Flight ${n} (fixture S44/B24)`;
    const veh = rep(L, posts);
    o(posts.length === 4 && ["cryo|Cryo tests · Ship 44", "cryo|Cryo tests · Booster 24", "pad|Pad activity · Ship 44", "pad|Pad activity · Booster 24"].every((k) => veh[k] === 1), `${L}: 8 raw registry events → 4 cards (Cryo S44, Cryo B24, Pad S44, Pad B24), not 8`);
    const c = posts.find((p) => p.cat.id === "cryo" && /Booster 24/.test(p.cat.name));
    o(c && c.h.complete === true && /completed/i.test(c.h.text) && (c.h.updates || []).some((x) => /began cryo/i.test(x.text)), `${L}: B24 cryo = ONE card showing done ("${c && c.h.text}") with the start post behind it in Earlier updates`);
    const pad = posts.find((p) => p.cat.id === "pad" && /Booster 24/.test(p.cat.name));
    o(pad && (pad.h.updates || []).length >= 1 && !/On the move/i.test(pad.cat.name), `${L}: B24's two 'move' events → one Pad activity card (latest "${pad && pad.h.text}", ${pad && (pad.h.updates || []).length} earlier)`);
    o(!posts.some((p) => /Booster 25/.test(JSON.stringify(p.h))), `${L}: B25 (no flight yet) is not rendered`);
    const ticks = A.peekCatItems(u.road);
    o(ticks.length === 6 && ticks.map((t) => t.id).join() === SIX.join(), `${L}: six stage dots in template order (${ticks.map((t) => t.id).join(", ")})`);
  }
  // rollout / stacked → Pad activity for that vehicle; an unknown type is dropped from the page
  const n = road0.flight + 1, r = reg(n), s = r.vehicles.S44, b = r.vehicles.B24;
  s.events.push({ id: "fv-test-roll", key: "S44|rollout", vehicle: "S44", type: "rollout", at: "2026-11-24T06:00:00.000Z", date: "24 Nov", text: "Ship 44 rolled out to Pad 2.", url: "https://x.com/RGVaerialphotos/status/9500000000000000001", src: "@RGVaerialphotos", flight: null });
  b.events.push({ id: "fv-test-stack", key: "B24|stacked", vehicle: "B24", type: "stacked", at: "2026-11-24T07:00:00.000Z", date: "24 Nov", text: "Booster 24 was stacked on the launch mount.", url: "https://x.com/RGVaerialphotos/status/9500000000000000002", src: "@RGVaerialphotos", flight: null });
  b.events.push({ id: "fv-test-odd", key: "B24|teleport", vehicle: "B24", type: "teleport", at: "2026-11-24T08:00:00.000Z", date: "24 Nov", text: "Booster 24 teleported to the moon.", url: "https://x.com/RGVaerialphotos/status/9500000000000000003", src: "@RGVaerialphotos", flight: null });
  const u = A.upcomingFlight(road0, n, r), veh = rep("Flight " + n + " + rollout/stacked/unknown", u.posts);
  const sp = u.posts.find((p) => p.cat.id === "pad" && /Ship 44/.test(p.cat.name)), bp = u.posts.find((p) => p.cat.id === "pad" && /Booster 24/.test(p.cat.name));
  o(sp && /rolled out/.test(sp.h.text) && bp && /stacked/.test(bp.h.text), `rollout → Ship 44 Pad activity ("${sp && sp.h.text}"), stacked → Booster 24 Pad activity ("${bp && bp.h.text}")`);
  o(!JSON.stringify(u.posts).includes("teleport") && !u.posts.some((p) => !SIX.includes(p.cat.id)), "unknown event type 'teleport' is kept out of the page (no new category)");
  const un = F.unmappedEvents(r);
  o(un.length === 1 && un[0].type === "teleport" && un[0].vehicle === "B24" && F.unmappedEvents(reg(n)).length === 0, `unmapped list: ${JSON.stringify(un.map((x) => x.vehicle + ":" + x.type))} (the real fixture has none)`);
  // a vehicle with events in only one section gets a card only there (never an empty card elsewhere)
  { const r1 = reg(n); delete r1.vehicles.B24; r1.vehicles.S44.events = r1.vehicles.S44.events.filter((e) => e.type === "cryo_start");
    const u1 = A.upcomingFlight(road0, n, r1); rep("Flight " + n + " (S44 cryo start only)", u1.posts);
    o(u1.posts.length === 1 && u1.posts[0].cat.id === "cryo" && /Ship 44/.test(u1.posts[0].cat.name), `only S44's one event exists → exactly one card (${u1.posts.map((p) => p.cat.name).join("; ")}); no Booster 24 card, no empty Raptor / Static / Pad cards`); }
  // empty flight and the current flight keep the template too
  const e = A.upcomingFlight(road0, road0.flight + 3, { vehicles: {} });
  o(e.posts.length === 0, "a flight with nothing yet renders no cards (no crash, no invented card)");
  rep(`current Flight ${road0.flight} (road.json, its Page 2 group)`, A.roadPageRows(A.rtfRows(road0).rows, road0.flight, A.pastRoadFlights(road0, A.FLIGHTS)).cur.filter((x) => x.post).map((x) => x.post));
  return out;
});
for (const [c, m] of checks) ok(c, m);
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
