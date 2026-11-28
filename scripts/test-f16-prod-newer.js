#!/usr/bin/env node
/* No production beat or history entry newer than the preview snapshot is lost
   or hidden by the review layer. Starts from committed production road.json
   plus recorded fixture sources — never a hand-edited preview road. */
"use strict";
const fs = require("fs");
const path = require("path");
const RR = require("./review-rules.js");
const { appFns } = require("./app-fns-test-helper.js");
const ROOT = path.join(__dirname, "..");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-sources.json"), "utf8"));
const lox = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-lox-feed-item.json"), "utf8"));
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/preview-snapshot.json"), "utf8"));
const extra = lox.feed_item ? [lox.feed_item] : [lox];
const logs = [];
const liveForApply = structuredClone(live);
for (const f of liveForApply.feed_items || []) delete f.card_hide;
const { road, pills, beats } = RR.applyToRoad(liveForApply, {
  sources, extraFeedItems: extra, log: (s) => logs.push(String(s))
});
const fails = [];
function check(cond, msg) { if (!cond) { fails.push(msg); console.log("FAIL " + msg); } else console.log("ok   " + msg); }

const cutoff = Date.parse(snap.cutoff_at);
check(Number.isFinite(cutoff), "preview snapshot has a parseable cutoff_at (" + snap.cutoff_at + ")");

const rawHistory = [];
for (const c of live.categories || []) {
  for (const h of c.history || []) {
    rawHistory.push({ cat: c.id, id: h.id, url: h.url, at: h.at, date: h.date, text: h.text || h.card_text || "", hardware: h.hardware, flight: h.flight, updates: h.updates || [] });
  }
}
const rawFeed = (live.feed_items || []).map((f) => ({
  id: f.id, at: f.at, date: f.date, box: f.box, flight: f.flight, body: f.body || f.text || "", url: f.url
}));

// Every production history entry is still represented after review: same id, or
// its post url still sits on a history row, update, or review beat (ids may be
// rewritten when review merges a same-day event onto a stronger source).
const reviewedBlob = JSON.stringify({
  categories: road.categories, beats, pills, feed_items: road.feed_items
});
function historyKept(h) {
  const cats = road.categories || [];
  if (cats.some((c) => (c.history || []).some((x) => x.id === h.id || (h.url && x.url === h.url)
    || (x.updates || []).some((u) => u.url === h.url || u.id === h.id)))) return true;
  if (h.url && reviewedBlob.includes(h.url)) return true;
  if (h.id && reviewedBlob.includes(h.id)) return true;
  return false;
}
for (const h of rawHistory) {
  check(historyKept(h), "history " + h.id + " (" + h.cat + " " + h.date + ") still represented after review");
}

// Every production feed item still exists (may be card_hide, but not deleted).
for (const f of rawFeed) {
  const found = (road.feed_items || []).find((x) => x.id === f.id);
  check(!!found, "feed_item " + f.id + " (" + f.date + ") still present after review");
}

const itemAt = (it) => {
  const t = Date.parse(it.at || "");
  if (Number.isFinite(t)) return t;
  // day-only labels: treat the named calendar day as 00:00 UTC
  const m = String(it.date || "").match(/(\d{1,2}) (\w{3})/);
  if (!m) return NaN;
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = months.indexOf(m[2]);
  return mi < 0 ? NaN : Date.UTC(2026, mi, Number(m[1]));
};

const newerHist = rawHistory.filter((h) => Number.isFinite(itemAt(h)) && itemAt(h) >= cutoff);
const newerFeed = rawFeed.filter((f) => Number.isFinite(itemAt(f)) && itemAt(f) >= cutoff);
check(newerHist.length + newerFeed.length > 0,
  "preview snapshot cutoff leaves newer production items to check (history " + newerHist.length + ", feed " + newerFeed.length + ")");

function cardBlob(cards) {
  return cards.filter((c) => !c.empty && c.h).map((c) => {
    const h = c.h;
    const rows = (h.updates || []).map((u) => u.text || u.card_text || "").join("\n");
    return [c.id, h.text, h.card_text, h.url, h.id, rows].join("\n");
  }).join("\n---\n");
}

