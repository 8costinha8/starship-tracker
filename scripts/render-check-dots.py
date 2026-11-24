#!/usr/bin/env python3
"""Progress-dot size render-check (headless Chrome, iPhone UA, touch) at 320 / 360 / 390 x 844.
Not part of run-tests.js (the runner is node-only and offline; this needs a browser).
Usage: python3 scripts/render-check-dots.py [site_root_or_URL] [shot_prefix]
Page 1 (hero Road pill) and Page 2 (every flight's pill): for every .road-dots row it measures each dot's RENDERED size:
the border box plus any hard outer box-shadow ring (spread + offset, blur 0: an outer outline draws outside the box and
makes a dot look bigger; the soft glow on done dots is not counted). Asserts every dot in a row, Raptor included, has the same rendered width and height (+-0.01px), the box is
square, and Raptor's dot is visible (its ring differs from its fill). Prints the sizes. Exit 1 on any failure."""
import sys, os, threading, json, re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[2] if len(sys.argv) > 2 else None
if SRC.startswith("http"): URL = SRC
else:
    class H(SimpleHTTPRequestHandler):
        def __init__(s, *a, **k): super().__init__(*a, directory=SRC, **k)
        def log_message(s, *a): pass
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=httpd.serve_forever, daemon=True).start()
    URL = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
SEP = "&" if "?" in URL else "?"
DISMISS = "() => { const q=document.querySelector('.notify-btn-quiet'); if(q) q.click(); const st=document.createElement('style'); st.textContent='.notify-modal{display:none!important}'; document.head.appendChild(st); }"
MEASURE = """() => [...document.querySelectorAll('.road-dots')].filter(r => r.getClientRects().length).map((row, ri) => {
  const where = row.closest('.road-head') ? 'page1-road' : row.closest('.feed-pill') ? 'page2-pill' : row.closest('.past-toggle') ? 'past' : 'other';
  return { where, ri, dots: [...row.querySelectorAll('.dot')].map(d => { const b = d.getBoundingClientRect(), cs = getComputedStyle(d);
    let out = 0; // outer box-shadow extent (spread + blur + |offset|), inset shadows draw inside
    for (const sh of (cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\\))/))) { if (/\\binset\\b/.test(sh)) continue;
      const n = (sh.replace(/rgba?\\([^)]*\\)/g, '').match(/-?[\\d.]+px/g) || []).map(parseFloat); const [x = 0, y = 0, blur = 0, spread = 0] = n; if (blur > 0) continue; /* a soft glow (done dots) is not a ring */ out = Math.max(out, spread + Math.max(Math.abs(x), Math.abs(y))); }
    return { cat: d.dataset.cat || null, w: b.width, h: b.height, rw: b.width + 2 * out, rh: b.height + 2 * out, outer: out, ring: cs.borderTopColor, fill: cs.backgroundColor, bw: cs.borderTopWidth }; }) }; })"""
fails = []; report = {}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for W in (320, 360, 390):
        for page, q in (("p1", ""), ("p2", "feed=1")):
            ctx = br.new_context(viewport={"width": W, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
            pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(URL + (SEP + q if q else ""), wait_until="domcontentloaded", timeout=60000); pg.wait_for_timeout(3500); pg.evaluate(DISMISS); pg.wait_for_timeout(600)
            rows = pg.evaluate(MEASURE)
            if not rows: fails.append(f"{W} {page}: no progress dots found")
            for r in rows:
                ds = r["dots"]; tag = f"{W} {page} {r['where']}#{r['ri']}"
                sizes = sorted({(round(d["rw"], 2), round(d["rh"], 2)) for d in ds})
                rap = [d for d in ds if d["cat"] == "raptor"]
                report[tag] = {"sizes": sizes, "raptor": [(round(d["rw"], 2), round(d["rh"], 2), d["ring"], d["fill"]) for d in rap], "n": len(ds)}
                if len(sizes) != 1: fails.append(f"{tag}: dots differ in rendered size {sizes} " + json.dumps([(d['cat'], round(d['rw'], 2), round(d['rh'], 2)) for d in ds]))
                if any(abs(d["rw"] - d["rh"]) > 0.01 for d in ds): fails.append(f"{tag}: a dot is not round (w != h)")
                for d in rap:
                    if re.sub(r"\s", "", d["ring"]) == "rgb(14,15,17)" and not d["outer"]: fails.append(f"{tag}: Raptor dot ring {d['ring']} is its near-black colour (invisible)")
                if OUT and W == 390 and rap:
                    row = pg.locator(".road-dots").nth(r["ri"])
                    try: row.screenshot(path=f"{OUT}-{page}-dots{r['ri']}-390.png")
                    except Exception: pass
            if errs: fails.append(f"{W} {page}: JS errors {errs[:2]}")
            ctx.close()
    br.close()
for k, v in report.items(): print(f"{k}: {v['n']} dots, rendered {v['sizes']}" + (f", raptor {v['raptor']}" if v['raptor'] else ""))
print("dots render-check:", "PASS" if not fails else "FAIL")
for f in fails: print("  FAIL", f)
sys.exit(1 if fails else 0)
