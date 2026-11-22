/* Run health → data/health.json (read by Bernardo / Tusk; NO push is ever sent from here).
   { updated, status, consecutive_failures, alert, last_error, scripts: { [name]: { at, status, error, consecutive_failures } } }
   Written in a finally block of each checker script, even when a step failed. alert = 2+ consecutive failed runs.
   Commit policy (live CI runs only): commit on any failure, any status/alert change, or when the committed copy is >= 60 min
   old, so the file is fresh without a commit every 15 minutes (an ok run inside that hour leaves the file untouched). */
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
// Batch 1 / P2: gaps (missed runs seen by the next run) and per-source freshness (LL2, X) live in the same file.
// alert = 2+ failed runs in a row, OR a source down >= SOURCE_ALERT_RUNS runs in a row, OR >= 4 missed runs in 24 h.
const SOURCE_ALERT_RUNS = 8;
let pending = { gap: null, sources: {} };
function noteGap(gap) { if (gap && gap.missed > 0) pending.gap = gap; }
function noteSource(key, ok, error = null) { pending.sources[key] = { ok: !!ok, error: ok ? null : String(error && error.message || error).slice(0, 300) }; }
function update(prev, name, { ok, error = null, now = Date.now(), gap = null, sources = {} }) {
  const h = prev && typeof prev === "object" ? JSON.parse(JSON.stringify(prev)) : {};
  h.scripts = h.scripts || {};
  const p = h.scripts[name] || {}, at = new Date(now).toISOString();
  h.scripts[name] = { at, status: ok ? "ok" : "failed", error: ok ? null : String(error && error.message || error).slice(0, 500), consecutive_failures: ok ? 0 : (p.consecutive_failures || 0) + 1, ...(ok ? { last_ok: at } : { last_ok: p.last_ok || null }) };
  const all = Object.values(h.scripts);
  h.updated = at;
  h.status = all.some((s) => s.status === "failed") ? "failed" : "ok";
  h.consecutive_failures = Math.max(0, ...all.map((s) => s.consecutive_failures || 0));
  const at2 = at;
  for (const [k, v] of Object.entries(sources || {})) {
    h.sources = h.sources || {}; const q = h.sources[k] || {};
    h.sources[k] = { at: at2, status: v.ok ? "ok" : "failed", error: v.ok ? null : v.error, consecutive_failures: v.ok ? 0 : (q.consecutive_failures || 0) + 1, last_ok: v.ok ? at2 : (q.last_ok || null) };
  }
  if (gap && gap.missed > 0) { h.gaps = [...(h.gaps || []), { at, gap_min: gap.gapMin, missed: gap.missed }].slice(-10); }
  h.missed_runs_24h = (h.gaps || []).filter((g) => now - Date.parse(g.at) < 24 * 3600e3).reduce((a, g) => a + g.missed, 0);
  const reasons = [];
  if (h.consecutive_failures >= 2) reasons.push(`${h.consecutive_failures} failed runs in a row`);
  for (const [k, v] of Object.entries(h.sources || {})) if ((v.consecutive_failures || 0) >= SOURCE_ALERT_RUNS) reasons.push(`${k} unreachable for ${v.consecutive_failures} runs`);
  if (h.missed_runs_24h >= 4) reasons.push(`${h.missed_runs_24h} checker runs missed in 24 h`);
  h.alert = reasons.length > 0; h.alert_reasons = reasons;
  const lastErr = all.filter((s) => s.error).sort((a, b) => b.at.localeCompare(a.at))[0];
  h.last_error = lastErr ? { at: lastErr.at, error: lastErr.error } : (prev && prev.last_error) || null;
  return h;
}
function shouldCommit(prev, next, now = Date.now()) {
  if (!prev) return true;
  if (next.status !== "ok" || prev.status !== next.status || !!prev.alert !== !!next.alert) return true;
  if (Object.entries(next.sources || {}).some(([k, v]) => v.status !== "ok" || ((prev.sources || {})[k] || {}).status !== v.status)) return true; // a source going down / recovering is committed at once
  if ((next.gaps || []).length !== (prev.gaps || []).length || ((next.gaps || []).slice(-1)[0] || {}).at !== ((prev.gaps || []).slice(-1)[0] || {}).at) return true; // a newly seen gap
  return !prev.committed_at || now - Date.parse(prev.committed_at) >= 60 * 60e3;
}
function record(name, res, { root = ROOT, commit = null, now = Date.now(), log = console.log } = {}) {
  const file = path.join(root, "data", "health.json");
  try {
    let prev = null; try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    const next = update(prev, name, { gap: pending.gap, sources: pending.sources, ...res, now }); pending = { gap: null, sources: {} };
    const live = process.env.GITHUB_ACTIONS === "true" && process.env.TEST_MODE !== "true" && root === ROOT;
    const doCommit = (commit || live) && shouldCommit(prev, next, now);
    next.committed_at = doCommit ? new Date(now).toISOString() : (prev && prev.committed_at) || null;
    if (live && !doCommit) { log(`health: ${name} ok (file unchanged: committed ${next.committed_at}, refreshed hourly / on any failure)`); return next; } // never leave the CI tree dirty (the next step pulls --rebase)
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    log(`health: ${name} ${next.scripts[name].status}, consecutive failures ${next.consecutive_failures}${next.alert ? " — ALERT" : ""}`);
    if (doCommit) (commit || gitCommit)("data/health.json", `Auto: run health — ${next.status}${next.alert ? " (ALERT)" : ""}`);
    return next;
  } catch (e) { log(`health: could not write (${e.message})`); return null; }
}
function gitCommit(file, msg) {
  const run = (c) => execSync(c, { cwd: ROOT, stdio: "pipe" });
  try {
    run(`git config user.name "Starship Tracker Bot"`); run(`git config user.email "actions@github.com"`);
    run(`git add ${file}`); try { run(`git diff --cached --quiet -- ${file}`); return; } catch {}
    run(`git commit -m ${JSON.stringify(msg)}`);
    try { run("git push"); } catch { run("git pull --rebase"); run("git push"); }
  } catch (e) { console.log(`health: commit failed (${String(e.message).split("\n")[0]})`); }
}
// A named check result kept beside the run statuses (e.g. render_check from the daily self-check). Does not change
// status / alert (those are for failed runs); readers see { at, status, failures, items } under health[key].
function note(key, value, { root = ROOT } = {}) {
  if (!value) return null;
  const file = path.join(root, "data", "health.json");
  let h = {}; try { h = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch {}
  h[key] = value; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(h, null, 2) + "\n"); return h;
}
module.exports = { update, shouldCommit, record, note, noteGap, noteSource, SOURCE_ALERT_RUNS };
