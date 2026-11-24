/* Page 2 flight template (tracker-2026-11-23-flight-template): every flight on Page 2 (current + next, any number) renders
   through the same 6-box Road template (Cryo tests, Raptor engines, Static fires, Pad activity, FAA licence, Launch date),
   one card per vehicle per box, the registry's events collapsed into that card; no invented category; no "Future vehicles"
   section; unknown registry event types stay off the page and are listed as "unmapped". Fixture: fixtures/fleet/f17-vehicles.json
   (S44 + B24: move, move, cryo_start, cryo_done each). Offline, nothing written. node scripts/test-flight-template.js */
const fs = require("fs"), path = require("path");
const F = require("./fleet.js");
const { appFns } = require("./app-fns-test-helper.js");
globalThis.RoadPick = require("./road-pick.js");
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
const checks = appFns(["upcomingFlight", "rtfRows", "roadForFlight", "fleetRoad", "peekCatItems", "roadPageRows", "pastRoadFlights", "FLIGHTS", "urlOf"], (A) => {
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
  const f16posts = A.roadPageRows(A.rtfRows(road0).rows, road0.flight, A.pastRoadFlights(road0, A.FLIGHTS)).cur.filter((x) => x.post).map((x) => x.post);
  rep(`current Flight ${road0.flight} (road.json, its Page 2 group)`, f16posts);

  // photo, credit and link: same post as the headline, or (fallback) same single earlier event's photo post
  const sid = (u) => (String(u || "").match(/status\/(\d{15,})/) || [])[1] || null;
  const same = (a, b) => !!(a && b && (a === b || (sid(a) && sid(a) === sid(b))));
  const checkFace = (label, posts) => {
    for (const p of posts) {
      const h = p.h; if (!h) continue;
      const name = `${label} ${p.cat.name}`;
      const view = A.urlOf(h);
      const mo = h.media_override;
      const photo = mo && mo.image && !/rtf-placeholder/.test(String(mo.image));
      if (photo) {
        o(same(view, mo.post_url), `${name}: View on X matches the shown photo's post (view=${view}, photo=${mo.post_url})`);
        if (mo.fallback) {
          o((!!mo.photo_date || !!mo.keep_image) && !same(view, h.url), `${name}: fallback / manual-pick photo is not the headline post (headline=${h.url}, photo=${mo.post_url}, ${mo.keep_image ? "manual pick" : "Photo · " + mo.photo_date})`);
          o(!!h.url && !same(h.url, view), `${name}: headline post stays on h.url (reachable via the second credit line), distinct from View on X`);
          o((h.updates || []).every((u) => !u.at || (Date.parse(u.at) || 0) < (Date.parse(h.at) || 0)), `${name}: Earlier updates stay strictly older than the headline`);
        } else {
          o(same(mo.post_url, h.url) && same(view, h.url), `${name}: own-photo card — photo, View on X and headline share the same post`);
          o(!h.x_post || same(h.x_post.url, h.url), `${name}: attached x_post is the headline post, not a different one`);
        }
      } else {
        o(!view || same(view, h.url), `${name}: text-only card — View on X is the headline post (${view})`);
      }
    }
  };
  checkFace(`Flight ${n} fixture`, A.upcomingFlight(road0, n, reg(n)).posts);
  // 24 Nov: the card-fallback photo picks are pinned to a FROZEN copy of the data they were written against (road.json +
  // data/vehicles.json at 5766d68, 23 Nov), not live data: later registry posts legitimately change the picks (the
  // registry attaches a newer post's photo to the same event; still one post for photo + credit + link).
  const frozenRoad = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "fleet", "road-2026-11-23-card-fallback.json"), "utf8"));
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "fleet", "vehicles-2026-11-23-card-fallback.json"), "utf8"));
  const f17live = A.upcomingFlight(frozenRoad, 17, live).posts;
  checkFace("frozen 23 Nov F17", f17live);
  checkFace(`live F${road0.flight}`, f16posts);
  const f16frozen = A.roadPageRows(A.rtfRows(frozenRoad).rows, frozenRoad.flight, A.pastRoadFlights(frozenRoad, A.FLIGHTS)).cur.filter((x) => x.post).map((x) => x.post);
  checkFace(`frozen 23 Nov F${frozenRoad.flight}`, f16frozen);
  const pick = (posts, cat, nameRe) => posts.find((p) => p.cat.id === cat && nameRe.test(p.cat.name));
  const expectFallback = (label, p, textRe, postId, dateLabel, headlineRe) => {
    const mo = p && p.h && p.h.media_override, view = p && A.urlOf(p.h);
    o(p && textRe.test(p.h.text) && mo && mo.fallback && sid(mo.post_url) === postId && sid(view) === postId && mo.photo_date === dateLabel && headlineRe.test(p.h.url) && (p.h.updates || []).every((u) => !headlineRe.test(u.url) || (Date.parse(u.at) || 0) < (Date.parse(p.h.at) || 0)),
      `${label}: headline "${p && p.h.text}", Photo · ${mo && mo.photo_date}, view/photo post ${sid(view)} (want ${postId}), headline url kept`);
  };
  expectFallback("frozen 23 Nov F17 S44 cryo", pick(f17live, "cryo", /Ship 44/), /completed cryo/, "2123906558115418275", "20 Nov", /Blobifie\/status\/2124080565272117476/);
  expectFallback("frozen 23 Nov F17 S44 pad", pick(f17live, "pad", /Ship 44/), /is at Massey/, "2123481210752315451", "19 Nov", /NASASpaceflight\/status\/2123774597967540724/);
  expectFallback("frozen 23 Nov F17 B24 pad", pick(f17live, "pad", /Booster 24/), /left Mega Bay/, "2123663091074584938", "20 Nov", /Blobifie\/status\/2123871167119569323/);
  expectFallback("frozen 23 Nov F16 B23 cryo", pick(f16frozen, "cryo", /Booster 23/), /arrived at Massey/, "2115312218590126505", "28 Oct", /TrackingTheSB\/status\/2115353615561064723/);
  // 24 Nov: Bernardo's manual picks (keep_image + a note naming him) lead their live card: photo, credit and View on X from
  // the photo's own post, the headline post on the second credit line; never replaced by a fallback or a placeholder.
  const expectManual = (label, p, image, postId, headRe) => {
    const mo = p && p.h && p.h.media_override, view = p && A.urlOf(p.h);
    o(!!(p && mo && mo.image === image && mo.keep_image && sid(mo.post_url) === postId && sid(view) === postId && headRe.test(p.h.url)), `${label}: manual pick ${mo && mo.image} · View on X ${sid(view)} (want ${image}, ${postId}) · headline ${p && p.h.url}`);
  };
  expectManual("live F16 S43 cryo", pick(f16posts, "cryo", /Ship 43/), "images/s43-cryo-wai-clean.jpg", "2114533727514640403", /LabPadre\/status\/2114757145245671915/);
  expectManual("live F16 B23 cryo", pick(f16posts, "cryo", /Booster 23/), "images/b23-cryo-starshipgazer-clean.jpg", "2110889490336350574", /TrackingTheSB\/status\/2115353615561064723/);
  { const r = JSON.parse(JSON.stringify(road0)); const c = r.categories.find((x) => x.id === "cryo"); const e = c.history.find((h) => h.id === "f16-s43-2114757145245671915"); e.media_override = { ...e.media_override, note: "auto pick" };
    const p = pick(A.roadPageRows(A.rtfRows(r).rows, r.flight, A.pastRoadFlights(r, A.FLIGHTS)).cur.filter((x) => x.post).map((x) => x.post), "cryo", /Ship 43/);
    o(!(p && p.h.media_override && p.h.media_override.image === "images/s43-cryo-wai-clean.jpg" && sid(A.urlOf(p.h)) === "2114533727514640403"), "a keep_image picture with no Bernardo note does not hijack the card face (another post's photo needs a recorded manual pick)"); }
  // newest earlier photo wins; no photo at all → text-only
  { const r1 = { vehicles: { S99: { id: "S99", type: "ship", name: "Ship 99", flight: n, state: "cryo", events: [
      { id: "fv-old", type: "cryo_start", at: "2026-11-01T10:00:00.000Z", date: "1 Nov", text: "Ship 99 began cryo testing.", url: "https://x.com/RGVaerialphotos/status/9500000000000000011", src: "@RGVaerialphotos", x_post: { url: "https://x.com/RGVaerialphotos/status/9500000000000000011", author: { username: "RGVaerialphotos" }, media: [{ type: "photo", url: "https://example.com/old.jpg" }] } },
      { id: "fv-mid", type: "move", at: "2026-11-02T10:00:00.000Z", date: "2 Nov", text: "Ship 99 moved at Massey's.", url: "https://x.com/Blobifie/status/9500000000000000012", src: "@Blobifie" },
      { id: "fv-new", type: "cryo_done", at: "2026-11-03T10:00:00.000Z", date: "3 Nov", text: "Ship 99 completed cryo testing.", url: "https://x.com/Blobifie/status/9500000000000000013", src: "@Blobifie" }
    ] } } };
    // mid event is pad, not cryo — only fv-old is earlier in the cryo section
    const u1 = A.upcomingFlight(road0, n, r1);
    const c1 = (u1.posts || []).find((p) => p.cat.id === "cryo");
    o(c1 && /completed cryo/.test(c1.h.text) && c1.h.media_override && c1.h.media_override.fallback && sid(c1.h.media_override.post_url) === "9500000000000000011" && c1.h.media_override.photo_date === "1 Nov" && same(A.urlOf(c1.h), c1.h.media_override.post_url),
      `fallback picks the newest earlier same-section photo (1 Nov RGV), not a later other-section event; Photo · ${c1 && c1.h.media_override && c1.h.media_override.photo_date}`);
    const rNew = { vehicles: { S99: { id: "S99", type: "ship", name: "Ship 99", flight: n, state: "cryo", events: [
      { id: "fv-oldp", type: "cryo_start", at: "2026-11-01T10:00:00.000Z", date: "1 Nov", text: "Ship 99 began cryo testing.", url: "https://x.com/LabPadre/status/9500000000000000031", src: "@LabPadre", x_post: { url: "https://x.com/LabPadre/status/9500000000000000031", author: { username: "LabPadre" }, media: [{ type: "photo", url: "https://example.com/old2.jpg" }] } },
      { id: "fv-newp", type: "cryo_start", at: "2026-11-02T10:00:00.000Z", date: "2 Nov", text: "Ship 99 resumed cryo testing.", url: "https://x.com/RGVaerialphotos/status/9500000000000000032", src: "@RGVaerialphotos", x_post: { url: "https://x.com/RGVaerialphotos/status/9500000000000000032", author: { username: "RGVaerialphotos" }, media: [{ type: "photo", url: "https://example.com/new2.jpg" }] } },
      { id: "fv-donep", type: "cryo_done", at: "2026-11-03T10:00:00.000Z", date: "3 Nov", text: "Ship 99 completed cryo testing.", url: "https://x.com/Blobifie/status/9500000000000000033", src: "@Blobifie" }
    ] } } };
    const cN = (A.upcomingFlight(road0, n, rNew).posts || []).find((p) => p.cat.id === "cryo");
    o(cN && sid(cN.h.media_override && cN.h.media_override.post_url) === "9500000000000000032" && cN.h.media_override.photo_date === "2 Nov",
      `when two earlier same-section events have photos, the newest wins (got ${cN && cN.h.media_override && sid(cN.h.media_override.post_url)} · ${cN && cN.h.media_override && cN.h.media_override.photo_date})`);
    const r2 = { vehicles: { S99: { id: "S99", type: "ship", name: "Ship 99", flight: n, state: "cryo", events: [
      { id: "fv-a", type: "cryo_start", at: "2026-11-01T10:00:00.000Z", date: "1 Nov", text: "Ship 99 began cryo testing.", url: "https://x.com/Blobifie/status/9500000000000000021", src: "@Blobifie" },
      { id: "fv-b", type: "cryo_done", at: "2026-11-03T10:00:00.000Z", date: "3 Nov", text: "Ship 99 completed cryo testing.", url: "https://x.com/Blobifie/status/9500000000000000022", src: "@Blobifie" }
    ] } } };
    const c2 = (A.upcomingFlight(road0, n, r2).posts || []).find((p) => p.cat.id === "cryo");
    o(c2 && /completed cryo/.test(c2.h.text) && !(c2.h.media_override && c2.h.media_override.image) && /9500000000000000022/.test(A.urlOf(c2.h) || ""),
      "text-only when no earlier same-section event has a photo (View on X stays on the headline post)");
  }
  return out;
  return out;
});
for (const [c, m] of checks) ok(c, m);
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
