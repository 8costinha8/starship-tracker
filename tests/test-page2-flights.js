// 15 Nov, Bernardo's rules for every flight (no network, nothing written): node tests/test-page2-flights.js
//  - Page 2 shows ONLY the upcoming flight and the one after (road.flight, road.flight + 1); no past Road groups
//  - an opened group shows ALL its updates at once: no "Show all updates" button
//  - an opened Page 1 flight card shows one mission photo per vehicle (road.archive[n].vehicle_photos, booster left,
//    ship right, labelled with the vehicle name, 4:3 cover + per-photo focus); none set → the flight's own gallery (SpaceX recap)
//  - no rollover handover update in any Road group (kind/id, not wording); the Flight N group card still renders
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const WANT = ["page2Flights", "roadPageRows", "rtfRows", "pastRoadFlights", "vehiclePhotosOf", "cardPhotosOf", "galleryOf", "vehName", "FLIGHTS", "isShipCryo", "ownLocalMedia", "isHandoverEntry"];
const EXTRA = new Set();
function load() {
  const lines = src.split("\n"), starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); if (m) starts.push({ name: m[1], i }); });
  const decl = (name) => { const k = starts.findIndex((s) => s.name === name); if (k < 0) return null; let end = lines.length;
    for (let j = starts[k].i + 1; j < lines.length; j++) if (/^\S/.test(lines[j]) && !/^[}\])]/.test(lines[j])) { end = j; break; } return lines.slice(starts[k].i, end).join("\n"); };
  const have = new Set(), parts = []; const add = (n) => { if (have.has(n)) return true; const d = decl(n); if (!d) return false; have.add(n); parts.unshift(d); return true; };
  WANT.forEach(add); [...EXTRA].forEach(add);
  const window = { RoadPick: require(path.join(ROOT, "scripts/road-pick.js")), addEventListener() {}, dispatchEvent() {}, location: { search: "" } }, React = { createElement() { return null; } }, document = {}, localStorage = { getItem() { return null; }, removeItem() {} };
  for (let t = 0; t < 400; t++) {
    try { return new Function("window", "React", "document", "localStorage", `${parts.join("\n")}\nreturn { ${WANT.join(", ")} };`)(window, React, document, localStorage); }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/) || String(e.message).match(/Cannot access '(\w+)' before initialization/); if (!m) throw e;
      if (/before initialization/.test(e.message)) { const i = parts.findIndex((p) => new RegExp(`^(?:const|let|function)\\s+${m[1]}\\b`).test(p)); const [p] = parts.splice(i, 1); parts.unshift(p); continue; }
      if (!add(m[1])) throw new Error("no top-level " + m[1]); }
  }
}
const base = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
// the same data relabelled to the next flight (17), with its own hardware: the rule is by road.flight, never a number
const next = JSON.parse(JSON.stringify(base).replace(/\b(Ship|S)(\s?)43\b/g, "$1$244").replace(/\b(Booster|B)(\s?)23\b/g, "$1$224")); next.flight = 17; next.vehicles = ["B24", "S44"]; next.hardware_flights = { B24: 17, S44: 17 };
for (const c of next.categories) for (const h of c.history || []) if (h.flight === 16) h.flight = 17; for (const f of next.feed_items || []) if (f.flight === 16) f.flight = 17;
let A; for (let t = 0; t < 200; t++) { try { A = load(); for (const r of [base, next]) A.roadPageRows(A.rtfRows(r).rows, r.flight, A.pastRoadFlights(r, A.FLIGHTS)); A.cardPhotosOf(A.FLIGHTS[0], [], base); break; }
  catch (e) { const m = String(e.message).match(/^(\w+) is not defined/); if (!m || EXTRA.has(m[1])) throw e; EXTRA.add(m[1]); } }

