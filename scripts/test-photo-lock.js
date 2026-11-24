/* Offline: picture locks, photo sanity gate and photo_candidate queue (24 Nov, Bernardo via Tusk), every flight.
   - keep_image / locked only from Bernardo's recorded manual picks (scripts/media-lock.js); scripts can't write them.
   - photo gate: vehicle type / dark-blurry / webcam-overlay fields ride in the EXISTING vision calls (no new key, call or
     service); cheap local checks (live-camera posters, live-stream credits, odd aspect, pixel darkness / blur, NSF red ticker).
   - NO automatic swaps: every gate-passing better picture is a photo_candidate in data/needs-review.json (deduped).
   Nothing written outside a temp dir. node scripts/test-photo-lock.js */
const fs = require("fs"), os = require("os"), path = require("path");
const ML = require("./media-lock.js"), G = require("./photo-gate.js"), PC = require("./photo-candidates.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
const src = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
// locks
ok(ML.bernardoPick({ note: "Manual (Bernardo, 24 Nov)" }) && ML.bernardoPick({ picked_by: "Bernardo" }) && !ML.bernardoPick({ note: "agent frame pick" }), "a lock's provenance is a recorded Bernardo pick (note or picked_by)");
{ const sp = ML.sanitizePicks([{ keep_image: true, note: "agent pick" }, { keep_image: true, locked: true, note: "Picked by Bernardo 31 Oct" }]);
  ok(!sp.picks[0].keep_image && sp.picks[1].keep_image && sp.picks[1].locked && sp.dropped.length === 1, "sanitizePicks: an unproven lock is dropped, Bernardo's stays (the pick itself stays)"); }
{ const road = { flight: 16, categories: [{ id: "cryo", history: [{ id: "a", media_override: { image: "x.jpg", keep_image: true } }, { id: "b", media_override: { image: "images/s43-cryo-wai-clean.jpg", keep_image: true } }] }] };
  const rm = ML.sanitizeRoad(road, [{ image: "images/s43-cryo-wai-clean.jpg", picked_by: "Bernardo", category: "cryo" }]);
  ok(rm.length === 1 && !road.categories[0].history[0].media_override.keep_image && road.categories[0].history[1].media_override.keep_image, "sanitizeRoad: only the card matching Bernardo's recorded pick keeps keep_image"); }
ok(/keep_image && require\("\.\/media-lock\.js"\)\.bernardoPick\(p\)/.test(src("check-road.js")) && /sanitizeRoad\(road/.test(src("check-road.js")) && /sanitizePicks/.test(src("check-road.js")), "the checker can't write a lock: applyMediaPicks copies it only for Bernardo picks, every save passes sanitizeRoad");
// data audit (frozen 24 Nov)
const FX = path.join(ROOT, "fixtures", "road-rules"); // frozen 24 Nov data (the audit result), so a later checker run can't turn this suite red
const road = JSON.parse(fs.readFileSync(path.join(FX, "road-2026-11-24.json"), "utf8")), media = JSON.parse(fs.readFileSync(path.join(FX, "road-media-2026-11-24.json"), "utf8"));
const locked = road.categories.flatMap((c) => (c.history || []).filter((h) => h.media_override && (h.media_override.keep_image || h.media_override.locked)).map((h) => ({ c: c.id, h })));
const RRp = require("./road-rules.js").PENDING;
ok(locked.every(({ c, h }) => ML.provenOf(h, c, media.picks) || RRp.has(h.id)), `road.json: every lock is a recorded Bernardo pick, except the S43 Pad card left as is pending Bernardo (${locked.map(({ h }) => h.id + (RRp.has(h.id) ? " [pending]" : "")).join(", ")})`);
{ const r = { categories: [{ id: "pad", history: [{ id: "f16-s43-2115315741709001123", media_override: { image: "a.jpg", keep_image: true } }] }] }; ML.sanitizeRoad(r, []);
  ok(r.categories[0].history[0].media_override.keep_image === true, "the lock audit does not touch the S43 Pad card while Bernardo decides (f16-s43-2115315741709001123)"); }
ok(media.picks.every((p) => !(p.keep_image || p.locked) || ML.bernardoPick(p)), "road-media.json: no lock without Bernardo provenance");
for (const [id, img] of [["f16-s43-2114757145245671915", "images/s43-cryo-wai-clean.jpg"], ["f16-b23-2115312218590126505", "images/b23-cryo-starshipgazer-clean.jpg"]]) {
  const h = road.categories.flatMap((c) => c.history || []).find((x) => x.id === id);
  ok(h && h.media_override.image === img && h.media_override.keep_image && /Bernardo/.test(h.media_override.note) && fs.existsSync(path.join(ROOT, img)) && media.picks.some((p) => p.image === img && ML.bernardoPick(p)), `${id}: Bernardo's manual pick ${img} is locked, recorded in road-media.json, file present`); }
{ const CR = require("./check-road.js"), r2 = JSON.parse(JSON.stringify(road)); const n = CR.applyMediaPicks(r2, media.picks);
  const pick = (r) => r.categories.flatMap((c) => c.history || []).filter((x) => /cryo-wai-clean|starshipgazer-clean/.test(JSON.stringify(x.media_override || {}))).map((x) => JSON.stringify(x.media_override) + (x.x_text || ""));
  ok(JSON.stringify(pick(r2)) === JSON.stringify(pick(road)), `the checker's applyMediaPicks leaves Bernardo's picks (crop, note, card text) unchanged (${n} change(s) elsewhere)`); }
// photo gate
ok(G.DARK === 36 && G.BLUR === 30 && G.RED_BAND === 0.45, "gate limits: dark < 36 mean luma, blur < 30 Laplacian variance, red ticker band ≥ 0.45");
ok(!G.localCheck({ image: "https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg", type: "video", author: "LabPadre" }).ok, "a LabPadre / NSF video poster is a webcam frame");
ok(!G.localCheck({ image: "a.jpg", post_text: "Ship 43 has entered Megabay 2. 📷NSF | Starbase Live" }).ok, "a live-stream credit line fails");
ok(G.localCheck({ image: "a.jpg", keep_image: true, post_text: "Starbase Live" }).ok, "a manual pick (keep_image) is never gated");
{ const W = 160, H = 90, img = (f) => { const b = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.set(f(x, y), (y * W + x) * 3); return b; };
  const t = G.statsOf(img((x, y) => (y >= 84 ? [210, 20, 30] : [90, 95, 100])), W, H); ok(!G.localCheck({ image: "a.jpg", stats: t }).ok, `pixels: a red bottom ticker fails (red ${t.red_bottom.toFixed(2)})`);
  const d = G.statsOf(img(() => [20, 20, 22]), W, H); ok(!G.localCheck({ image: "a.jpg", stats: d }).ok, "pixels: a dark frame fails");
  const s = G.statsOf(img((x, y) => [100 + ((x * 7) % 60), 110 + ((y * 5) % 40), 120]), W, H); ok(G.localCheck({ image: "a.jpg", stats: s }).ok, "pixels: an ordinary scene passes"); }
ok(!G.visionOk({ vehicle_type: "ship" }, "booster").ok && !G.visionOk({ webcam_overlay: true }, "ship").ok && !G.visionOk({ dark_or_blurry: true }, null).ok && G.visionOk({ vehicle_type: "booster" }, "booster").ok, "vision fields: wrong vehicle type, webcam overlay, dark/blurry fail");
ok(/\.\.\.require\("\.\/photo-gate\.js"\)\.VISION_FIELDS/.test(src("check-road.js")) && /\.\.\.require\("\.\/photo-gate\.js"\)\.VISION_FIELDS/.test(src("media-watch.js")) && !/new OpenAI|api\.openai|anthropic|XAI_API_KEY_2/.test(src("photo-gate.js")), "vision fields ride in the existing pickImage / media_upgrade calls; photo-gate.js makes no call of its own");
// live verdicts: the gated pictures are the livestream grabs; B24 four-panel grab is gated
const reg = JSON.parse(fs.readFileSync(path.join(FX, "vehicles-2026-11-24.json"), "utf8"));
const b24 = reg.vehicles.B24.events.find((e) => e.id === "fv-768cebc29b");
ok(b24 && b24.photo_gate && b24.photo_gate.ok === false && /ticker/.test(b24.photo_gate.reasons.join()), "F17 B24 Pad/cryo photo (NSF four-panel night grab) carries a failing gate verdict");
ok(!reg.vehicles.B24.events.some((e) => e.id === "fv-3569a77e32"), "the direction-flipped B24 'headed to Massey's' (24 Nov 05:50) is folded into 'left Massey's'");
// candidates queued, never applied
{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-")), f = path.join(dir, "needs-review.json");
  const hi = PC.candidate({ card_id: "x-1", image_url: "https://img/hi.jpg", post_url: "https://x.com/SpaceX/status/1", reason: "SpaceX photo", confidence: 0.99 });
  const bad = PC.candidate({ card_id: "x-1", image_url: "https://pbs.twimg.com/amplify_video_thumb/9/img/a.jpg", type: "video", author: "NASASpaceflight", post_url: "https://x.com/NASASpaceflight/status/2", reason: "webcam" });
  const n1 = PC.writeCandidates(f, [hi, bad]), n2 = PC.writeCandidates(f, [hi]); const q = JSON.parse(fs.readFileSync(f, "utf8"));
  ok(n1 === 1 && n2 === 0 && q.items.length === 1 && q.items[0].type === "photo_candidate" && q.items[0].card_id === "x-1" && q.items[0].confidence === 0.99 && q.items[0].post_url, "a high-confidence candidate is QUEUED (card_id, image_url, post_url, reason, confidence, gate) once; a gate-failing one is not queued"); }
ok(!/h\.media_override = \{ post_url: p\.url/.test(src("media-cascade.js")) && /swapped stays empty/.test(src("media-watch.js")) && /swapped stays empty/.test(src("media-cascade.js")) && /NO automatic picture swaps/.test(src("fleet.js")), "auto-swap paths removed (media cascade, media watch, fleet image screen)");
const nr = JSON.parse(fs.readFileSync(path.join(FX, "needs-review-2026-11-24.json"), "utf8"));
ok(nr.items.some((i) => i.type === "photo_candidate" && i.card_id === "fv-768cebc29b"), "needs-review lists a photo_candidate for the B24 card for Bernardo");
console.log(fails ? `\n❌ ${fails} failed` : "\nAll photo/lock checks passed."); process.exit(fails ? 1 : 0);
