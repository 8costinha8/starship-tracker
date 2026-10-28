/* Offline: Massey's never defaults to cryo (x-first guardPost) + live road.json has no S42 Massey's entry in Cryo. */
const xf = require("./x-first.js"), fs = require("fs"), path = require("path");
let fail = 0; const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const road = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [
  { id: "cryo", name: "Cryo tests", status: "progress", history: [{ id: "c1", text: "Ship 42 completed further cryo tests.", hardware: "S42", stage: "cryo" }] },
  { id: "static", name: "Static fires", status: "progress", history: [] }] });
const post = (text) => ({ post_id: "1", text, author: { username: "NASASpaceflight" }, url: "https://x.com/NASASpaceflight/status/1" });
const v = { kind: "road", stage: "cryo", event: "cryo_test", hardware: "S42", phase: "progress", status: "progress" };
let g = xf.guardPost(road(), post("Ship 42 is heading to Massey's for cryo tests."), v);
ok(g.v && g.v.stage === "static" && g.v.event === "static_fire", "S42 cryo done + Massey's trip (even worded 'for cryo') → Static fires");
g = xf.guardPost(road(), post("Ship 42 arrives at Massey's as Ship 43 departs."), v);
ok(g.v && g.v.stage === "static", "S42 arrives at Massey's → Static fires");
g = xf.guardPost(road(), post("Ship 42 rolls to Massey's for a static fire."), { ...v, hardware: "S42" });
ok(g.v && g.v.stage === "static", "Massey's + static fire purpose → Static fires");
const r2 = road(); r2.categories[0].history = [];
g = xf.guardPost(r2, post("Ship 44 heads to Massey's for cryo testing."), { ...v, hardware: "S44" });
ok(g.v && g.v.stage === "cryo", "vehicle without cryo done + explicit cryo purpose → stays Cryo");
ok(xf.masseyStage(r2, "Ship 44 heads to Massey's.", "S44", 15) === null, "Massey's with no purpose and no state → no default (null, never cryo)");
ok(xf.masseyStage(road(), "Ship 42 heads to Massey's for another cryo test.", "S42", 15) === "cryo", "explicit NEW cryo test → Cryo");
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const cryoBox = live.categories.find((c) => c.id === "cryo");
ok(!cryoBox.history.some((h) => /S42/.test(h.hardware || "") && /massey/i.test(h.text)), "road.json: no S42 Massey's entry left in Cryo");
const st = live.categories.find((c) => c.id === "static").history;
ok(["x-2114568166651428965", "x-2114535368758542634"].every((id) => st.some((h) => h.id === id && !/cryo/i.test(h.text))), "road.json: both S42 Massey's entries re-filed to Static fires, wording fixed");
const sf = st.find((h) => h.id === "x-2114904512217694216");
ok(sf && sf.no_push && sf.x_post.media[0].type === "video" && /NASASpaceflight/.test(sf.url) && /-frame\.jpg$/.test(sf.media_override.image), "road.json: S42 static fire card (NSF video post, best frame, no push)");
console.log(fail ? `\n❌ ${fail} check(s) failed` : "\nAll Massey's checks passed."); process.exit(fail ? 1 : 0);
