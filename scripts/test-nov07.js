// Offline regression: day-or-better TBD is NET, not confirmed or an exact T-0. No network or notifications.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SIM = require("./sim-handover.js"), H = require("./handover.js"), FL = require("./flightlog.js"), CR = require("./check-road.js"), P = require("./predicted.js");
const F15 = "";
let pass = 0, fail = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); ok ? pass++ : fail++; };
function app(logged) {
  let src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8").replace(/^const nowMs = .*$/m, "const nowMs = () => globalThis.__SIM_NOW;");
  if (logged) src = src.replace("const FLIGHTS = [", `const FLIGHTS = [\n  ${F15}`);
  const lines = src.split("\n"), starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); if (m) starts.push({ name: m[1], i }); });
  const decl = (name) => { const k = starts.findIndex((s) => s.name === name); if (k < 0) return null;
    let end = lines.length; for (let j = starts[k].i + 1; j < lines.length; j++) if (/^(?:\S)/.test(lines[j]) && !/^[}\])]/.test(lines[j])) { end = j; break; }
    return lines.slice(starts[k].i, end).join("\n"); };
  const want = ["pickNextLaunch", "flightFromLL2", "roadForHero", "rtfRows", "logList", "daysLabel", "heroVehicles", "vehicleLine", "showWatchBadge", "effectiveStatus", "pastSummary", "galleryOf", "thumbOf", "DONE_GRACE_MS", "LAST_LOGGED_N", "isLaunched", "usableTbdDate", "dateOnlyNet", "netDayLabel", "exactTime", "predictedNet"];
  const have = new Set(), parts = [];
  const add = (n) => { if (have.has(n)) return true; const d = decl(n); if (!d) return false; have.add(n); parts.unshift(d); return true; };
  want.forEach(add);
  // eager closure: every top-level name a pulled declaration mentions (JSX components left out)
  const names = new Set(starts.map((x) => x.name));
  for (let k = 0; k < parts.length; k++) for (const w of new Set(parts[k].match(/[A-Za-z_$][\w$]*/g) || [])) { if (!names.has(w) || have.has(w)) continue; const d = decl(w); if (!d || /className=|<\/[a-z]|^\s*<[A-Za-z]/m.test(d)) continue; have.add(w); parts.unshift(d); k = -1; break; }
  const window = { RoadPick: require("./road-pick.js"), RoadFlightLog: FL, RoadHandover: H, RoadCleanup: require("./cleanup.js"), addEventListener() {}, dispatchEvent() {}, location: { search: "" } };
  const React = { createElement() { return null; } }, document = {}, localStorage = { getItem() { return null; }, setItem() {} };
  for (let tries = 0; tries < 300; tries++) {
    try { return new Function("window", "React", "document", "localStorage", `${parts.join("\n")}\nreturn { ${want.join(", ")} };`)(window, React, document, localStorage); }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/) || String(e.message).match(/Cannot access '(\w+)' before initialization/);
      if (!m) throw e;
      if (/before initialization/.test(e.message)) { const i = parts.findIndex((p) => new RegExp(`^(?:const|let|function)\\s+${m[1]}\\b`).test(p)); const [p] = parts.splice(i, 1); parts.unshift(p); continue; }
      if (!add(m[1])) throw new Error(`no top-level ${m[1]} in app.js`); }
  }
  throw new Error("could not load app.js functions");
}

globalThis.__SIM_NOW = Date.parse("2026-11-07T10:18:00Z");
const A = app(false), now = globalThis.__SIM_NOW;
const raw = { name: "Starship | Flight 15", status: {abbrev:"TBD"}, net: "2026-11-13T00:00:00Z", net_precision:{abbrev:"DAY"} };
const f = A.flightFromLL2(raw);
check(A.effectiveStatus(f, now) === "net", "TBD + valid DAY becomes NET");
check(A.netDayLabel(f) === "NET 13 Nov" && A.dateOnlyNet(f) && !A.exactTime(f), "hero/countdown date-only NET 13 Nov; no midnight T-0");
check(A.effectiveStatus(f, Date.parse(raw.net)+60000) === "net", "DAY midnight cannot fabricate In flight");
for (const p of ["DAY", "HR", "MIN", "SEC"]) {
 const x={...f, netPrecision:p}, nx={n:15,status:"TBD",date:f.date,precision:p};
 check(A.effectiveStatus(x, now)==="net" && P.ll2State(nx)==="net" && !A.exactTime(x), `app/predicted agree: TBD ${p} is NET, not confirmed`);
}
for (const p of ["", "WK", "M", "Q4", "Y", "UNKNOWN"]) {
 const x={...f, netPrecision:p};
 check(!A.usableTbdDate(x) && P.ll2State({status:"TBD",date:f.date,precision:p})==="unconfirmed", `TBD ${p || "missing"} does not invent a usable day`);
}
for (const date of [null, "bad date", ""]) {
 check(!A.usableTbdDate({...f,date}) && P.ll2State({status:"TBD",date,precision:"DAY"})==="unconfirmed", `invalid date ${date} remains unknown`);
}
check(A.effectiveStatus({...f,status:"done"},now)==="done" && A.effectiveStatus({...f,status:"inflight"},now)==="inflight", "explicit mission status wins");
const road={flight:15,predicted:{flight:15,net:"2026-11-12",mode:"auto",sources:[{name:"a"},{name:"b"}]},predicted_candidates:[]};
const next={n:15,status:"TBD",date:f.date,precision:"DAY"};
const got=P.computePredicted({road,target:15,next,lastLogged:14,now});
check(got.predicted===null && got.reason==="LL2 net" && !got.slip, "usable LL2 NET clears curated predicted without a notification slip");
const mentions=[{flight:15,date:"2026-11-12",source:"a",seen_at:new Date(now).toISOString()},{flight:15,date:"2026-11-12",source:"b",seen_at:new Date(now).toISOString()}];
check(P.computePredicted({road:{...road,predicted:null},target:15,next,lastLogged:14,mentions,now}).predicted===null, "usable LL2 NET does not recreate a competing source prediction");
check(A.predictedNet(f,road,now)===null, "hero uses LL2 NET only, not source/predicted label");
const rough=P.computePredicted({road,target:15,next:{...next,precision:"M"},lastLogged:14,mentions,now});
check(rough.predicted && rough.predicted.net==="2026-11-12", "rough LL2 can set source-backed predicted normally");
const src=fs.readFileSync(path.join(ROOT,"app.js"),"utf8");
check(src.includes('if (status === "net" && dateOnlyNet(flight)) return') && src.includes('if (status === "net" && dateOnlyNet(f)) dateText = netDayLabel(f)'), "hero and countdown share the same date-only formatter");
const live=JSON.parse(fs.readFileSync(path.join(ROOT,"road.json"),"utf8"));
check(!live.predicted && live.feed_items.some(x=>/NET 13 Nov/.test(x.body||"")), "repo Road feed NET 13 Nov is coherent; predicted cleared");
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
