// Road to Flight N: every status pill shares the widest pill's width (--pill-w), live.
// Code checks always run; the 390px browser check runs when playwright + Chrome are available (set PLAYWRIGHT_PATH to a node_modules/playwright dir).
const fs = require("fs"), path = require("path"), http = require("http");
const root = path.join(__dirname, ".."), app = fs.readFileSync(path.join(root, "app.js"), "utf8");
let pass = 0, fail = 0; const check = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + msg); };
check(/\.road \.callout-head \.badge \{[^}]*min-width: var\(--pill-w, 0px\); text-align: center;/.test(app), "pills share min-width var(--pill-w) and centre their text");
check(/box\.style\.setProperty\("--pill-w", Math\.ceil\(w\) \+ "px"\)/.test(app) && /querySelectorAll\("\.callout-head \.badge"\)/.test(app), "RoadCard sets --pill-w to the widest pill");
check(/new ResizeObserver/.test(app) && /document\.fonts\.ready\.then\(fit\)/.test(app) && /\}, \[pillKey\]\);/.test(app), "re-measures on resize, font load and any label/status change");
check(/className="road-list-inner" ref=\{listRef\}/.test(app), "the variable lives on the Road list container");
check(/\.badge-wrap \{ display: inline-flex; flex-direction: column; align-items: center;/.test(app), "'1 of 2' stays centred under its pill");
(async () => {
  let pw = null; try { pw = require(process.env.PLAYWRIGHT_PATH || "playwright"); } catch (e) {}
  const chrome = process.env.CHROME || "/usr/bin/google-chrome";
  if (!pw || !fs.existsSync(chrome)) { console.log("(browser check skipped: no playwright/Chrome)"); return done(); }
  const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
  const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); });
  await new Promise((ok) => srv.listen(0, ok));
  const b = await pw.chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  try {
    const pg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await pg.goto(`http://localhost:${srv.address().port}/`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".road-head", { state: "attached", timeout: 30000 });
    await pg.evaluate(() => document.querySelector(".road-head").click()); await pg.waitForTimeout(2500);
    const r = await pg.evaluate(() => [...document.querySelectorAll(".road .callout-head .badge")].map((e) => { const b = e.getBoundingClientRect(), h = e.closest(".callout-head").getBoundingClientRect();
      return { w: b.width, h: b.height, right: b.right, hr: h.right, sw: e.scrollWidth, cw: e.clientWidth }; }));
    const ws = r.map((x) => x.w);
    check(r.length >= 3 && Math.max(...ws) - Math.min(...ws) <= 1, `390px: all ${r.length} pills the same width within 1px (${ws.map((w) => w.toFixed(1)).join(", ")})`);
    check(r.every((x) => x.h < 30 && x.sw <= x.cw + 1 && x.right <= x.hr + 0.5), "390px: no pill wraps or overflows its card");
    // live: lengthen one label, the others follow
    const live = await pg.evaluate(async () => { const p = document.querySelector(".road .callout-head .badge"); p.textContent = "Confirmed again"; await new Promise((ok) => setTimeout(ok, 1000));
      const ws = [...document.querySelectorAll(".road .callout-head .badge")].map((e) => e.getBoundingClientRect().width); return ws; });
    check(Math.max(...live) - Math.min(...live) <= 1 && Math.max(...live) > Math.max(...ws) + 5, "a longer label widens every pill automatically");
  } finally { await b.close(); srv.close(); }
  done();
})().catch((e) => { check(false, "browser check crashed: " + e.message); done(); });
function done() { console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0); }