appFns(["rtfCards"], ({ rtfCards }) => {
  const cards = rtfCards(road).filter((c) => !c.empty && c.h);
  const blob = cardBlob(cards);

  // Newer F16 history entries that name a vehicle (or pad) must appear on a Page 2 card
  // (headline or Earlier updates), not be swallowed by review.beats replacement.
  for (const h of newerHist) {
    if (h.flight && h.flight !== live.flight) continue;
    const named = /\b(?:Booster|Ship)\s+\d{2,3}\b|\bPad\s*\d\b/i.test(h.text + " " + (h.hardware || ""));
    if (!named) continue;
    const hit = cards.some((c) => {
      const t = ((c.h && (c.h.text || c.h.card_text)) || "") + " " + ((c.h && c.h.updates) || []).map((u) => u.text || u.card_text || "").join(" ");
      const urls = [c.h && c.h.url, c.h && c.h.id, ...((c.h && c.h.updates) || []).map((u) => u.url || u.id)].join(" ");
      return (h.id && (c.h.id === h.id || String(c.h.beatId || "").includes(h.id) || urls.includes(h.id)))
        || (h.text && t.includes(h.text.slice(0, 40)));
    });
    check(hit, "newer history " + h.id + " (" + h.cat + " " + h.date + ": " + h.text.slice(0, 70) + ") is on a Page 2 card after review");
  }

  // Newer current-flight feed items: visible on a card, or explicitly card_hide with a review reason.
  for (const f of newerFeed) {
    if (Number.isInteger(f.flight) && f.flight !== live.flight) continue;
    const after = (road.feed_items || []).find((x) => x.id === f.id);
    const hidden = !!(after && after.card_hide);
    const onCard = /scrapp|lox landing tank test article/i.test(f.body) ? false : blob.includes((f.body || "").slice(0, 40));
    if (hidden) {
      const reasoned = logs.some((l) => l.includes(f.id) && /hide feed|ABOUT|card_hide/i.test(l));
      check(reasoned, "newer feed " + f.id + " is card_hide with an explicit review reason (got logs mentioning it: " + logs.filter((l) => l.includes(f.id)).join(" | ") + ")");
      check(!blob.includes((f.body || "").slice(0, 40)),
        "newer feed " + f.id + " is classified hidden and does not appear on a Page 2 vehicle card");
    } else if (f.box && /\b(?:Booster|Ship)\s+\d{2,3}\b|\bPad\s*\d\b/i.test(f.body)) {
      check(onCard || blob.includes(f.id), "newer boxed feed " + f.id + " (" + f.date + ": " + (f.body || "").slice(0, 60) + ") is visible on a Page 2 card");
    } else {
      check(!!after, "newer feed " + f.id + " kept in feed_items (no vehicle box, not required on a vehicle card)");
    }
  }

  // The 26 Nov Massey's scrap: classified, not a B23 cryo headline, does not change cryo rounds/status.
  const scrap = (road.feed_items || []).find((x) => x.id === "news-mwwwnefk-9cc4c1");
  check(scrap && scrap.card_hide === true, "26 Nov LOX test-article scrap is kept and card_hide (got " + (scrap && scrap.card_hide) + ")");
  const b23 = cards.find((c) => c.id === "rtf-cryo-B23");
  const b23Text = b23 && ((b23.h.card_text || b23.h.text || "") + " " + ((b23.h.updates || []).map((u) => u.text).join(" ")));
  check(b23 && !/test article was scrapped|lox landing tank test article/i.test(b23Text),
    "26 Nov scrap does not appear on the B23 cryo card (headline " + (b23 && (b23.h.card_text || b23.h.text)) + ")");
  const cryoCat = (road.categories || []).find((c) => c.id === "cryo");
  check(cryoCat && (cryoCat.status === "done" || cryoCat.status === "complete") && /both vehicles done/i.test(cryoCat.latest || ""),
    "B23 cryo box status is still complete after review (got " + (cryoCat && cryoCat.status + " / " + cryoCat.latest) + ")");
  const cryoPills = (pills || []).filter((p) => p.box === "cryo" && (p.vehicleId === "B23" || p.vehicle === "Booster 23"));
  check(cryoPills.every((p) => !/scrap|test article/i.test(p.text || p.label || "")),
    "26 Nov scrap does not create a B23 cryo pill (pills: " + cryoPills.map((p) => p.label + " · " + p.text).join(" | ") + ")");
  const staticHit = cards.find((c) => c.id === "rtf-static-B23");
  check(staticHit && /preparing for static fire/i.test(staticHit.h.card_text || staticHit.h.text || ""),
    "newer 26 Nov static-prep history remains the B23 static card (got " + (staticHit && (staticHit.h.card_text || staticHit.h.text)) + ")");
  return true;
});

if (fails.length) { console.error("\n" + fails.length + " failure(s)"); process.exit(1); }
console.log("\nAll f16-prod-newer checks passed.");
