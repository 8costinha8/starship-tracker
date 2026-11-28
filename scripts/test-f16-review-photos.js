#!/usr/bin/env node
/* Preview: live cryo/raptor photos that map to Page 2 beats stay on those beats.
   Raptor defaults never replace a keep_image or a real beat image. */
"use strict";
const fs = require("fs");
const path = require("path");
const RR = require("./review-rules.js");
const { appFns } = require("./app-fns-test-helper.js");
const ROOT = path.join(__dirname, "..");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-sources.json"), "utf8"));
const lox = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-lox-feed-item.json"), "utf8"));
const extra = lox.feed_item ? [lox.feed_item] : [lox];

function hasImg(h) {
  if (!h) return false;
  if (h.media_override && h.media_override.image && !h.media_override.credit_only) return true;
  if (h.x_post && h.x_post.media && h.x_post.media.length) return true;
  if (h.image && (h.image.url || typeof h.image === "string")) return true;
  if (h.keep_image) return true;
  return false;
}
function imgOf(h) {
  if (!h) return "";
  if (h.media_override && h.media_override.image) return String(h.media_override.image);
  if (h.image && h.image.url) return h.image.url;
  if (typeof h.image === "string") return h.image;
  if (h.x_post && h.x_post.media && h.x_post.media[0]) return h.x_post.media[0].url || h.x_post.media[0].preview_url || "";
  return "";
}

const fails = [];
function check(cond, msg) { if (!cond) { fails.push(msg); console.log("FAIL " + msg); } else console.log("ok   " + msg); }

const livePhotos = [];
for (const c of live.categories || []) {
  if (c.id !== "cryo" && c.id !== "raptor") continue;
  for (const h of c.history || []) {
    if (h.kind === "check" || !hasImg(h)) continue;
    const hw = String(h.hardware || "").replace(/^Booster\s*/i, "B").replace(/^Ship\s*/i, "S");
    if (hw !== "B23" && hw !== "S43") continue;
    livePhotos.push({ box: c.id, hw, date: h.date, id: h.id, url: h.url, img: imgOf(h), keep: !!(h.media_override && h.media_override.keep_image), h });
  }
}
check(livePhotos.length >= 5, "live road has current-vehicle cryo/raptor photos to keep (got " + livePhotos.length + ")");

const { road, beats } = RR.applyToRoad(structuredClone(live), { sources, extraFeedItems: extra, log: () => {} });

for (const lp of livePhotos) {
  const beat = beats.find((b) => b.vehicleId === lp.hw && (b.date === lp.date || (lp.date === "16 Oct" && b.date === "15 Oct") || (lp.date === "18 Oct" && b.box === "raptor")))
    || beats.find((b) => lp.url && b.url === lp.url);
  // 16 Oct live may have been rewritten to 15 Oct; 18 Oct refiled cryo→raptor
  if (!beat) {
    // photo may land on a same-day / nearby beat via writeHistory even if kind/date shifted
    const near = beats.filter((b) => b.vehicleId === lp.hw);
    const got = near.some(hasImg);
    check(got, "photo from live " + lp.hw + " " + lp.date + " " + lp.id + " is on a generated beat or history");
    continue;
  }
  check(hasImg(beat), "beat " + lp.hw + " " + beat.date + " keeps a photo from live " + lp.date + " (" + lp.id + ")");
}

const b28 = beats.find((b) => b.vehicleId === "B23" && b.date === "28 Oct");
const b30 = beats.find((b) => b.vehicleId === "B23" && b.date === "30 Oct");
check(b28 && hasImg(b28), "B23 28 Oct keep_image beat still has a photo");
check(b30 && hasImg(b30), "B23 30 Oct return shows a photo (28 Oct Bernardo pick as fallback)");

const s22 = beats.find((b) => b.vehicleId === "S43" && b.date === "22 Oct");
check(s22 && hasImg(s22), "S43 22 Oct beat keeps the live Bettybronxton / same-day photo");

appFns(["rtfCards"], ({ rtfCards }) => {
  const cards = rtfCards(road);
  const cryoB23 = cards.filter((c) => c.cat && /cryo/i.test(c.cat.id || c.cat.name || "") && /B23|Booster 23/.test(JSON.stringify(c.h && (c.h.hardware || c.cat.name || ""))));
  const all = cards.filter((c) => c.h && !c.empty);
  for (const c of all) {
    const h = c.h;
    if (h.media_override && h.media_override.keep_image) {
      check(!!h.media_override.image, "rtfCards keeps keep_image: " + (h.id || h.date));
    }
  }
  const raptorS43 = all.find((c) => c.cat && /raptor/i.test(c.cat.id || "") && /S43|Ship 43/.test((c.cat.name || "") + (c.h && c.h.hardware || "")));
  if (raptorS43) {
    const img = imgOf(raptorS43.h);
    check(/ship-raptor-default/i.test(img), "S43 raptor Page 2 uses the ship raptor default photo: " + img);
  }
  const raptorWithReal = all.filter((c) => c.cat && /raptor/i.test(c.cat.id || "") && c.h && c.h.media_override && c.h.media_override.keep_image);
  for (const c of raptorWithReal) {
    check(!/raptor-default/i.test(imgOf(c.h)), "default does not replace keep_image on " + c.h.id);
  }
  return true;
});

if (fails.length) { console.error("\n" + fails.length + " failure(s)"); process.exit(1); }
console.log("\nAll F16 review photo fixtures passed.");
