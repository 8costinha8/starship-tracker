// Offline tests for scripts/best-frame.js (best video frame / photo per Road card) and the B22 static fire card.
// Fixture: scripts/fixtures/nsf-b22-static.mp4 = the NSF B22 static fire clip downscaled (192x108, 2 fps, ~50 KB);
// the engines are lit from ~6.5 s to ~9.5 s.  node scripts/test-bestframe.js   exit 1 if any check fails
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, "..");
const bf = require("./best-frame.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const CLIP = path.join(__dirname, "fixtures", "nsf-b22-static.mp4");
const LIT = [6.5, 9.5];
(async () => {
  check(bf.hasFfmpeg(), "ffmpeg available (ubuntu-latest has it; no workflow change)");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bft-"));
  const frames = bf.extractFrames(CLIP, path.join(tmp, "fr"));
  check(frames.length >= 40 && frames.length <= 50, `~2 fps frames extracted (${frames.length})`);
  const { ranked } = bf.rankFrames(frames, "static");
  check(ranked.length === 3 && ranked.every((r) => r.t >= LIT[0] && r.t <= LIT[1]), `top static-fire frames are all from the lit section (${ranked.map((r) => r.t).join(", ")} s)`);
  check(ranked[0].plume > 0.2, "top frame has a large bright plume");
  check(bf.eventOf("static", "Booster 22 completed its static fire at the launch site.") === "static" && bf.eventOf("static", "Booster 22 lifted onto the launch mount") === "lift" && bf.eventOf("cryo", "Booster 23 completed a cryo proof test.") === "cryo" && bf.eventOf("static", "Booster 22 rolls out to the pad") === "rollout", "event targets from section + text");

  // upgradeEntry: frames + thumbnail go to the (fake) Grok call; only a frame picked with confidence >= 0.7 is swapped in
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bfr-"));
  fs.mkdirSync(path.join(root, "images")); fs.copyFileSync(frames[0], path.join(root, "images", "thumb.jpg"));
  const mk = () => ({ id: "x-1", text: "Booster 22 completed its static fire at the launch site.", media_override: { post_id: "99", post_url: "https://x.com/a/status/99", author: "a", type: "video", image: "images/thumb.jpg", video_url: CLIP }, push: { sent: true } });
  let seen = null; const ask = (best, conf) => async (prompt, imgs) => { seen = { prompt, n: imgs.length, data: imgs.every((u) => /^data:image\/jpeg;base64,/.test(u)) }; return { best, confidence: conf, seen: "engines lit" }; };
  const box = { id: "static" };
  let h = mk(); let r = await bf.upgradeEntry(h, box, { root, ask: ask(2, 0.9) });
  check(r.swapped && h.media_override.image === "images/99-frame.jpg" && fs.existsSync(path.join(root, "images/99-frame.jpg")) && h.media_override.thumb === "images/thumb.jpg", "Grok picks a frame (conf 0.9) → frame saved under images/ and set as the card picture");
  check(seen && seen.n === 4 && seen.data && /engines clearly lit/.test(seen.prompt), "one Grok call: current thumbnail + 3 candidate frames, static-fire target in the prompt");
  check(h.media_override.post_url === "https://x.com/a/status/99" && h.media_override.author === "a" && h.text === mk().text, "card still links to the original post, credit and text unchanged");
  check(Math.abs(h.media_override.frame.t - 7) <= 2.5, "the chosen frame is from the lit section");
  h = mk(); r = await bf.upgradeEntry(h, box, { root, ask: ask(2, 0.6) });
  check(!r.swapped && h.media_override.image === "images/thumb.jpg", "confidence < 0.7 → thumbnail kept");
  h = mk(); r = await bf.upgradeEntry(h, box, { root, ask: ask(1, 0.95) });
  check(!r.swapped && h.media_override.image === "images/thumb.jpg", "Grok prefers the current picture → no swap (upgrades only)");
  h = mk(); r = await bf.upgradeEntry(h, box, { root, ask: async () => { throw new Error("down"); } });
  check(!r.swapped && h.media_override.image === "images/thumb.jpg" && !h.frameChecked, "Grok failure → thumbnail kept, retried next run");
  h = mk(); h.media_override.keep_image = true; let called = false;
  r = await bf.upgradeEntry(h, box, { root, ask: async () => { called = true; return { best: 2, confidence: 1 }; } });
  check(!r.swapped && !called, "keep_image (manual pick) → never replaced, no Grok call");

  // no push on an image swap
  const road = { categories: [{ id: "static", history: [mk()] }] }; const before = JSON.stringify(road.categories[0].history[0].push);
  const notifications = []; const files = await bf.upgradeCards(road, [{ box: road.categories[0], entry: road.categories[0].history[0] }], { root, ask: ask(2, 0.9), notifications });
  check(files.length === 1 && notifications.length === 0 && JSON.stringify(road.categories[0].history[0].push) === before, "image swap: no notification created, the entry's push record untouched");
  const cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
  const iBuild = cr.indexOf("notifications.push(pushSync.stampRoadEntry"), iFrame = cr.indexOf("bestFrame.upgradeCards("), iSend = cr.indexOf("for (const n of notifications) await pushSync.sendPush");
  check(iBuild > 0 && iFrame > iBuild && iSend > iFrame && !/notifications\.push/.test(cr.slice(iFrame, cr.indexOf("\n  }\n", iFrame))), "check-road: best frame runs after the pushes are built and adds none (image swaps never push)");
  check(/commit\(\["road\.json", \.\.\.frameFiles\]/.test(cr), "check-road commits the saved frames with road.json");
  let mm = 0; const cnt = await bf.upgradeCards({}, Array.from({ length: 6 }, () => ({ box, entry: mk() })), { root, ask: async () => { mm++; return { best: 1, confidence: 0.9, seen: "" }; } });
  check(mm === 3 && cnt.length === 0, "API budget: at most 3 Grok calls per run");

  // B22 static fire card
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  const sec = live.categories.find((c) => c.id === "static"), card = sec.history.find((x) => x.id === "x-2111327584122437857");
  // not tied to the exact live wording (the bot may reword it): the card is found by id, is the B22 static fire, and the section summary follows its Flight Log line
  check(card && /\b(Booster 22|B22)\b/.test(card.x_text || card.text) && /static fire/i.test(card.x_text || card.text) && card.log_text && sec.log_latest === card.log_text, "B22 card (by entry id) is the B22 static fire and the section summary uses its Flight Log line");
  check(card.media_override.image === "images/b22-static-fire.jpg" && card.media_override.keep_image && fs.existsSync(path.join(ROOT, card.media_override.image)) && card.media_override.post_id === "2114347288739098706" && card.media_override.author === "NASASpaceflight", "B22 card: lit-engines frame, keep_image, still the NSF post + credit");
  const sc = bf.scoreFile(path.join(ROOT, card.media_override.image), "static");
  check(sc.plume > 0.2, `B22 card picture shows a lit plume (plume ${sc.plume.toFixed(2)})`);
  // no clock time on Road page cards
  const bad = []; for (const c of live.categories) for (const x of c.history || []) for (const v of [x, ...(x.updates || [])]) for (const k of ["date", "log_date"]) if (v[k] && /\d:\d\d|\bUK\b/.test(v[k])) bad.push(`${c.id} ${v[k]}`);
  check(!bad.length, `no clock time in any Road card date (${bad.join(", ") || "none"})`);
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8"); const fn = (n) => { const i = app.indexOf(`function ${n}(`); return i < 0 ? "" : app.slice(i, app.indexOf("\n}\n", i) + 2); };
  const paths = ["FeedPost", "FeedBuildUp", "CreditLine"].map(fn).join("\n");
  check(paths.length > 200 && !/feedTime\(|fmtTimeLondon\(|fmtDateTimeLondon\(|ukStamp\([^)]*\)(?<!false\))/.test(paths), "Road card render paths (card, earlier updates, credit) never format a clock time themselves (same-day Earlier updates times come only from roadUpdates)");
  check(/ukStamp\(iso, false\)/.test(app.match(/const entryDate = [^\n]+/)[0]), "entryDate: single day, e.g. '25 Oct'");
  fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true });
  console.log(fails ? `\n❌ ${fails} failed` : "\n✅ all passed"); process.exit(fails ? 1 : 0);
})();
