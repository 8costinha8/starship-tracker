#!/usr/bin/env node
/* Offline review: start from the LIVE committed road.json, apply review-rules.js
   to that road plus recorded fixture posts (extra checker-like source inputs).
   No network. Writes generated output to a separate path; does not overwrite
   the committed production road.json unless --in-place is passed (preview build only). */
"use strict";
const fs = require("fs");
const path = require("path");
const RR = require("./review-rules.js");
const ROOT = path.join(__dirname, "..");
function noNetwork() {
  const block = (url) => { throw new Error("offline review: blocked network " + url); };
  if (typeof global.fetch === "function") global.fetch = block;
  const https = require("https"), http = require("http");
  https.request = http.request = function () { throw new Error("offline review: blocked http request"); };
}
function loadJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : path.join(ROOT, "preview-out", "road.json");
  const inPlace = args.includes("--in-place");
  const roadPath = path.join(ROOT, "road.json");
  noNetwork();
  const road = loadJson(roadPath);
  const sources = loadJson(path.join(ROOT, "tests/fixtures/f16-review/f16-sources.json"));
  const lox = loadJson(path.join(ROOT, "tests/fixtures/f16-review/f16-lox-feed-item.json"));
  const extra = lox.feed_item ? [lox.feed_item] : (lox.id ? [lox] : []);
  const log = (s) => console.log("• " + s);
  log("base: live production road.json + fixture posts as extra source inputs (not fixtures alone)");
  log("road flight " + road.flight + " vehicles " + (road.vehicles || []).join(", "));
  const { pills, beats } = RR.applyToRoad(road, { sources, extraFeedItems: extra, log });
  const dest = inPlace ? roadPath : outPath;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(road, null, 2) + "\n");
  log("wrote " + path.relative(ROOT, dest) + " (" + pills.length + " pills, " + beats.length + " beats)");
}
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.stack || e.message); process.exit(1); }
}
module.exports = { main };