// Page 2: flights N and N+1 only
for (const [label, r] of [[`live road.json (Flight ${base.flight})`, base], ["relabelled to Flight 17", next]]) {
  check(JSON.stringify(A.page2Flights(r)) === JSON.stringify([r.flight, r.flight + 1]), `${label}: Page 2 flights = ${A.page2Flights(r).join(", ")} (N and N+1)`);
  const cur = A.roadPageRows(A.rtfRows(r).rows, r.flight, A.pastRoadFlights(r, A.FLIGHTS)).cur.filter((x) => x.post);
  check(cur.length > 0 && cur.every((x) => x.post.flight === r.flight), `${label}: the current group holds only Flight ${r.flight} posts (${cur.length})`);
}
const uf = src.slice(src.indexOf("function UpdatesFeed("), src.indexOf("function StarshipTracker("));
const secs = uf.match(/<RoadFlightSection [^>]*>/g) || [];
check(secs.length === 2 && /flight=\{road\.flight\}/.test(secs[0]) && /flight=\{peekN\}/.test(secs[1]) && /const peekN = page2Flights\(road\)\[1\]/.test(uf), "UpdatesFeed renders exactly two groups: road.flight and page2Flights(road)[1]");
check(!/pastGroups|PastPost|fsec-past|early\.map|rest\.map/.test(uf) && !/function PastPost\(/.test(src), "no past Road groups (F14, F15) and no other flights' rows on Page 2");
check(base.archive && base.archive["14"] && base.archive["15"] && base.archive["15"].summary, "road.archive data kept (Page 1's past Road boxes still read it)");

// Opened group: everything at once
check(!/Show all updates|Show fewer updates|rfs-more|rfs-extra|RFS_FIRST|show-all/.test(src), "no 'Show all updates' button (or its hidden-extra rows) anywhere");
{ const rfs = src.slice(src.indexOf("function RoadFlightSection("), src.indexOf("function UpdatesFeed("));
  check(/<div className="rfs-feed">\s*\{kids\}\s*<\/div>/.test(rfs), "an opened group renders every card it holds (all children, none hidden)");
  check(/rfs-reveal/.test(rfs) && /if \(!openRef\.current\) toggleRef\.current\(\)/.test(rfs), "deep links still open the group (rfs-reveal)"); }
check(/<details className="buildup feed-bu"/.test(src), "each entry keeps its own 'Earlier updates' toggle");

// Vehicle photos on the opened Page 1 card
// app.js gives every FLIGHTS entry without a photo field images/f<N>-thumb/-a/-b.jpg (a top-level forEach, mirrored here)
check(/if \(!f\.photo\) f\.photo = \{ thumb: `images\/f\$\{f\.n\}-thumb\.jpg`, gallery: \[`images\/f\$\{f\.n\}-a\.jpg`, `images\/f\$\{f\.n\}-b\.jpg`\] \};/.test(src), "flights without a photo field use images/f<N>-a.jpg / -b.jpg (the SpaceX recap pair)");
A.FLIGHTS.forEach((f) => { if (!f.photo) f.photo = { thumb: `images/f${f.n}-thumb.jpg`, gallery: [`images/f${f.n}-a.jpg`, `images/f${f.n}-b.jpg`] }; });
{ const f15 = A.FLIGHTS.find((f) => f.n === 15), f14 = A.FLIGHTS.find((f) => f.n === 14);
  const p = A.cardPhotosOf(f15, [], base);
  check(p.length === 2 && p[0].src === "images/f15-booster.jpg" && p[0].label === "Booster 22" && p[0].focus === "50% 20%" && p[1].src === "images/f15-ship.jpg" && p[1].label === "Ship 42" && p[1].focus === "50% 18%" && p.every((x) => x.vehicle), "F15: booster left (Booster 22), ship right (Ship 42) from road.archive[15].vehicle_photos, with hand-set focus");
  const fb = A.cardPhotosOf(f14, [], base), g14 = A.galleryOf(f14, []);
  check(fb.length === 2 && fb.every((x, i) => !x.vehicle && x.label === "SpaceX" && x.src === g14[i]), `F14 (none set): falls back to the flight's own gallery (${g14.join(", ")}), credit SpaceX`);
  const one = JSON.parse(JSON.stringify(base)); one.archive["14"].vehicle_photos = { booster: "images/x-b21.jpg" };
  const p1 = A.cardPhotosOf(f14, [], one);
  check(p1[0].src === "images/x-b21.jpg" && p1[0].label === "Booster 21" && p1[1].src === g14[1] && !p1[1].vehicle, "only the booster set: booster photo left (label from the flight's booster id), the gallery keeps the right slot");
  const lab = JSON.parse(JSON.stringify(base)); lab.archive["15"].vehicle_photos.ship.label = "Ship 42 · catch";
  check(A.cardPhotosOf(f15, [], lab)[1].label === "Ship 42 · catch", "a hand-written label wins");
  check(A.vehiclePhotosOf({ archive: {} }, f15) === null && A.vehiclePhotosOf(null, f15) === null, "no archive / no field → null (fallback)");
  const def = JSON.parse(JSON.stringify(base)); def.archive["15"].vehicle_photos.booster = { image: "images/f15-booster.jpg" };
  check(A.cardPhotosOf(f15, [], def)[0].focus === "center" && A.cardPhotosOf(f14, [], one)[0].focus === "center", "focus defaults to center when unset (object or string form)"); }
{ const fc = src.slice(src.indexOf("function FlightCard("), src.indexOf("function usePastFit("));
  check(/cardPhotosOf\(f, past, road\)/.test(fc) && /focus=\{p\.focus\}/.test(fc) && /credit=\{p\.label\}/.test(fc) && !/contain=\{p\.vehicle\}/.test(fc), "FlightCard: vehicle photos use the per-photo focus and the vehicle name as the label");
  check(/\.photo-wide \{ aspect-ratio: 4 \/ 3; \}/.test(src) && !/aspect-ratio: 2 \/ 3/.test(src) && !/photo-contain/.test(src) && /\.photo\.has-img img \{[\s\S]*?object-fit: cover;/.test(src), "CSS: vehicle photos use the standard 4:3 .photo frame with object-fit cover"); }
{ const sz = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), bytes: b.length }; i += 2 + b.readUInt16BE(i + 2); } return null; };
  for (const f of ["images/f15-booster.jpg", "images/f15-ship.jpg"]) { const d = sz(f); check(d && Math.max(d.w, d.h) <= 1200 && d.bytes < 250000, `${f}: web size (${d && d.w}×${d && d.h}, ${d && Math.round(d.bytes / 1024)} KB)`); } }
{ const CR = require(path.join(ROOT, "scripts/check-road.js"));
  const r = { flight: 17, categories: [{ id: "cryo", history: [{ flight: 16, text: "Ship 43 x.", date: "1 Dec", at: "2026-12-01T00:00:00Z" }] }], archive: { 16: { vehicle_photos: { booster: { image: "images/f16-booster.jpg", focus: "50% 20%" } } } } };
  CR.archiveLaunched(r, 16);
  check(r.archive[16].vehicle_photos && r.archive[16].vehicle_photos.booster.image === "images/f16-booster.jpg" && r.archive[16].vehicle_photos.booster.focus === "50% 20%" && r.archive[16].entries.length === 1, "check-road archiving keeps a hand-set vehicle_photos (including focus) set before the flight was archived"); }

