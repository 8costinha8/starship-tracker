// Load top-level app.js functions for offline tests (the hero-story.js extractor), adding missing names on demand.
const hs = require("./hero-story.js"), fs = require("fs"), path = require("path");
function appFns(want, call) {
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"); const w = [...want];
  for (let t = 0; t < 80; t++) {
    try { const F = hs.heroFns(src, w); return call(F); }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/); if (!m || w.includes(m[1])) throw e; w.push(m[1]); }
  }
  throw new Error("appFns: too many retries");
}
module.exports = { appFns };
