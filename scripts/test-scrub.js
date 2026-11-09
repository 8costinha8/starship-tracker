// scrub(): outlet names are removed from UI text without leaving a broken "(… reports, 7 Nov)" fragment.
const fs = require("fs"), path = require("path"), assert = require("assert");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const scrub = eval(`(() => { const doneToLabel = (s) => s; ${app.match(/const SRC_NAMES = [^\n]+/)[0]} ${app.match(/const scrub = [^\n]+/)[0]} return scrub; })()`);
const cases = [
  ["SpaceX could attempt Flight 15 within a week with double catch (NSF reports, 7 Nov).", "SpaceX could attempt Flight 15 within a week with double catch (7 Nov)."],
  ["Tested (NASASpaceflight, 3 Nov).", "Tested (3 Nov)."],
  ["Ready (SpaceX, 8 Nov).", "Ready (SpaceX, 8 Nov)."],
  ["Ship lifted (per NSF).", "Ship lifted."],
];
for (const [i, o] of cases) { assert.strictEqual(scrub(i), o); console.log("✅", o); }
console.log(`${cases.length} passed`);
