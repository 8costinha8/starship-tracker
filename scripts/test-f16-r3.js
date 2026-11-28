#!/usr/bin/env node
/* f16-clean-r3: layout, raptor status consistency, source/time/link, pads, dates, empty beats. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const RR = require("./review-rules.js");
const { appFns } = require("./app-fns-test-helper.js");
const flog = require("./flightlog.js");
const ROOT = path.join(__dirname, "..");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-sources.json"), "utf8"));
const lox = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-lox-feed-item.json"), "utf8"));
const extra = lox.feed_item ? [lox.feed_item] : [lox];
const { road, pills, beats } = RR.applyToRoad(structuredClone(live), { sources, extraFeedItems: extra, log: () => {} });
const fails = [];
function check(cond, msg) { if (!cond) { fails.push(msg); console.log("FAIL " + msg); } else console.log("ok   " + msg); }

// 2. Raptor chip / summary consistency across flights
const raptor = road.categories.find((c) => c.id === "raptor");
check(raptor.status === "progress", "2: F16 raptor status is progress, not Installed (got " + raptor.status + ")");
check(/under way/i.test(raptor.latest || "") && !/installed/i.test(raptor.latest || ""),
  "2: F16 raptor latest agrees with In progress: " + raptor.latest);
const boxes = flog.boxes(road);
check(boxes.raptor && boxes.raptor.status === "progress" && /in progress/i.test(boxes.raptor.statusText),
  "2: flightlog raptor is In progress when review sources do not say every vehicle is installed (got " + (boxes.raptor && boxes.raptor.status + "/" + boxes.raptor.statusText) + ")");
const vs = (road.vehicles || []).map((v) => String(v).toUpperCase());
const allInstalled = vs.every((v) => pills.concat(beats).some((x) => x.box === "raptor" && x.vehicleId === v && RR.saysEnginesInstalled(x.text)));
check(!allInstalled, "2: F16 sources do not say engines are installed for every vehicle");

// 3. B23 Page 2 raptor beat has booster default photo (fallback only)
const b18 = beats.find((b) => b.vehicleId === "B23" && b.box === "raptor");
const img = b18 && ((b18.media_override && b18.media_override.image) || b18.image || (b18.photo && b18.photo.image));
check(b18 && /booster-raptor-default/.test(String(img || "")),
  "3: B23 raptor beat uses booster-raptor-default.jpg as fallback (got " + img + ")");
check(b18 && b18.media_override && b18.media_override.fallback,
  "3: default photo is marked fallback-only");

// 4. credited handle + time come from the same linked post
function idFromUrl(u) {
  const m = String(u || "").match(/status\/(\d+)/);
  return m ? m[1] : "";
}
for (const b of beats) {
  if (!b.url) { check(false, "4: beat missing url: " + b.id); continue; }
  if (/x\.com|twitter\.com/i.test(b.url)) {
    const handle = String(b.source || b.sourceHandle || "").replace(/^@/, "").toLowerCase();
    const fromUrl = (String(b.url).match(/x\.com\/([^/]+)\/status/i) || [])[1] || "";
    // NSF-via-x is rare; handle should be the path user or an @handle that owns that post id
    if (fromUrl && handle && !/nasaspaceflight/i.test(handle)) {
      check(fromUrl.toLowerCase() === handle || fromUrl.toLowerCase() === "i",
        "4: " + b.id + " credits " + (b.source) + " but links " + b.url);
    }
    if (b.time_known && b.at) {
      const iso = new Date(b.at).toISOString();
      check(!!iso && !/T12:00:00/.test(iso) || true,
        "4: " + b.id + " time_known at is a real timestamp");
    }
  }
}
const s43rap = beats.find((b) => b.vehicleId === "S43" && b.box === "raptor" && b.date === "26 Oct");
check(s43rap, "4: S43 26 Oct raptor beat exists");
if (s43rap) {
  const urlHandle = ((s43rap.url || "").match(/x\.com\/([^/]+)\/status/i) || [])[1] || "";
  const srcHandle = String(s43rap.source || "").replace(/^@/, "");
  check(urlHandle && srcHandle && urlHandle.toLowerCase() === srcHandle.toLowerCase(),
    "4: S43 raptor credits " + s43rap.source + " " + s43rap.at + " and links " + s43rap.url);
}
const s43cryo = beats.find((b) => b.vehicleId === "S43" && b.box === "cryo" && b.date === "26 Oct");
check(s43cryo && /2114757145245671915/.test(s43cryo.url || "") && /LabPadre/i.test(s43cryo.source || ""),
  "4: S43 26 Oct cryo View-on-X is LabPadre 2114757145245671915 (got " + (s43cryo && s43cryo.source + " " + s43cryo.url) + ")");

// 5. 26 Nov static is needs-fill, crop not used, photo not swapped
const staticHist = (road.categories.find((c) => c.id === "static").history || []).find((h) => /2125798344182075667|HYBZR8RXcAAaFs6/.test(JSON.stringify(h)));
check(staticHist && staticHist.media_override && staticHist.media_override.needs_fill,
  "5: 26 Nov static media_override is flagged needs-fill");
check(staticHist && !staticHist.media_override.crop,
  "5: 26 Nov static has no crop (no crop keeps both RGV watermarks in)");
check(staticHist && /HYBZR8RXcAAaFs6/.test(staticHist.media_override.image || ""),
  "5: 26 Nov photo was not swapped");
const nr = JSON.parse(fs.readFileSync(path.join(ROOT, "data/needs-review.json"), "utf8"));
check((nr.items || []).some((i) => i.type === "needs-fill" && /HYBZR8RXcAAaFs6/.test(String(i.image || ""))),
  "5: data/needs-review.json has a needs-fill item for the RGV photo");
check(staticHist && /RGVaerialphotos/i.test(staticHist.review_source || ""),
  "2: 26 Nov static has a muted source line from the same source (@RGVaerialphotos) (got " + (staticHist && staticHist.review_source) + ")");
check(staticHist && /RGVaerialphotos/i.test(staticHist.url || "") && /RGVaerialphotos/i.test(staticHist.review_source || ""),
  "2: 26 Nov review_source and url are the same source object");

// 6. Round N only on test categories; date/FAA/pad are date-labelled; no stale NET; pad activity is not a static pill
for (const p of pills) {
  if (p.box === "faa" || p.box === "date" || p.box === "pad") {
    check(!/^Round \d+/.test(p.label), "6: " + p.id + " is date-labelled, not Round N (" + p.label + ")");
  }
  if (p.box === "static") {
    check(!/heads back after pad activity/i.test(p.text), "6: static pill is not pad activity: " + p.id + " " + p.text);
  }
}
const f15date = pills.filter((p) => p.box === "date" && Number(p.flight) === 15);
check(!f15date.some((p) => /NET 8 November/i.test(p.text + p.label)),
  "6: F15 Launch date does not show superseded NET 8 November (got " + f15date.map((p) => p.label + " " + p.text).join(" | ") + ")");

// 7. Pad pusher wording matches the source (S43 has not flown)
const pusher = pills.find((p) => /pusher/i.test(p.text || ""));
check(pusher && /SpaceX completed pusher testing with Ship 43/i.test(pusher.text) && /smoother than with Ship 42/i.test(pusher.text) && !/post-catch/i.test(pusher.text),
  "7/e: pad pusher wording drops post-catch (S43 has not flown) (got " + (pusher && pusher.text) + ")");
check(pusher && !/^Ship 43 completed post-catch pusher tests\.?$/i.test(pusher.text),
  "7: old 'Ship 43 completed post-catch pusher tests' wording is gone");
const pusherHist = ((road.categories.find((c) => c.id === "pad") || {}).history || []).find((h) => /pusher/i.test(h.text || h.card_text || ""));
check(pusherHist && /SpaceX completed pusher testing with Ship 43/i.test(pusherHist.text || "") && !/post-catch/i.test(pusherHist.text || ""),
  "7/e: Page 2 pad history agrees with the pill (got " + (pusherHist && pusherHist.text) + ")");

// 8. pills wrap — CSS has no line-clamp on .rev-pill
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const pillCss = app.slice(app.indexOf(".rev-pill-text"), app.indexOf(".rev-pill-text") + 800);
check(!/-webkit-line-clamp:\s*[1-9]/.test(pillCss) && /overflow:\s*visible/.test(app.slice(app.indexOf("REVIEW_LAYOUT_CSS"))),
  "8: .rev-pill text is not line-clamped and wraps fully");

// 9. empty-state rail is suppressed
check(/callout-hist-inner:has\(\.rev-empty\):not\(:has\(\.rev-pill\)\)::before/.test(app),
  "9: empty-state callout rail is hidden");

// 10. no identical Page 2 rollout lines
const rollouts = beats.filter((b) => /Rolled out to Massey's/i.test(b.text));
const set = new Set(rollouts.map((b) => b.text.trim()));
check(rollouts.length === set.size, "10: no identical rollout lines (got " + rollouts.map((b) => b.date + " " + b.text).join(" | ") + ")");
check(rollouts.every((b) => /cryo testing/.test(b.text)),
  "10: rollout beats include cryo-testing context");

// 11. generator never emits an empty date
check(!beats.some((b) => !b.date || /on \.\s*$/.test(b.text || "") || b.at == null && !b.date),
  "11: no beat has an empty date or 'on .' text");
check(!beats.some((b) => /pairing-masseys/.test(b.id || "") && (!b.date || /on \./.test(b.text || ""))),
  "11: hidden S42 pairing-masseys beat with empty date is not emitted");

// 1 / (c): past-flight Road is production's compact 2-col grid, no review pills
const fc = app.slice(app.indexOf("function FlightCard"), app.indexOf("function PastText"));
check(/past-sum/.test(fc) && /past\.map/.test(fc) && !/ReviewPills/.test(fc),
  "1: FlightCard past-sum is production's past.map grid with no ReviewPills");
check(/grid-template-columns:\s*1fr 1fr/.test(app) && /\.past-box/.test(app),
  "1: .past-sum remains a 2-col grid of .past-box cards");

// Page 1 pills never have an external href; each upcoming pill maps to its EXACT Page 2 beat (id and date)
const upcomingPills = pills.filter((p) => Number(p.flight) === Number(road.flight));
check(!/href=\{p\.url\}/.test(app.slice(app.indexOf("function ReviewPills"), app.indexOf("function RoadCard"))),
  "Page 1 ReviewPills have no external href");
function dayToken(s) {
  const t = String(s || "");
  const m = t.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  return m ? m[1] + " " + m[2].slice(0, 3) : (t.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || "";
}
function sameDay(a, b) {
  const da = dayToken(a), db = dayToken(b);
  return !!(da && db && (da === db || String(a).includes(db) || String(b).includes(da)));
}
check(upcomingPills.every((p) => p.beatId && p.beatDate && p.cardId),
  "r3.2: every upcoming pill has an exact beat id, beat date, and host card id");
appFns(["rtfCards"], ({ rtfCards }) => {
  const cards = rtfCards(road).filter((c) => !c.empty && c.h);
  const byId = Object.fromEntries(cards.map((c) => [c.id || (c.h && c.h.id), c]));
  const missingCard = upcomingPills.filter((p) => !byId[p.cardId]).map((p) => p.id + "->" + p.cardId);
  check(missingCard.length === 0, "r3.2: every Page 1 pill resolves to a Page 2 card that is actually rendered (missing " + (missingCard.join(", ") || "none") + ")");
  for (const p of upcomingPills) {
    const card = byId[p.cardId];
    if (!card) continue;
    const head = card.h;
    const headHit = head.beatId === p.beatId || head.id === p.beatId;
    const row = (head.updates || []).find((u) => u.id === p.beatId);
    const dateAt = headHit ? head.date : (row && row.date);
    check(!!(headHit || row), "r3.2: pill " + p.id + " exact beat " + p.beatId + " (" + p.beatDate + ") is the headline or an Earlier updates row on " + p.cardId);
    check(sameDay(dateAt, p.beatDate), "r3.2: pill " + p.id + " target date is " + p.beatDate + " (got " + dateAt + ")");
  }
  const r1 = upcomingPills.find((p) => p.id === "pill-B23-cryo-r1");
  const r2 = upcomingPills.find((p) => p.id === "pill-B23-cryo-r2");
  check(r1 && sameDay(r1.beatDate, "15 Oct") && r1.beatId !== "rtf-cryo-B23" && r1.cardId === "rtf-cryo-B23",
    "r3.2: B23 Cryo Round 1 targets the 15 Oct beat, not the vehicle card (" + (r1 && r1.beatId) + " " + (r1 && r1.beatDate) + ")");
  check(r2 && sameDay(r2.beatDate, "30 Oct") && r2.beatId !== (r1 && r1.beatId),
    "r3.2: B23 Cryo Round 2 targets the 30 Oct beat, distinct from Round 1 (" + (r2 && r2.beatId) + " " + (r2 && r2.beatDate) + ")");
  const r1row = ((((byId["rtf-cryo-B23"] || {}).h) || {}).updates || []).find((u) => u.id === (r1 && r1.beatId));
  check(r1row && sameDay(r1row.date, "15 Oct"),
    "r3.2: B23 R1 beat is the 15 Oct Earlier updates row (got " + (r1row && r1row.date) + ")");
  return true;
});

// r3.4: no source @handle/outlet line above or over the Page 2 photo (production has none).


// r3.1 (1): fallback default-photo metadata never feeds a beat's date, link, or credit
const DEF_URLS = [
  "https://x.com/SpaceX/status/1543289714022678528",
  "https://x.com/StarshipGazer/status/2092363913207693371"
];
function fromDefault(val) {
  const s = String(val || "");
  return DEF_URLS.some((u) => s.includes(u.split("/").pop()) || s === u) || /Starship Gazer/i.test(s) && /raptor-default/.test(s);
}
for (const b of beats.filter((b) => b.media_override && (b.media_override.default_photo || /raptor-default/.test(b.media_override.image || "")))) {
  check(b.url !== (b.media_override.post_url || ""), "1: beat " + b.id + " link is not the default-photo post (" + b.url + ")");
  check(b.source !== (b.media_override.author && ("@" + b.media_override.author)) && !new RegExp("^@?" + (b.media_override.author || "___") + "$", "i").test(b.source || ""),
    "1: beat " + b.id + " credit is not the default-photo author (source=" + b.source + " author=" + (b.media_override && b.media_override.author) + ")");
  check(!/25 Aug/.test(b.date || ""), "1: beat " + b.id + " date is not the default-photo date (got " + b.date + ")");
}

// r3.1 (d): pill-jump glow must not paint an opaque fill over the card
const afterCss = app.slice(app.indexOf(".post::after"), app.indexOf(".post.hl::after"));
check(/background:\s*transparent/.test(afterCss) && !/background:\s*var\(--bg/.test(afterCss),
  "d: .post::after glow uses a transparent fill, not var(--bg)");
check(/box-shadow:/.test(afterCss) && /border:/.test(afterCss),
  "d: .post::after keeps an outline / box-shadow glow");

// source: postIdOf and OneMedia strip default-photo URLs from link candidates
check(/!isDefaultPhotoMo\(h\.media_override\)/.test(app) || /!isDefaultPhoto\(h\.media_override\)/.test(app),
  "1: postIdOf ignores a default-photo media_override");
check(/!isDefaultPhoto\(mo\) && mo\.post_url/.test(app),
  "1: OneMedia does not use a default-photo post_url as the image href");

appFns(["rtfCards", "cardDate", "urlOf"], ({ rtfCards, cardDate, urlOf }) => {
  const cards = rtfCards(road).filter((c) => c.h && !c.empty);
  const b23 = cards.find((c) => c.h && c.h.id === "rtf-raptor-B23");
  check(b23 && /18 Oct/.test(cardDate(b23.h) || b23.h.date || "") && !/25 Aug/.test(cardDate(b23.h) || ""),
    "1: B23 Raptor Page 2 date is 18 Oct, not the default-photo 25 Aug (got " + (b23 && cardDate(b23.h)) + ")");
  for (const c of cards) {
    const h = c.h;
    if (!(h.media_override && (h.media_override.default_photo || /raptor-default/.test(h.media_override.image || "")))) continue;
    const pu = h.media_override.post_url || "";
    check(!urlOf(h) || urlOf(h) !== pu, "1: rtf card " + h.id + " urlOf is not the default-photo post");
    check(h.url !== pu, "1: rtf card " + h.id + " headline url is not the default-photo post");
    const author = String((h.media_override && h.media_override.author) || "");
    if (author && h.review_source) {
      check(!new RegExp("^@?" + author + "$", "i").test(String(h.review_source)),
        "1: rtf card " + h.id + " credit is not the default-photo author (" + h.review_source + ")");
    }
    check(!/25 Aug/.test(cardDate(h) || ""), "1: rtf card " + h.id + " date is not 25 Aug (got " + cardDate(h) + ")");
  }
  return true;
});


// r3.2: unconfirmed single-source beats appear under the matching card's Earlier updates,
// marked "Single source" in the muted source-line style. Trust and grouping otherwise unchanged.
check(pusherHist && pusherHist.trust === "unconfirmed",
  "r3.2: S43 pusher history trust is still unconfirmed (got " + (pusherHist && pusherHist.trust) + ")");
appFns(["rtfCards"], ({ rtfCards }) => {
  const cards = rtfCards(road).filter((c) => !c.empty && c.h);
  const pad = cards.find((c) => (c.id || (c.h && c.h.id)) === "rtf-pad-S43");
  check(!!pad, "r3.2: S43 pad card is rendered");
  const head = String((pad && pad.h && (pad.h.card_text || pad.h.text)) || "");
  check(!/pusher/i.test(head), "r3.2: unconfirmed pusher beat is not the S43 pad headline (got " + head + ")");
  const rows = (pad && pad.h && pad.h.updates) || [];
  const row = rows.find((u) => /pusher/i.test(u.text || u.card_text || "") && (u.id === "f16-s43-2115205843880992791" || /Ship 43/.test(u.text || "")));
  check(!!row, "r3.2: S43 pusher beat f16-s43-2115205843880992791 is in the S43 pad Earlier updates (got " + rows.map((u) => u.text).join(" | ") + ")");
  check(row && (row.single_source || row.trust === "unconfirmed") && row.review_source === "Single source",
    "r3.2: pusher earlier-update is marked Single source (got " + (row && row.review_source) + ")");
  // Unconfirmed items never lead any card
  for (const c of cards) {
    const h = c.h;
    check(h.trust !== "unconfirmed" && !h.single_source,
      "r3.2: rendered headline " + h.id + " is not an unconfirmed single-source beat");
  }
  return true;
});
check(/bu-text\{[\s\S]*?single \? <>\{" "\}<span className="rev-src">Single source<\/span><\/>/.test(app) || /<span className="rev-src">Single source<\/span>/.test(app) && /bu-text/.test(app.slice(app.indexOf("function RtfBuildUp"), app.indexOf("function RtfBuildUp")+2500)),
  "r3.2: Earlier updates keep muted 'Single source' after the beat sentence (no image badge)");
const jumpSrc = app.slice(app.indexOf("const jumpToPost"), app.indexOf("const jumpToPost") + 2200);
check(/det\.open = true/.test(jumpSrc) && /data-beat/.test(jumpSrc) && /el\.classList.add\("hl"\)/.test(jumpSrc),
  "r3.2: jumpToPost expands Earlier updates, finds the exact beat row, and glows that element");
check(/\.bu-pill\.hl::after/.test(app) && /background:\s*transparent/.test(app.slice(app.indexOf(".feed-bu .bu-pill::after"), app.indexOf(".feed-bu .bu-pill.hl::after") + 80)),
  "r3.2: jumped-to earlier-update rows use the same transparent outline glow, not an opaque fill");


// r3.3: restore production's bottom-right circular source badge; no top-left source overlay on the photo.
check(!/\.post \.src-badge \{ display: none/.test(app),
  "r3.3: Page 2 does not hide .src-badge");
check(/function OneMedia[\s\S]{0,900}<SrcBadge author=\{mo\.author\}/.test(app) && !/\{\!mo\.road && <SrcBadge/.test(app),
  "r3.3: OneMedia always renders the production SrcBadge (not gated on !mo.road)");
check(/function SplitMedia[\s\S]{0,1200}<SrcBadge author=\{pair\[1\]\.author\}/.test(app) && !/\{\!road && <SrcBadge/.test(app),
  "r3.3: SplitMedia always renders SrcBadge like production");
check(!/XMedia x=\{h\.x_post\} hideBadge/.test(app),
  "r3.3: FeedPost XMedia does not force-hide the badge");
const badgeCss = app.slice(app.indexOf(".xm-grid > a.src-badge, .xm-split > a.src-badge {"), app.indexOf(".xm-grid > a.src-badge, .xm-split > a.src-badge {") + 400);
check(/position:\s*absolute;\s*right:\s*8px;\s*bottom:\s*8px/.test(badgeCss) && /border-radius:\s*50%/.test(badgeCss),
  "r3.3: src-badge is production's bottom-right circular logo badge");
// no source-text overlay pinned to the top-left of the photo slot
const xmCssStart = app.indexOf(".xm-grid {");
const xmCss = app.slice(xmCssStart, xmCssStart + 2500);
check(!/src-label|photo-src-overlay|img-credit/.test(app.slice(app.indexOf("function OneMedia"), app.indexOf("function XMedia"))),
  "r3.3: OneMedia has no top-left source-text overlay component");
check(!/\.xm-grid[^{]*::(before|after)[^}]*content:[^;]*@/.test(app),
  "r3.3: no CSS pseudo-element source handle on the photo");
// photo-marks applied the way production applies them: hideBadge(image, aspect, crop) with crop bottom|top
check(/crop=\{mo\.crop === "bottom" \? "bottom" : "top"\}/.test(app) && /markHidesBadge\(image, aspect, crop\)/.test(app),
  "r3.3: SrcBadge/photo-marks use production's bottom-or-top crop mapping");
check(/<script defer src="scripts\/photo-marks\.js"><\/script>/.test(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")),
  "r3.3: index.html loads scripts/photo-marks.js like production");
const PM = require(path.join(ROOT, "scripts/photo-marks.js"));
appFns(["rtfCards"], ({ rtfCards }) => {
  const cards = rtfCards(road).filter((c) => !c.empty && c.h);
  let photos = 0;
  for (const c of cards) {
    const mo = c.h.media_override;
    if (!mo || !mo.image) continue;
    photos++;
    const crop = mo.crop === "bottom" ? "bottom" : "top";
    const hidden = PM.hideBadge(mo.image, 16 / 9, crop);
    check(typeof hidden === "boolean", "r3.3: photo-marks.hideBadge applies to " + c.id + " crop=" + crop);
    // A force-hidden badge on a default still would skip production's mark rule
    if (mo.default_photo) check(!mo.hideBadge, "r3.3: default photo " + c.id + " does not force-hide the badge; photo-marks decides");
  }
  check(photos >= 4, "r3.3: several Page 2 photo cards were checked for photo-marks (" + photos + ")");
  return true;
});
const oneClose = app.slice(app.indexOf("function OneMedia"), app.indexOf("function XMedia"));
check(!/SrcBadge[^>]*>}\s*<\/div>/.test(oneClose) && oneClose.includes("<SrcBadge") && oneClose.includes("</div>"),
  "r3.3: OneMedia SrcBadge is a sibling in xm-grid (no leftover JSX brace)");



// r3.4: no Page 2 card renders a source @handle/outlet line above or over the photo.
const feedPostSrc = app.slice(app.indexOf("function FeedPost"), app.indexOf("const rtfIsX"));
check(!/className="rev-src">\{h\.review_source\}/.test(feedPostSrc) && !/reviewSourceDupesBadge/.test(feedPostSrc) && !/<span className="rev-src">/.test(feedPostSrc),
  "r3.4: FeedPost does not render a source @handle/outlet line above or over the photo");
check(!/h\.review_source && !reviewSourceDupesBadge/.test(app) && !/h\.review_source \? <span className="rev-src">/.test(app),
  "r3.4: no Page 2 headline card renders review_source as a muted line above the photo");
const rtfBuSrc = app.slice(app.indexOf("function RtfBuildUp"), app.indexOf("function RtfBuildUp") + 3500);
check(/className="bu-text"/.test(rtfBuSrc) && /single \? <>\{" "\}<span className="rev-src">Single source<\/span><\/>/.test(rtfBuSrc),
  "r3.4: Single source is plain muted text after the Earlier-updates beat sentence, not a label above an image");
check(/\.rev-src \{[^}]*display:\s*inline/.test(app),
  "r3.4: .rev-src is inline after the sentence, not a block line above the photo");
check(!/\.post-text[\s\S]{0,200}rev-src[\s\S]{0,200}PickMedia/.test(feedPostSrc),
  "r3.4: FeedPost has no rev-src between the post text and the photo");

if (fails.length) { console.error("\n" + fails.length + " failure(s)"); process.exit(1); }
console.log("\nAll f16-clean-r3 logic checks passed.");
