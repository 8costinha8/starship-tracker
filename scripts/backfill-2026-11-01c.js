/* 1 Nov round 3 (data only). Idempotent. Usage: node scripts/backfill-2026-11-01c.js [--dry]
   Card (Flight Log) and feed (Road cards) read the same for the same post; shorthand spelled out; full sentences;
   S42 cryo photo = a LabPadre video frame showing Ship 42 with its top in view. Push wording (push_text) never changes. */
const fs = require("fs"), path = require("path");
const S = { B22pad: "https://x.com/RGVaerialphotos/status/2114578590792859900", S42pad: "https://x.com/TrackingTheSB/status/2098798758335225974",
  padTests: "https://x.com/Blobifie/status/2112679319818686934", bqd: "https://x.com/NASASpaceflight/status/2112967167767433728",
  b22sfNSF: "https://x.com/NASASpaceflight/status/2114347288739098706", b22sfSFN: "https://x.com/SpaceflightNow/status/2114349246803587110",
  lpCryo: "https://x.com/LabPadre/status/2108486994401825101", lpB22: "https://x.com/LabPadre/status/2098045579234259249" };
const T = { B22pad: "Booster 22 was lifted off the launch mount to catch height.", S42pad: "Ship 42 was lifted to catch height by the Pad 2 chopsticks.",
  padTests: "SpaceX performed more catch testing at the tower top, with launch and landing deluge tests.",
  bqd: "Pad 2 booster quick disconnects were purged, likely ahead of Booster 22.",
  b22sf: "Booster 22 completed a full-duration 33-engine static fire on Pad 2.",
  faa: "The FAA licence was issued for Flight 14 only; Flight 15 needs a licence modification.",
  b22cryo: "In the same overnight test, Booster 22 was filled, held at pressure, then detanked." };
const EXPAND = [[/\bPad 2 OLM\b/g, "Pad 2's orbital launch mount"], [/\bthe OLM\b/g, "the orbital launch mount"], [/\bOLM\b/g, "orbital launch mount"], [/\bPad-(\d)\b/g, "Pad $1"],
  [/\bSQD arm connect tests\b/g, "ship quick-disconnect arm connection tests"], [/\bSQD\b/g, "ship quick disconnect"], [/\bBQDs?\b/g, "booster quick disconnects"],
  [/\bTwo RVacs\b/g, "Two Raptor Vacuum engines"], [/\bRVacs\b/g, "Raptor Vacuum engines"], [/\bRVac\b/g, "Raptor Vacuum engine"], [/\bF(\d{1,2})\b/g, "Flight $1"]];
function apply(road, { log = console.log } = {}) {
  const out = [], ch = (w, a, b) => { out.push(w); log(`FIX ${w} | ${JSON.stringify(a)} → ${JSON.stringify(b)}`); };
  const cat = (id) => road.categories.find((c) => c.id === id), all = [];
  for (const c of road.categories) for (const h of c.history || []) { all.push([c.id, h]); for (const u of h.updates || []) all.push([c.id + "›u", u]); }
  const setCard = (o, t, w) => { const was = o.card_text || o.text; if (was !== t) { o.card_text = t; ch(w, was, t); } };
  for (const [w, o] of all) {                                                     // shown text: card_text, else text
    if (o.url === S.B22pad) setCard(o, T.B22pad, `${w} ${o.at} B22 catch height`);
    if (o.url === S.padTests) setCard(o, T.padTests, `${w} ${o.at} pad catch tests`);
    if (o.url === S.b22sfNSF && !o.updates_only && o.milestone) setCard(o, T.b22sf, `${w} ${o.at} B22 static`);
    if (o.url === S.lpB22) setCard(o, T.b22cryo, `${w} B22 cryo LabPadre row`);
    const t = o.card_text || o.text; if (typeof t === "string") { let x = t; for (const [re, r] of EXPAND) x = x.replace(re, r); if (x !== t) setCard(o, x, `${w} ${o.at || o.date || ""} shorthand`); } }
  const faa = cat("faa").history[0]; if (faa.text !== T.faa) { ch("faa[0].text", faa.text, T.faa); faa.text = T.faa; if (faa.card_text) faa.card_text = T.faa; }
  // the 21 Oct BQD purge (NSF, 18:00:04 UTC) also on the Road launch-pad card, at the same post time as the Flight Log line
  const pt = cat("pad").history.find((h) => h.url === S.padTests);
  if (pt && !(pt.updates || []).some((u) => u.url === S.bqd)) { (pt.updates = pt.updates || []).push({ text: T.bqd, at: "2026-10-21T18:00:04.000Z", date: "21 Oct", url: S.bqd, src: "@NASASpaceflight" }); ch("pad launch-pad card + 21 Oct BQD purge row", null, T.bqd); }
  // Flight Log pins: same wording as the Road card for the same post; the B22 static line points at the card's own post (SFN link kept as also_url)
  for (const b of Object.values(road.flightlog_pins.boxes)) for (const k of b.cards) for (const l of k.lines) {
    const set = (t) => { if (l.text !== t) { ch(`pin ${k.vehicle} ${l.day}`, l.text, t); l.text = t; } };
    if (l.url === S.B22pad) set(T.B22pad); if (l.url === S.S42pad) set(T.S42pad); if (l.url === S.padTests) set(T.padTests);
    if (l.url === S.b22sfSFN) { set(T.b22sf); l.also_url = S.b22sfSFN; l.url = S.b22sfNSF; ch(`pin B22 static url`, S.b22sfSFN, S.b22sfNSF); }
    let x = l.text; for (const [re, r] of EXPAND) x = x.replace(re, r); set(x); }
  for (const f of road.feed_items) if (f.url === S.B22pad && f.body !== T.B22pad) { ch(`feed ${f.id} body (push_text unchanged)`, f.body, T.B22pad); f.body = T.B22pad; }
  const s42 = cat("cryo").history.find((h) => h.url === S.lpCryo), IMG = "images/s42-cryo-labpadre-ship.jpg";
  if (s42.media_override.image !== IMG) { ch("cryo S42 image", s42.media_override.image, IMG); s42.media_override = { ...s42.media_override, image: IMG, frame: "LabPadre video 2108486743485792256 at 0:23, cropped so Ship 42's top sits in the upper part" }; }
  return out;
}
module.exports = { apply, T, S };
if (require.main === module) { const f = path.join(__dirname, "..", "road.json"), road = JSON.parse(fs.readFileSync(f, "utf8")); const r = apply(road);
  if (!process.argv.includes("--dry")) fs.writeFileSync(f, JSON.stringify(road, null, 2) + "\n"); console.log(`\n${r.length} changes${process.argv.includes("--dry") ? " (dry run)" : ""}`); }