// No rollover handover entry in any Road group (every flight); the Flight N group card still renders
{ const notice = (base.feed_items || []).find((f) => f.kind === "notice" || String(f.id || "").startsWith("notice-"));
  check(!!notice && A.isHandoverEntry(notice) && A.isHandoverEntry({ kind: "notice", id: "notice-x", body: "unrelated wording" }) && !A.isHandoverEntry({ kind: "news", id: "news-x", body: "Flight 15 is in the log. Now tracking the road to Flight 16." }), "isHandoverEntry is by kind/id, not by the wording");
  for (const [label, r] of [[`live road.json (Flight ${base.flight})`, base], ["relabelled to Flight 17", next]]) {
    const rows = A.rtfRows(r).rows;
    const groups = A.roadPageRows(rows, r.flight, A.pastRoadFlights(r, A.FLIGHTS));
    const posts = [...rows, ...groups.cur, ...groups.early, ...groups.late].filter((x) => x && x.post);
    const bad = posts.filter((x) => A.isHandoverEntry(x.post) || A.isHandoverEntry(x.post.h) || (x.post.cat && x.post.cat.id === "feed-notice"));
    check(bad.length === 0, `${label}: no handover entry in any Road group on Page 1 or Page 2`);
    const hasGroup = rows.some((x) => x.section && x.section.n === r.flight && x.section.next);
    const curHasCards = groups.cur.some((x) => x.post || x.empty);
    check(hasGroup && curHasCards, `${label}: the Flight ${r.flight} group card still renders (with its Road cards)`);
  } }
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
