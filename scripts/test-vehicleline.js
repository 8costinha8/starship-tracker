/* Display only: Next flight card vehicle row is "Vehicle {block}" / "Booster N, Ship N".
   node scripts/test-vehicleline.js */
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const APP = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
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
const fns = new Function(`${extract("vehicleLabel")}\n${extract("vehicleLine")}\nreturn { vehicleLabel, vehicleLine };`)();
const f15 = { block: "V3", booster: "B22", ship: "S42" };
check(fns.vehicleLabel(f15) === "Vehicle V3", `F15 label: "${fns.vehicleLabel(f15)}"`);
check(fns.vehicleLine(f15) === "Booster 22, Ship 42", `F15 value: "${fns.vehicleLine(f15)}"`);
check(fns.vehicleLabel({ booster: "B22", ship: "S42" }) === "Vehicle", "no block → label is just Vehicle");
check(fns.vehicleLine({ block: "V3" }) === "To be announced", "block alone is not a serial line");
check(fns.vehicleLabel({ block: "V2", booster: "B15-2", ship: "S38" }) === "Vehicle V2" && fns.vehicleLine({ block: "V2", booster: "B15-2", ship: "S38" }) === "Booster 15-2, Ship 38", "other flights: label is Vehicle {block}, value is serials only");
check(/<dt>\{vehicleLabel\(heroVehicles\(f, road\)\)\}<\/dt><dd>\{vehicleLine\(heroVehicles\(f, road\)\)\}<\/dd>/.test(APP), "NextFlightCard uses vehicleLabel + vehicleLine");
check(!/parts\.push\(f\.block\)/.test(extract("vehicleLine")), "vehicleLine no longer prepends the block");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
