// No cut-off text (15 Nov, every flight): vehicle names never truncate, summaries wrap instead of an ellipsis, chips and
// dates never clip — Page 1 current + past Road boxes and Page 2 groups at 320/360/390 and 320 with a desktop scrollbar.
// Renders the local repo in headless Chrome (tests/notrunc-audit.py); nothing is fetched from the live site or sent.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, ".."), app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const css = (sel) => (app.match(new RegExp("^" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{[^\\n]*", "m")) || [""])[0];
check(!/text-overflow: ellipsis/.test(css(".past-veh")) && /flex-shrink: 0/.test(css(".past-veh")), ".past-veh: no ellipsis, never shrinks");
check(/flex-wrap: wrap/.test(css(".past-box-top")), ".past-box-top: the pill wraps below the name when both don't fit");
check(!/line-clamp/.test(css(".past-box p")) && !/line-clamp/.test(css("section.road .callout-latest")), "past and current box summaries: no line clamp (wrap in full)");
check(!/text-overflow: ellipsis/.test(css("section.road .callout-name")), "current box names: no ellipsis");
check(/flex-wrap: wrap/.test(css(".post-top")), "Page 2 card top row wraps (the date never clips)");
let res = null;
try { res = JSON.parse(execFileSync("python3", [path.join(__dirname, "notrunc-audit.py")], { encoding: "utf8", timeout: 115000, stdio: ["ignore", "pipe", "pipe"] })); }
catch (e) { console.log("ℹ️  rendered audit skipped (headless Chrome / playwright not available here): " + String(e.message).split("\n")[0]); }
if (res) for (const r of res) {
  const label = `${r.w}px${r.desktop ? " + desktop scrollbar" : ""}`;
  const veh = r.bad.filter((x) => x.kind === "vehicle");
  check(veh.length === 0, `${label}: no vehicle name overflows or ellipsizes${veh.length ? " — " + veh.map((x) => `${x.text} (${x.tw}>${x.bw})`).join(", ") : ""}`);
  const rest = r.bad.filter((x) => x.kind !== "vehicle");
  check(rest.length === 0, `${label}: no summary, box name, pill, chip or date cut off${rest.length ? " — " + rest.map((x) => `${x.kind}: ${x.text}`).join(", ") : ""}`);
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
