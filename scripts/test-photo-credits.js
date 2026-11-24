// data/photo-credits.json upkeep by the checker (scripts/photo-credits.js).   node scripts/test-photo-credits.js
const fs = require("fs"), os = require("os"), path = require("path");
const C = require("./photo-credits.js"), M = require("./photo-marks.js");
let pass = 0, fail = 0; const check = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
const road = { categories: [{ id: "pad", history: [{ id: "x-1", x_post: { url: "https://x.com/mymatrixplug/status/2114815133700731141", media: [{ type: "photo", url: "u" }] } }, { id: "x-2", x_post: { url: "https://x.com/a/status/2100000000000000001", media: [] } }] }] };
const fleet = { vehicles: { B24: { events: [{ id: "e", media_override: { image: "images/x.jpg", post_url: "https://x.com/Blobifie/status/2124725822909219049" }, candidates: [{ post_url: "https://x.com/RGVaerialphotos/status/2124765411627643131" }] }] } } };
const ids = C.photoPostIds(road, fleet);
check(ids.has("2114815133700731141") && ids.has("2124725822909219049") && ids.has("2124765411627643131") && !ids.has("2100000000000000001"), "photo source ids: x_post with media, media_override, candidates (a post without media is not one)");
const posts = [
  { post_id: "2114815133700731141", url: "https://x.com/mymatrixplug/status/2114815133700731141", text: "… launch site.\n\nFor WAI Media @FelixSchlang https://t.co/x", author: { username: "mymatrixplug" }, media: [{}] },
  { post_id: "2124765411627643131", text: "", author: { username: "RGVaerialphotos" } },                // no text: skipped, no error
  { post_id: "2124725822909219049", author: { username: "Blobifie" } },                                // text missing: skipped
  { post_id: "2199999999999999999", text: "not a photo source", author: { username: "x" } },           // not used as a photo: not stored
  null, { url: "nonsense" },
];
const cr = { posts: { "2124725822909219049": { poster: "Blobifie", text: "kept as is" } } };
const n = C.storeFrom(cr, posts, ids);
check(n === 1 && cr.posts["2114815133700731141"].poster === "mymatrixplug" && /For WAI Media @FelixSchlang/.test(cr.posts["2114815133700731141"].text), "a new photo post's text + handle are stored in the same format ({ poster, text })");
check(cr.posts["2124725822909219049"].text === "kept as is" && !cr.posts["2199999999999999999"] && !cr.posts["2124765411627643131"], "existing entries unchanged; missing/empty text and non-photo posts skipped");
check(M.creditOf(cr.posts["2114815133700731141"].text, { poster: cr.posts["2114815133700731141"].poster }).handle === "FelixSchlang", "creditOf works on the stored entry (WAI Media → @FelixSchlang)");
// update(): file round trip, never throws
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-")), f = path.join(dir, "data", "photo-credits.json"); const logs = [];
check(C.update({ file: f, posts, trees: [road, fleet], log: (m) => logs.push(m) }) === 1 && JSON.parse(fs.readFileSync(f, "utf8")).posts["2114815133700731141"], "update() creates the file when missing and stores the post");
check(C.update({ file: f, posts, trees: [road, fleet] }) === 0, "update() is idempotent (nothing new → no write)");
fs.writeFileSync(f, "{ broken json");
let threw = false, r; try { r = C.update({ file: f, posts, trees: [road, fleet], log: (m) => logs.push(m) }); } catch { threw = true; }
check(!threw && r === 0 && logs.some((l) => /photo credits skipped/.test(l)) && fs.readFileSync(f, "utf8") === "{ broken json", "a broken file never fails the checker (logged, file left alone)");
let threw2 = false; try { C.update({ file: f, posts: undefined, trees: undefined }); C.update(); } catch { threw2 = true; }
check(!threw2, "no posts / no args → no error");
// the checker calls it (after the fleet ingest, before the Road / fleet commits) and commits the file with them
const cr2 = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
check(/require\("\.\/photo-credits\.js"\)\.update\(\{ file: path\.join\(path\.dirname\(roadPath\), "data", "photo-credits\.json"\), posts: \(xf && xf\.posts\) \|\| \[\], trees: \[road, fleetReg\]/.test(cr2) && /creditsDirty \? \["data\/photo-credits\.json"\]/.test(cr2), "check-road.js stores new photo post texts and commits data/photo-credits.json with its Road / fleet commit");
// the live file: every entry has the format
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "photo-credits.json"), "utf8")).posts;
check(Object.entries(live).every(([id, v]) => /^\d{15,}$/.test(id) && typeof v.poster === "string" && v.poster && typeof v.text === "string"), `live data/photo-credits.json: ${Object.keys(live).length} entries in the { poster, text } format`);
console.log(`\n${pass}/${pass + fail} checks passed`); if (fail) process.exit(1);
