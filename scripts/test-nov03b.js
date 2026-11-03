/* 3 Nov Part B (visual): crop rule (no background extending), split pills, right-aligned date, bigger Raptor icon,
   "NET <date>" on the Upcoming card and hero pill. No network: node scripts/test-nov03b.js */
const fs = require("fs"), path = require("path"), RP = require("./road-pick.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, ".."), app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
// crop rule
check(RP.cropOf("cryo", "Booster 22 completed its cryo test.") === "top" && RP.cropOf("static", "Ship 42 completed a static fire.") === "top", "ships and boosters: top of the vehicle");
check(RP.cropOf("raptor", "Ship 42's Raptor engines were reinstalled.") === "bottom" && RP.cropOf("pad", "Lifting jig raised for Booster 22 engine testing.") === "bottom", "engines / Raptors: bottom");
const e = { text: "Booster 22 completed its cryo test.", at: "2026-09-10T00:00:00Z", x_post: { url: "https://x.com/LabPadre/status/1", author: { username: "LabPadre" }, media: [{ type: "photo", url: "https://pbs.twimg.com/media/a.jpg" }] } };
check(RP.cardPicture([e], { cid: "cryo" }).crop === "top", "auto picker (road-pick) returns the crop alignment");
const r = { text: "Ship 42's Raptors were installed.", at: "2026-09-10T00:00:00Z", x_post: { url: "https://x.com/LabPadre/status/2", author: { username: "LabPadre" }, media: [{ type: "photo", url: "https://pbs.twimg.com/media/b.jpg" }] } };
check(RP.cardPicture([r], { cid: "raptor" }).crop === "bottom", "auto picker: Raptor card crops to the bottom");
check(/crop: require\("\.\/road-pick\.js"\)\.cropOf\(c\.id/.test(fs.readFileSync(path.join(__dirname, "media-watch.js"), "utf8")) && /cropOf\(cat\.id/.test(fs.readFileSync(path.join(__dirname, "media-cascade.js"), "utf8")), "media-watch and media-cascade store the crop on swapped media");
const mos = road.categories.flatMap((c) => (c.history || []).map((h) => h && h.media_override).filter((m) => m && m.image));
check(mos.length && mos.every((m) => m.crop === "top" || m.crop === "bottom"), `every existing card photo has a crop alignment (${mos.length})`);
check(/\.xm-grid img, \.xm-split img \{ object-position: center top; \}/.test(app) && /img\.crop-bottom[^{]*\{ object-position: center bottom; \}/.test(app) && /object-fit: cover/.test(app) && !/object-fit: contain/.test(app), "CSS: cover-crop, top by default, bottom for engines, never contain/extend");
// pills
const pillParts = new Function(`${app.match(/const pillParts = [^\n]+/)[0]} return pillParts;`)();
check(JSON.stringify(pillParts("Cryo tests · Ship 42")) === '["Cryo tests","Ship 42"]' && pillParts("FAA licence").length === 1, "combined pill splits into two pills, no dot");
check(/pillParts\(cat\.name\)\.map/.test(app) && /chip-2/.test(app), "feed card renders the split pills with the same chip style");
// date right
check(/\.post-date \{[^}]*margin-left: auto/.test(app) && app.indexOf('<span className="post-date">{cardDate(h)}</span>') > app.indexOf('post-status"}>{st.text}</span>}'), "post date sits at the card's right edge (after the status pill)");
// raptor icon
check(/section\.road \.callout-icon \.cat-img \{ height: 25px; \}/.test(app), "Road card Raptor icon slightly bigger (20 → 25px)");
// NET
check(/month: "short" \}\)\}`; \/\/ 3 Nov/.test(app) && !/· predicted`/.test(app) && !/pred-basis">\{scrub\(predicted\.basis\)/.test(app), "predicted date shows just 'NET 12 Nov' (no source, no 'predicted')");
check(/pred \? pred\.label : "Date to be confirmed"/.test(app) && /<Countdown flight=\{f\} road=\{road\} \/>/.test(app), "hero pill shows the predicted NET instead of 'Date to be confirmed'");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
