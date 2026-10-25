// Category colours: orange (#FF9A3D) is Static fires, Raptor engines takes #FF5A36, consistently everywhere.
const fs = require("fs"), path = require("path");
const R = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
let pass = 0, fail = 0;
const check = (ok, name) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + name); };
const road = JSON.parse(R("road.json"));
const rc = R("scripts/check-road.js"), app = R("app.js"), fx = R("scripts/fixtures/road-push-sync.json");
check(/id: "static",[^}]*color: "#FF9A3D"/.test(rc), "check-road BOXES: Static fires is orange #FF9A3D");
check(/id: "raptor",[^}]*color: "#FF5A36"/.test(rc), "check-road BOXES: Raptor engines is #FF5A36");
check(/PAST_COLOR = \{[^}]*raptor: "#FF5A36"[^}]*static: "#FF9A3D"/.test(app), "app.js PAST_COLOR swapped (glow/pills/dots for past flights)");
for (const [name, txt] of [["road.json", R("road.json")], ["push-sync fixture", fx]]) {
  const j = JSON.parse(txt), found = { static: new Set(), raptor: new Set() };
  (function walk(o) { if (o && typeof o === "object") { if ((o.id === "static" || o.id === "raptor") && o.color) found[o.id].add(o.color.toUpperCase()); Object.values(o).forEach(walk); } })(j);
  check([...found.static].every((c) => c === "#FF9A3D") && found.static.size > 0, `${name}: every Static fires colour is #FF9A3D`);
  check([...found.raptor].every((c) => c === "#FF5A36") && found.raptor.size > 0, `${name}: every Raptor engines colour is #FF5A36`);
}
console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0);
