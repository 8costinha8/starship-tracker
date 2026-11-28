#!/usr/bin/env node
/* Eight F16 review fixtures: run the CODE on the LIVE road.json plus recorded
   fixture posts (and the git-extracted LOX feed item). Never hand-edit road.json. */
"use strict";
const fs = require("fs");
const path = require("path");
const RR = require("./review-rules.js");
const flog = require("./flightlog.js");
const ROOT = path.join(__dirname, "..");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-sources.json"), "utf8"));
const lox = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/f16-review/f16-lox-feed-item.json"), "utf8"));
const extra = lox.feed_item ? [lox.feed_item] : [lox];
const { road, pills, beats } = RR.applyToRoad(structuredClone(live), { sources, extraFeedItems: extra, log: () => {} });
const texts = (arr) => arr.map((x) => `${x.label || ""} ${x.text || ""} ${x.date || ""}`).join("\n");
const b23CryoPills = pills.filter((p) => p.vehicleId === "B23" && p.box === "cryo");
const s43CryoPills = pills.filter((p) => p.vehicleId === "S43" && p.box === "cryo");
const s42CryoPills = pills.filter((p) => p.vehicleId === "S42" && p.box === "cryo");
const b23Raptor = pills.filter((p) => p.vehicleId === "B23" && p.box === "raptor");
const b23Beats = beats.filter((b) => b.vehicleId === "B23");
const s43Beats = beats.filter((b) => b.vehicleId === "S43");
const allText = RR.renderedTexts(road).join("\n");
const fails = [];
function check(cond, msg) { if (!cond) { fails.push(msg); console.log("FAIL " + msg); } else console.log("ok   " + msg); }
const r1 = b23CryoPills.find((p) => /Round 1/.test(p.label));
check(r1 && /13–15 Oct/.test(r1.label) && /15 Oct/.test(r1.text) && /extended cryo proof test/.test(r1.text) && !/16 Oct/.test(r1.label + r1.text),
  "1: B23 cryo pill is Round 1 · 13–15 Oct, extended test on 15 Oct (not 16)");
const b15 = b23Beats.find((b) => b.date === "15 Oct");
check(b15 && /12 hours/.test(b15.text) && /most likely a pass/.test(b15.text) && /SpaceX has not stated a result/.test(b15.text),
  "1: B23 15 Oct beat has 12 hours, most likely a pass, no SpaceX result");
check(!/16 Oct/.test(texts(b23CryoPills)) && !b23Beats.some((b) => b.date === "16 Oct" && /complet/i.test(b.text)),
  "1: no B23 cryo completion dated 16 Oct");
check(!road.inferred, "2: road.inferred removed");
check(!/all 33 Raptors/.test(allText) && !/so all 33 Raptors are installed/.test(allText),
  "2: no 'all 33 Raptors' text in reviewed road");
const flogText = JSON.stringify(flog.boxes ? flog.boxes(road) : flog);
check(!/ready with all 33 Raptors/.test(flogText), "2: flight log does not invent 'ready with all 33 Raptors'");
const rap = b23Raptor[0];
check(rap && /18 Oct/.test(rap.label) && /under way since 18 Oct/i.test(rap.text),
  "3: B23 raptor pill: From 18 Oct, engine installation under way since 18 Oct (got " + (rap && rap.label + " | " + rap.text) + ")");
const b18 = b23Beats.find((b) => b.date === "18 Oct" && b.box === "raptor");
check(b18 && /returned to Mega Bay 1 from cryo testing for engine installation/i.test(b18.text),
  "3: 18 Oct beat is raptor, wording keeps cryo context");
const raptorCat = road.categories.find((c) => c.id === "raptor");
check(raptorCat && !/nothing reported yet/i.test(raptorCat.latest || ""),
  "3: raptor latest is not 'Nothing reported yet'");
check(!(raptorCat.history || []).some((h) => /B23|Booster 23/.test(h.hardware || h.text || "") && /rolled back to the production site after its cryo/.test(h.text || "")),
  "3: live 'rolled back after cryo' line no longer sits in the wrong filing as-is if refiled");
const r2 = b23CryoPills.find((p) => /Round 2/.test(p.label));
check(r2 && /28–30 Oct/.test(r2.label) && /Second visit/.test(r2.text) && /No visible testing/.test(r2.text) && /unconfirmed/.test(r2.text),
  "4: B23 Round 2 · 28–30 Oct, no visible testing, purpose unconfirmed");
