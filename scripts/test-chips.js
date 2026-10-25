// Road page category chips: label text never matches (or nearly matches) its background.  node scripts/test-chips.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const hex = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const CARD = hex("#222D46");
const fill = JSON.parse(app.match(/const CAT_FILL = (\{[^\n]*\}); \/\//)[1].replace(/([{,]\s*)([\w-]+|"[^"]+")\s*:/g, (m, p, k) => `${p}${k.startsWith('"') ? k : `"${k}"`}:`));
check(/<span className=\{"chip chip-" \+ cat\.id\}>/.test(app), "Road card chip carries its category id (chip-<id>)");
const raptorCss = (app.match(/\.chip\.chip-raptor \{([^}]*)\}/) || [])[1] || "";
check(/color: #F2F4F8/.test(raptorCss) && /background: rgba\(14,15,17,\.35\)/.test(raptorCss) && /border: 1\.5px solid #0E0F11/.test(raptorCss) && /rgba\(255,255,255,\.35\)/.test(raptorCss), "Raptor chip = A2 In progress pill: rgba(14,15,17,.35) fill, 1.5px #0E0F11 border + white rim, #F2F4F8 label");
for (const c of live.categories) {
  let text, bg;
  if (c.id === "raptor") { text = hex("#F2F4F8"); bg = mix(hex("#0E0F11"), CARD, 0.35); }
  else { const v = fill[c.id] || {}; text = hex(v["--t"] || c.color); bg = v["--bg"] ? hex(v["--bg"]) : mix(hex(c.color), CARD, 0.13); }
  const r = ratio(text, bg);
  check(r >= 3, `${c.id} chip: label vs background contrast ${r.toFixed(2)} ≥ 3`);
}
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
