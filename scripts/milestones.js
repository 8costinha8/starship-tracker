/* Running milestone summary per vehicle (for the Flight Log's "Road to Flight N" pill).
   Fed by the X-first verdicts (stage + hardware + event); frozen into road.archive[N].summary
   when Flight N is logged. Counts are lower bounds ("at least N"): they only see what the trusted
   accounts posted. Two posts about the same event within 12h count once. */
const EVENTS = ["cryo_test", "static_fire", "engines_installed", "stacked", "wdr", "licence"];
const SAME_EVENT_MS = 12 * 3600000;
const hwKey = (s) => String(s || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B").replace(/\s+/g, "");
const vehicleName = (k) => (/^S\d+$/.test(k) ? `Ship ${k.slice(1)}` : /^B\d+$/.test(k) ? `Booster ${k.slice(1)}` : k);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => { // UK calendar day, e.g. "30 Sep"
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${Number(p.day)} ${MON[p.month - 1]}`;
};

// Record one event. Returns true if it counted (not a repeat of the same event).
function recordMilestone(road, { hardware, event, at, src }) {
  if (!EVENTS.includes(event) || !at || !Number.isFinite(Date.parse(at))) return false;
  const ms = (road.milestones = road.milestones || {});
  const key = ["stacked", "wdr", "licence"].includes(event) ? "flight" : hwKey(hardware);
  if (key !== "flight" && !/^[BS]\d{1,3}$/.test(key)) return false;
  const v = (ms[key] = ms[key] || {});
  const ev = (v[event] = v[event] || { count: 0, dates: [] });
  const t = Date.parse(at);
  if (ev.dates.some((d) => Math.abs(Date.parse(d) - t) < SAME_EVENT_MS)) return false;
  ev.dates.push(new Date(t).toISOString()); ev.dates.sort(); ev.count = ev.dates.length;
  if (src) ev.src = [...new Set([...(ev.src || []), src])].slice(-6);
  return true;
}

// The summary shown in a launched flight's card: one box per vehicle per category.
function buildSummary(milestones, vehicles) {
  const ms = milestones || {}, items = [];
  const order = [...(vehicles || [])].map(hwKey).sort((a, b) => (a[0] === "S" ? -1 : 1) - (b[0] === "S" ? -1 : 1));
  const last = (ev) => day(ev.dates[ev.dates.length - 1]);
  const atLeast = (n, word) => `${n === 1 ? "At least 1" : `At least ${n}`} ${word}${n === 1 ? "" : "s"}`;
  for (const k of order) { const v = ms[k] || {}; if (v.cryo_test) items.push({ box: "cryo", vehicle: vehicleName(k), text: `${atLeast(v.cryo_test.count, "cryo test")} · last ${last(v.cryo_test)}` }); }
  for (const k of order) { const v = ms[k] || {}; if (v.engines_installed) items.push({ box: "raptor", vehicle: vehicleName(k), text: `Engines installed · ${day(v.engines_installed.dates[0])}` }); }
  for (const k of order) { const v = ms[k] || {}; if (v.static_fire) items.push({ box: "static", vehicle: vehicleName(k), text: `${atLeast(v.static_fire.count, "static fire")} · ${v.static_fire.dates.map(day).join(", ")}` }); }
  const f = ms.flight || {};
  const pad = [f.stacked && `Stacked ${day(f.stacked.dates[f.stacked.dates.length - 1])}`, f.wdr && `wet dress rehearsal ${day(f.wdr.dates[f.wdr.dates.length - 1])}`].filter(Boolean);
  if (pad.length) items.push({ box: "pad", vehicle: "Full stack", text: pad.join(" · ").replace(/^./, (c) => c.toUpperCase()) });
  if (f.licence) items.push({ box: "faa", vehicle: "Licence", text: `Launch licence issued ${last(f.licence)}` });
  return items.length ? { items, auto: true } : null;
}

module.exports = { recordMilestone, buildSummary, hwKey, vehicleName, EVENTS };