const b30 = b23Beats.find((b) => b.date === "30 Oct");
check(b30 && /Left Massey's for Mega Bay 1/.test(b30.text) && /ambient pressure test is unconfirmed/.test(b30.text),
  "4: 30 Oct return beat exists with unconfirmed ambient wording");
const stand = b23Beats.filter((b) => b.date === "12 Oct" && /stand/.test(b.text));
check(stand.length === 1, "4: 12 Oct cryo stand / thrust sim stand is one beat (got " + stand.length + ")");
check(s43CryoPills.length === 1, "5: S43 has exactly one cryo round (got " + s43CryoPills.length + ")");
const s43 = s43CryoPills[0];
check(s43 && /22–26 Oct/.test(s43.label) && /23 Oct/.test(s43.text) && /Mega Bay 2/.test(s43.text),
  "5: S43 Round 1 · 22–26 Oct, completed on 23 Oct, returned to Mega Bay 2");
const s23 = s43Beats.find((b) => b.date === "23 Oct" && /two tests/.test(b.text));
check(s23 && /NSF reports two tests/.test(s23.text), "5: 23 Oct beat: NSF reports two tests that day");
const s26 = s43Beats.find((b) => b.date === "26 Oct");
check(s26 && /overnight/.test(s26.text) && /Mega Bay 2/.test(s26.text), "5: 26 Oct overnight return to Mega Bay 2");
const s42Text = texts(s42CryoPills) + "\n" + beats.filter((b) => b.vehicleId === "S42").map((b) => b.date + " " + b.text).join("\n");
check(s42CryoPills.length === 2, "6: S42 has exactly two cryo rounds (got " + s42CryoPills.length + ")");
const s42r1 = s42CryoPills.find((p) => /Round 1/.test(p.label));
const s42r2 = s42CryoPills.find((p) => /Round 2/.test(p.label));
check(s42r1 && /2–6 Sep/.test(s42r1.label) && /two cryo proof tests/i.test(s42r1.text) && /3–4 Sep/.test(s42r1.text) && /Mega Bay 2/.test(s42r1.text),
  "6: Round 1 · 2–6 Sep, two tests on 3–4 Sep, then returned to Mega Bay 2 (got " + (s42r1 && s42r1.label + " | " + s42r1.text) + ")");
check(s42r2 && /9 Oct/.test(s42r2.label) && /third cryo proof test/.test(s42r2.text) && /engines were removed/.test(s42r2.text),
  "6: Round 2 · 9 Oct, third test after engines were removed");
check(!/27 Oct/.test(s42Text) && s42CryoPills.every((p) => !/27 Oct/.test(p.label)), "6: no stale 27 Oct S42 cryo pill");
const s42RaptorBeats = beats.filter((b) => b.vehicleId === "S42" && b.box === "raptor");
check(s42RaptorBeats.every((b) => b.date !== "3 Sep"), "P: no S42 raptor beat dated 3 Sep");
check(!s42RaptorBeats.length || s42RaptorBeats.some((b) => b.date === "6 Sep"),
  "P: S42 raptor beat is dated 6 Sep when present (got " + s42RaptorBeats.map((b) => b.date).join(",") + ")");
const loxItem = (road.feed_items || []).find((f) => f.id === "news-mwwwnefk-9cc4c1" || /lox landing tank test article/i.test(f.body || ""));
check(loxItem && loxItem.card_hide === true, "7: LOX feed item is card_hide");
const b23All = [texts(b23CryoPills), texts(b23Beats), ...(road.categories.find((c) => c.id === "cryo").history || []).filter((h) => /B23/.test(h.hardware || "")).map((h) => h.text)].join("\n");
check(!/lox landing tank test article/i.test(b23All) && !/test article was scrapped/i.test(b23All),
  "7: LOX article text is not on B23 cards/pills/beats");
const NSF25 = "https://www.nasaspaceflight.com/2026/10/roberts-road-expansion-flight-16/";
const YT30 = "https://x.com/YouTubeify/status/2116198873345544505";
check(r1 && r1.url === NSF25, "8: B23 cryo round 1 links to NSF 25 Oct article (got " + (r1 && r1.url) + ")");
check(r2 && r2.url === YT30, "8: B23 cryo round 2 (no milestone) links to newest 30 Oct return (got " + (r2 && r2.url) + ")");
for (const p of pills) {
  check(p.links === 1 && p.url && typeof p.url === "string" && !Array.isArray(p.url),
    "8: pill " + p.id + " has exactly one link");
  const srcs = p.sources || [];
  const urls = srcs.map((s) => s.url).filter(Boolean);
  check(!p.url || urls.includes(p.url) || !srcs.length || srcs.some((s) => s.url === p.url),
    "8: pill " + p.id + " link is one of its merged sources");
}
check(pills.every((p) => !/\+N|\+\d+/.test(p.text || "")), "8: no +N source chips in pill text");
for (const t of RR.renderedTexts(road)) check(RR.isCleanText(t), "8/UI: clean text: " + String(t).slice(0, 80));

