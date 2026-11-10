/* Display only: FAA box shows "Licence not yet issued" with no date while there is no licence.
   boxes() output stays the same. node scripts/test-faa-label.js */
const fs = require("fs"), path = require("path"), F = require("./flightlog.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
function extract(name) {
  const start = APP.indexOf(`function ${name}(`);
  if (start < 0) throw new Error("missing " + name);
  let depth = 0, i = start, begun = false;
  for (; i < APP.length; i++) {
    if (APP[i] === "{") { depth++; begun = true; }
    else if (APP[i] === "}") { depth--; if (begun && depth === 0) { i++; break; } }
  }
  return APP.slice(start, i);
}
const fns = new Function(`${extract("faaLicenceDisplay")}\nreturn { faaLicenceDisplay };`)();
const raw = F.boxes(live, "10 Nov").faa;
check(raw.latest === "No Flight 15 licence yet." && raw.cards[0].lines[0].day === "10 Nov" && raw.cards[0].lines[0].text === "No Flight 15 licence yet.", "boxes() still dates the empty official head as today (checkers unchanged)");
const view = fns.faaLicenceDisplay(raw);
check(view.latest === "Licence not yet issued", `display headline: "${view.latest}"`);
check(view.cards[0].lines[0].text === "Licence not yet issued" && view.cards[0].lines[0].day === "" && view.cards[0].lines[0].time === "", "display line has no date");
check(!/10 Nov/.test(JSON.stringify(view.cards[0].lines[0])) && !/No Flight 15 licence yet/.test(view.latest), "no clock date and no 'No Flight N licence yet' in the display head");
check(raw.latest === "No Flight 15 licence yet." && raw.cards[0].lines[0].day === "10 Nov", "faaLicenceDisplay does not mutate boxes() output");
const official = { status: "done", statusText: "Confirmed", latest: "FAA licence issued for Flight 15.", cards: [{ vehicle: "faa", name: "FAA licence", lines: [{ day: "12 Nov", time: "", text: "FAA licence issued for Flight 15." }] }] };
check(fns.faaLicenceDisplay(official) === official, "an issued licence (status done) is left unchanged");
check(/m\.id === "faa" && f\) \? faaLicenceDisplay\(f\)/.test(APP), "RoadCard applies faaLicenceDisplay only when rendering the FAA box");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
