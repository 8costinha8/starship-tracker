// Regression: X-first Grok-call savers (prefilter + verdict cache). Run: node scripts/test-grok-savers.js
const assert = require("assert");
const fs = require("fs"), path = require("path");
const xf = require("./x-first.js");
const road = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
let fails = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => console.log("ok  ", name), (e) => { fails++; console.log("FAIL", name, e.message); });
const post = (id, text, extra = {}) => ({ post_id: id, author: { username: extra.u || "NASASpaceflight" }, text, created_at: "2026-10-31T04:00:00Z", media: extra.media || [], link: extra.link || null });
(async () => {
  await t("prefilter skips Falcon 9 / other-provider launches with no Starship word", () => {
    for (const s of ["LAUNCH! SpaceX Falcon 9 B1093-18 launches Starlink Group 15-18 from SLC-4E, Vandenberg.", "Falcon 9 launches 27 @Starlink satellites from California", ".@isro confirms a successful separation of the NVS-03 following its launch on a GSLV-F18 rocket"])
      assert.ok(xf.prefilter(road, post("1", s)), s);
  });
  await t("prefilter keeps anything Starship-ish (no relevant post dropped)", () => {
    for (const s of ["A rare treat tonight as we got to watch through the open door of Megabay 1 as Booster 24's methane tank was lifted this evening.",
      "Deployment of 27 @Starlink satellites confirmed", "Falcon 9 and Starship side by side at the pad", "Falcon 9 booster lands; meanwhile S42 rolls to Massey's",
      "The latest FAA slide has updated the targeted date for Starship flight 15 to Thursday Nov. 12th 2026.", "She's going up!", "Liftoff!"])
      assert.strictEqual(xf.prefilter(road, post("1", s, { media: [{ type: "photo", url: "x" }] })), null, s);
    assert.strictEqual(xf.prefilter(road, post("1", "Liftoff!")), null, "text-only 'Liftoff!' still goes to Grok");
    assert.strictEqual(xf.prefilter(road, post("1", "She's going up!", { u: "RGVaerialphotos" })), null);
    assert.strictEqual(xf.prefilter(road, post("1", "Deployment of 27 @Starlink satellites confirmed", { u: "SpaceX" })), null);
    for (const c of road.categories) for (const h of c.history || []) if (h.x_post) assert.strictEqual(xf.prefilter(road, h.x_post), null, `road.json ${h.x_post.post_id}`);
    for (const p of JSON.parse(fs.readFileSync(path.join(__dirname, "mix-candidates.json"), "utf8"))) assert.strictEqual(xf.prefilter(road, p), null, p.post_id);
  });
  await t("all-filtered batch makes no Grok call; mixed batch makes exactly one with only the unfiltered posts", async () => {
    let calls = 0, seenN = 0;
    const ask = async (prompt) => { calls++; seenN = (prompt.match(/^\d+\. @/gm) || []).length; return { entries: Array.from({ length: seenN }, (_, k) => ({ item: k + 1, kind: "skip", reason: "mock" })) }; };
    let r = await xf.classifyWithSavers(road, [post("1", "Falcon 9 launches 27 @Starlink satellites from California")], [], ask, {}, Date.now());
    assert.strictEqual(calls, 0); assert.strictEqual(r.verdicts[0].kind, "skip");
    r = await xf.classifyWithSavers(road, [post("1", "Falcon 9 launches Starlink"), post("2", "Booster 24 methane tank lifted in Megabay 1")], [], ask, {}, Date.now());
    assert.strictEqual(calls, 1); assert.strictEqual(seenN, 1); assert.strictEqual(r.verdicts.length, 2);
  });
  await t("verdict cache: a repeat post reuses the verdict (tags unchanged), expires after 3 days, other authors not shared", async () => {
    let calls = 0; const v = { item: 1, kind: "road", stage: "s", hardware: "B22", flight: 15, text: "Booster 22 static fire.", reason: "r" };
    const ask = async () => { calls++; return { entries: [v] }; };
    const now = Date.parse("2026-10-31T00:00:00Z");
    const a = await xf.classifyWithSavers(road, [post("1", "Booster 22 static fire! https://t.co/a")], [{ id: "s", name: "S" }], ask, {}, now);
    const b = await xf.classifyWithSavers(road, [post("2", "Booster 22  static fire! https://t.co/b")], [{ id: "s", name: "S" }], ask, { vcache: a.vcache }, now + 3600000);
    assert.strictEqual(calls, 1); assert.strictEqual(b.verdicts[0].hardware, "B22"); assert.strictEqual(b.verdicts[0].flight, 15); assert.strictEqual(b.verdicts[0].stage, "s");
    await xf.classifyWithSavers(road, [post("3", "Booster 22 static fire!", { u: "LabPadre" })], [{ id: "s", name: "S" }], ask, { vcache: a.vcache }, now + 3600000);
    assert.strictEqual(calls, 2, "other author → Grok");
    await xf.classifyWithSavers(road, [post("4", "Booster 22 static fire!")], [{ id: "s", name: "S" }], ask, { vcache: a.vcache }, now + 4 * 86400000);
    assert.strictEqual(calls, 3, "expired → Grok");
  });
  await t("no-verdict replies are not cached", async () => {
    let calls = 0; const ask = async () => { calls++; return { entries: [] }; };
    const a = await xf.classifyWithSavers(road, [post("1", "Ship 42 cryo")], [], ask, {}, Date.now());
    assert.strictEqual(a.vcache.length, 0);
  });
  await t("writer counts calls and prints GROK_CALLS", () => {
    const w = require("./writer.js"); w.resetGrokCalls();
    assert.match(w.grokCallsLine(), /^GROK_CALLS run total=0 text=0 vision=0 model=grok-4\.3$/);
  });
  console.log(fails ? `${fails} failed` : "all passed"); process.exit(fails ? 1 : 0);
})();
