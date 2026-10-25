// Category colours: orange (#FF9A3D) is Static fires, Raptor engines is matte black: graphite edge/glow/text #9AA0A6, consistently everywhere.
const fs = require("fs"), path = require("path");
const R = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
let pass = 0, fail = 0;
const check = (ok, name) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + name); };
const road = JSON.parse(R("road.json"));
const rc = R("scripts/check-road.js"), app = R("app.js"), fx = R("scripts/fixtures/road-push-sync.json");
check(/id: "static",[^}]*color: "#FF9A3D"/.test(rc), "check-road BOXES: Static fires is orange #FF9A3D");
check(/id: "raptor",[^}]*color: "#9AA0A6"/.test(rc), "check-road BOXES: Raptor engines is #9AA0A6");
check(/PAST_COLOR = \{[^}]*raptor: "#9AA0A6"[^}]*static: "#FF9A3D"/.test(app), "app.js PAST_COLOR swapped (glow/pills/dots for past flights)");
for (const [name, txt] of [["road.json", R("road.json")], ["push-sync fixture", fx]]) {
  const j = JSON.parse(txt), found = { static: new Set(), raptor: new Set() };
  (function walk(o) { if (o && typeof o === "object") { if ((o.id === "static" || o.id === "raptor") && o.color) found[o.id].add(o.color.toUpperCase()); Object.values(o).forEach(walk); } })(j);
  check([...found.static].every((c) => c === "#FF9A3D") && found.static.size > 0, `${name}: every Static fires colour is #FF9A3D`);
  check([...found.raptor].every((c) => c === "#9AA0A6") && found.raptor.size > 0, `${name}: every Raptor engines colour is #9AA0A6`);
}
check(/CAT_FILL = \{ raptor: \{ "--fill": "#111113", "--bg": "#111113", "--on": "#9AA0A6" \} \}/.test(app), "Raptor matte-black fill #111113 (fill, tinted bg) with graphite #9AA0A6 text on filled badges");
for (const site of ["catVars(e.box, e.color)", "catVars(m.id, m.color)} title", "catVars(m.id, m.color)} data-id", "catVars(cat.id, cat.color)"]) check(app.includes(site), "category vars applied at " + site.split(")")[0] + ")");
check(!/"--c": (e|m|cat)\.color/.test(app), "no category style bypasses catVars");
check(/\.dot-done, \.dot-complete \{ background: var\(--fill, var\(--c\)\)/.test(app) && /\.badge-done, \.badge-complete \{ background: var\(--fill, var\(--c\)\); color: var\(--on, #141B2D\)/.test(app), "filled dots/badges use the fill (black for Raptor)");
check(/\.mini::before \{[^}]*background: transparent; border: 1\.5px solid var\(--c\); \}/.test(app) && /\.mini\.done::before \{ background: var\(--fill, var\(--c\)\); \}/.test(app), "Flight Log dot: hollow ring in the category colour until the vehicle completes it, then filled (Raptor: black fill, graphite ring)");
check(/logGlows\(m, h, road\) \? " glow done" : ""/.test(app), "Flight Log dot fills on the same rule as the glow (that vehicle completed the category)");
check((app.match(/background: var\(--bg, color-mix\(in srgb, var\(--c\)/g) || []).length === 3, "pills / glow card / chips take the matte fill");
check(/\.mini\.glow \{ border-color: color-mix\(in srgb, var\(--c\) 45%[^}]*box-shadow: 0 0 12px -2px color-mix\(in srgb, var\(--c\)/.test(app), "glow stays driven by --c (graphite glow for Raptor)");
console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0);
