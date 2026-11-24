// Paired places (24 Nov v5, Tusk): "Ship 44 and Booster 24 returned to Megabay 2 and 1" (@Blobifie 2125222150252675155)
// means S44 → Mega Bay 2 and B24 → Mega Bay 1. The registry parser maps "A and B … X and Y" in order and never copies one
// place to both vehicles. Also scans the live data: every post that gave two vehicles a move must agree with the pairing
// of that post's own text (the fixture posts, road.json feed_items, Road entries).   node scripts/test-fleet-pairs.js
process.env.PUSH_SHADOW = "0";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const F = require("./fleet.js");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const P = (s) => JSON.stringify(F.pairPlaces(s, F.idsIn(s)));
check(P("Ship 44 and Booster 24 returned to Megabay 2 and 1.") === JSON.stringify({ S44: "Mega Bay 2", B24: "Mega Bay 1" }), "\"Ship 44 and Booster 24 returned to Megabay 2 and 1\" → S44 Mega Bay 2, B24 Mega Bay 1");
check(P("Booster 24 and Ship 44 moved to Mega Bay 1 and Mega Bay 2 respectively.") === JSON.stringify({ B24: "Mega Bay 1", S44: "Mega Bay 2" }), "full names + respectively map in order");
check(P("Ship 44 and Booster 24 are together at Massey's for testing.") === "null", "one place for both vehicles is not a pair (both are at Massey's)");
check(P("Booster 24 has left Megabay 1 for the first time following its assembly, joining Ship 44 at masseys") === "null", "a from-place and a to-place that are not written as a pair are not mapped");
// the registry path (ingest) gives each vehicle its own place
const reg = F.empty();
for (const [id, type] of [["B24", "booster"], ["S44", "ship"]]) reg.vehicles[id] = { id, type, name: id, state: "cryo", flight: 17, flight_history: [{ flight: 17, at: "2026-11-20T00:00:00Z" }], events: [] };
F.ingest(reg, [{ post_id: "2125222150252675155", url: "https://x.com/Blobifie/status/2125222150252675155", created_at: "2026-11-24T13:36:59.000Z", text: "Ship 44 and Booster 24 returned to Megabay 2 and 1 respectively tonight.", author: { username: "Blobifie" }, media: [] }], { road: { flight: 16, vehicles: ["B23", "S43"], categories: [] }, now: Date.parse("2026-11-24T13:50:00Z") });
const mv = (id) => (reg.vehicles[id].events || []).find((e) => e.type === "move") || {};
check(mv("S44").place === "Mega Bay 2" && /^Ship 44 is at Mega Bay 2\.$/.test(mv("S44").text || ""), `ingest: S44 → Mega Bay 2 ("${mv("S44").text}")`);
check(mv("B24").place === "Mega Bay 1" && /^Booster 24 is at Mega Bay 1\.$/.test(mv("B24").text || ""), `ingest: B24 → Mega Bay 1 ("${mv("B24").text}")`);
// live data: a post that moved two vehicles to the SAME place must not be a pair in its own text
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "data/vehicles.json"), "utf8"));
const road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const texts = new Map();
try { for (const t of JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/fleet/x-posts-2026-11-16-23.json"), "utf8")).data || []) texts.set(String(t.id), t.text); } catch {}
for (const f of road.feed_items || []) { const id = (String(f.url || "").match(/status\/(\d+)/) || [])[1]; if (id && f.body && !texts.has(id)) texts.set(id, f.body); }
const byPost = new Map();
for (const v of Object.values(live.vehicles || {})) for (const e of v.events || []) if ((e.type === "move" || e.type === "rollout") && e.post_id) (byPost.get(e.post_id) || byPost.set(e.post_id, []).get(e.post_id)).push({ v: v.id, place: e.place, id: e.id });
let shared = 0;
for (const [pid, evs] of byPost) {
  if (evs.length < 2) continue; shared++;
  const t = texts.get(pid); if (!t) continue;
  for (const s of F.sentences(t)) for (const c of F.clauses(s)) {
    const pp = F.pairPlaces(c, F.idsIn(c)); if (!pp) continue;
    for (const e of evs) if (pp[e.v]) check(e.place === pp[e.v], `live ${e.id} (${e.v}, post ${pid}): place ${e.place} = ${pp[e.v]} from "${c.slice(0, 70)}"`);
  }
}
console.log(`(${shared} live posts moved two or more vehicles)`);
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