check(!/Megabay/i.test(allText), "4: no 'Megabay' spelling in review output");
for (const b of beats) {
  if (/^S/i.test(b.vehicleId)) check(!/\bbooster\b/i.test(b.text), "1: ship beat has no 'booster': " + b.date + " " + b.text);
  if (/^B/i.test(b.vehicleId)) check(!/\bship\b/i.test(b.text), "1: booster beat has no 'ship': " + b.date + " " + b.text);
}
const s43Raptor = pills.filter((p) => p.vehicleId === "S43" && p.box === "raptor");
check(s43Raptor.length === 1, "G: S43 has one raptor pill (got " + s43Raptor.length + ")");
check(s43Raptor[0] && /From 26 Oct/.test(s43Raptor[0].label) && /Engine installation under way since 26 Oct/.test(s43Raptor[0].text),
  "G: S43 raptor pill From 26 Oct · Engine installation under way since 26 Oct.");
const s43_26 = s43Beats.filter((b) => b.date === "26 Oct");
for (const b of s43_26) {
  check(!/2115409771495133347/.test(b.url || ""), "D: S43 26 Oct must not link Blobifie 28 Oct recap");
}
const s43Rapt = (pills.filter((p) => p.vehicleId === "S43" && p.box === "raptor")[0] || {});
const s43RaptBeat = beats.find((b) => b.vehicleId === "S43" && b.box === "raptor");
check(/2114673311045353935|2114670468246679804/.test((s43Rapt.url || "") + " " + ((s43RaptBeat && s43RaptBeat.url) || "")),
  "D: S43 raptor/26 Oct engine post is Blobifie 2114673311045353935 or _Testflight_ 2114670468246679804 (got pill " + s43Rapt.url + " beat " + (s43RaptBeat && s43RaptBeat.url) + ")");
const s43_22 = s43Beats.filter((b) => b.date === "22 Oct");
check(s43_22.every((b) => !/spacex-static-fires-flight-15/.test(b.url || "")), "D: S43 22 Oct does not link NSF 30 Oct F15 article");
const b23_28 = b23Beats.filter((b) => b.date === "28 Oct");
check(b23_28.every((b) => !/spacex-static-fires-flight-15/.test(b.url || "")), "D: B23 28 Oct does not link NSF 30 Oct F15 article");
const s42_2 = beats.filter((b) => b.vehicleId === "S42" && b.date === "2 Sep");
const s42_9 = beats.filter((b) => b.vehicleId === "S42" && b.date === "9 Oct" && (b.kindEvent === "pre_move" || /[Rr]oll/.test(b.text)));
check(s42_2.every((b) => !/ship-40-returns-ship-42/.test(b.url || "")), "D: S42 2 Sep does not link NSF 9 Oct article");
check(s42_9.every((b) => !/ship-40-returns-ship-42/.test(b.url || "")), "D: S42 9 Oct rollout does not link NSF 9 Oct article");
for (const b of beats) {
  if (!b.url) continue;
  const about = (b.vehicle || "") + " " + (b.vehicleId || "");
  // Article sources show the outlet, not an X handle
  if (/nasaspaceflight\.com/i.test(b.url)) check(b.source === "NASASpaceFlight.com", "N: NSF article source is NASASpaceFlight.com (got " + b.source + " on " + b.date + ")");
  if (b.kindEvent && b.date) {
    /* window checked in test-f16-review-links via primaryLink helpers */
  }
  void about;
}
const staticCat = road.categories.find((c) => c.id === "static");
check(staticCat && staticCat.status !== "progress", "5: preparing for static fire is not In progress (got " + (staticCat && staticCat.status) + ")");
check(staticCat && !/testing ahead/i.test(staticCat.latest || "") && staticCat.latest.length <= 38, "8: static latest is a full short line (got " + (staticCat && staticCat.latest) + ")");

if (fails.length) { console.error("\n" + fails.length + " failure(s)"); process.exit(1); }
console.log("\nAll F16 review fixtures passed from code on live road + recorded sources.");
