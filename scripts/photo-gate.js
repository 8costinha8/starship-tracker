/* Photo sanity gate before a card picture is published (24 Nov, Bernardo via Tusk). Node (require) and browser (window.PhotoGate).
   A picture must clearly show the named vehicle type (ship vs booster), be reasonably bright and sharp, and not be a
   webcam / livestream overlay frame. If it is not confidently good: ship cryo cards show images/ship-cryo.jpg, other cards use
   the same-vehicle fallback photo or no photo. A manual pick by Bernardo (keep_image, see media-lock.js) is never gated.
   Cheap local checks (no API cost):
     - webcam / livestream: a video poster from a live-camera account (LabPadre, NASASpaceflight), or a post whose credit
       line names a live stream ("📷NSF | Starbase Live", "nsf.live", "LabPadre cam", "livestream", "webcam")
     - aspect: wider than 2.4:1 or taller than 1:2 (banner / overlay strips, phone screen grabs)
     - pixels (Node only, ffmpeg, when the file is at hand): mean luma < DARK (48/255) → too dark; Laplacian variance < BLUR (30)
       → too blurry, both on a 160×90 grey scale.
   Vision: the existing image check call (check-road.js pickImage, and media-watch's media_upgrade call) also returns
   vehicle_type / dark_or_blurry / webcam_overlay in the SAME request (no new call, no new key; a few extra output tokens);
   visionOk() reads those fields. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.PhotoGate = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const WEBCAM_HANDLES = ["labpadre", "nasaspaceflight"];
  const LIVE_CREDIT = /starbase live|nsf\.live|📷\s*nsf\b|📸\s*nsf\b|\blabpadre (?:cam|rover|sapphire|nerdle)|\blive ?stream|\bwebcam\b|\blive cam(?:era)?\b|\bstream (?:grab|capture|screenshot)/i;
  const DARK = 36, BLUR = 30, RED_BAND = 0.45; // DARK 36 (24 Nov): 42 flagged a good StarshipGazer night shot; RED_BAND: NSF Starbase Live ticker / label
  const lc = (s) => String(s || "").toLowerCase().replace(/^@/, "");
  const isVideoThumb = (url) => /video_thumb|ext_tw_video|amplify_video/i.test(String(url || ""));
  function wantType(text, hardware) {
    const hw = String(hardware || "");
    if (/^S\d/i.test(hw)) return "ship"; if (/^B\d/i.test(hw)) return "booster";
    const t = String(text || ""); const s = /\b(?:ship|s)\s?\d{2,3}\b/i.test(t), b = /\b(?:booster|b)\s?\d{2,3}\b/i.test(t);
    return s && b ? "both" : s ? "ship" : b ? "booster" : /\bpad\b|\btower\b|\bchopsticks?\b/i.test(t) ? "pad" : null;
  }
  // photo: { image, type, author, post_text, width, height, keep_image, stats: { mean, lapvar } }
  function localCheck(photo) {
    const p = photo || {}, reasons = [];
    if (p.keep_image) return { ok: true, reasons, manual: true };
    if (!p.image) return { ok: false, reasons: ["no image"] };
    const video = p.type === "video" || isVideoThumb(p.image);
    if (video && WEBCAM_HANDLES.includes(lc(p.author))) reasons.push("webcam / livestream frame (" + lc(p.author) + " video)");
    else if (LIVE_CREDIT.test(String(p.post_text || ""))) reasons.push("webcam / livestream frame (credit names a live stream)");
    if (p.width && p.height) { const r = p.width / p.height; if (r > 2.4 || r < 0.5) reasons.push(`odd aspect ${r.toFixed(2)}`); }
    if (p.stats) {
      if (Number.isFinite(p.stats.mean) && p.stats.mean < DARK) reasons.push(`too dark (mean ${Math.round(p.stats.mean)})`);
      if (Number.isFinite(p.stats.lapvar) && p.stats.lapvar < BLUR) reasons.push(`too blurry (laplacian ${Math.round(p.stats.lapvar)})`);
      if (Number.isFinite(p.stats.red_bottom) && p.stats.red_bottom >= RED_BAND) reasons.push(`livestream ticker band (red bottom band ${p.stats.red_bottom.toFixed(2)})`);
      else if (Number.isFinite(p.stats.red_topleft) && p.stats.red_topleft >= RED_BAND) reasons.push(`livestream label (red top-left ${p.stats.red_topleft.toFixed(2)})`);
    }
    return { ok: !reasons.length, reasons };
  }
  // Vision verdict fields from the existing image-check call; missing fields are not held against the photo.
  function visionOk(v, want) {
    const reasons = [];
    if (!v) return { ok: true, reasons };
    const vt = String(v.vehicle_type || "").toLowerCase();
    if (want && vt && vt !== "unclear" && !(vt === want || vt === "both" || (want === "both" && (vt === "ship" || vt === "booster")) || (want === "pad" && /pad|tower/.test(vt)))) reasons.push(`shows a ${vt}, card is about a ${want}`);
    if (want && (vt === "none" || vt === "unclear")) reasons.push(`vehicle type ${vt}`);
    if (v.dark_or_blurry === true) reasons.push("vision: dark or blurry");
    if (v.webcam_overlay === true) reasons.push("vision: webcam / overlay frame");
    return { ok: !reasons.length, reasons };
  }
  const VISION_FIELDS = { vehicle_type: { type: "string", enum: ["ship", "booster", "both", "pad", "none", "unclear"] }, dark_or_blurry: { type: "boolean" }, webcam_overlay: { type: "boolean" } };
  const VISION_ASK = `Also: "vehicle_type": which Starship vehicle the picture clearly shows ("ship" = the upper stage, "booster" = Super Heavy, "both", "pad" = pad/tower structures only, "none", "unclear"); "dark_or_blurry": true if the picture is too dark or too blurry to read; "webcam_overlay": true if it is a webcam / livestream frame (on-screen clock, ticker, logo bug, multi-camera layout).`;
  // Node only: grey 160×90 luma mean + Laplacian variance via ffmpeg (null when ffmpeg or the file is missing).
  // Node only: 160×90 luma mean + Laplacian variance, plus the share of saturated-red pixels in the bottom band (rows 83–89:
  // NSF's red news ticker) and the top-left label box (Starbase Live) via ffmpeg (null when ffmpeg or the file is missing).
  function pixelStats(file) {
    try {
      const { spawnSync } = require("child_process");
      const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "scale=160:90,format=rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
      if (r.status !== 0 || !r.stdout || r.stdout.length < 160 * 90 * 3) return null;
      return statsOf(r.stdout, 160, 90);
    } catch { return null; }
  }
  function statsOf(rgb, W, H) {
    const b = new Float64Array(W * H); let sum = 0;
    const red = (i) => rgb[3 * i] > 150 && rgb[3 * i + 1] < 90 && rgb[3 * i + 2] < 90;
    let rb = 0, rbN = 0, rt = 0, rtN = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; b[i] = 0.299 * rgb[3 * i] + 0.587 * rgb[3 * i + 1] + 0.114 * rgb[3 * i + 2]; sum += b[i];
      if (y >= Math.round(H * 0.922)) { rbN++; if (red(i)) rb++; }
      if (y < Math.round(H * 0.06) && x < Math.round(W * 0.12)) { rtN++; if (red(i)) rt++; } }
    const lap = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; lap.push(4 * b[i] - b[i - 1] - b[i + 1] - b[i - W] - b[i + W]); }
    const m = lap.reduce((a, c) => a + c, 0) / lap.length, v = lap.reduce((a, c) => a + (c - m) * (c - m), 0) / lap.length;
    return { mean: sum / (W * H), lapvar: v, red_bottom: rbN ? rb / rbN : 0, red_topleft: rtN ? rt / rtN : 0 };
  }
  return { localCheck, visionOk, wantType, pixelStats, statsOf, RED_BAND, isVideoThumb, VISION_FIELDS, VISION_ASK, WEBCAM_HANDLES, LIVE_CREDIT, DARK, BLUR };
});
