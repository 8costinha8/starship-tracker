"use strict";
/* Review-source pack for the Flight 16 review layer.
   Loaded from data/review-sources.json (seeded from recorded fixtures).
   The checker appends trusted-account posts/articles it has ALREADY read this
   run (xf.posts, xf.news, RSS/news items in memory). No X or other API calls
   are made here — there is no fetch, no api.x.com, no token use. */
const fs = require("fs");
const path = require("path");

const CAP = 400;
const FLIGHTS_KEPT = 2; // current flight + previous

function reviewWanted(opts = {}, env = process.env) {
  if (opts && opts.review === false) return false;
  const v = String((env && env.REVIEW) || "").trim().toLowerCase();
  if (v === "off" || v === "0" || v === "false" || v === "no") return false;
  return true;
}

function sourcesPath(root) {
  return path.join(root, "data", "review-sources.json");
}

function normalizeUrl(u) {
  if (!u) return "";
  try {
    const x = new URL(String(u));
    let host = x.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "twitter.com" || host === "mobile.twitter.com" || host === "m.twitter.com") host = "x.com";
    const p = x.pathname.replace(/\/+$/, "");
    return `https://${host}${p}`.toLowerCase();
  } catch {
    return String(u).trim().replace(/\/+$/, "").toLowerCase();
  }
}

function load(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(j)) return { sources: j };
    return { ...j, sources: Array.isArray(j.sources) ? j.sources : [] };
  } catch (e) {
    if (e && e.code === "ENOENT") return { sources: [] };
    throw e;
  }
}

function save(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n");
}

function flightOf(s, road) {
  if (Number.isInteger(s.flight) && s.flight > 0) return s.flight;
  const hw = (road && road.hardware_flights) || {};
  const vs = String(s.vehicle || "").split(/[,+\s]+/).map((v) => v.trim().toUpperCase()).filter(Boolean);
  const flights = vs.map((v) => hw[v]).filter((n) => Number.isInteger(n));
  if (flights.length) return Math.max(...flights);
  return null;
}

function publishedMs(s) {
  const iso = s.published_utc || s.at || s.publishedAt || s.published_uk || s.retrieved_at || s.created_at || "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function fromPost(p, meta) {
  const author = (p && p.author && (p.author.username || p.author.name)) || (p && p.src) || "";
  return {
    id: String((p && (p.post_id || p.id)) || ""),
    kind: "x_post",
    handle_or_outlet: String(author).replace(/^@/, ""),
    url: (p && p.url) || "",
    published_utc: (p && (p.created_at || p.at || p.publishedAt)) || "",
    text: (p && (p.text || p.body)) || "",
    tier: (p && p.tier) || "2",
    retrieved_at: meta.nowIso,
    flight: meta.flight
  };
}

function fromItem(it, meta) {
  const url = (it && it.url) || "";
  const isX = /(?:^https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\//i.test(url);
  return {
    id: String((it && (it.id || (it.key && String(it.key).replace(/^x:/, "")))) || ""),
    kind: isX ? "x_post" : "article",
    handle_or_outlet: String((it && (it.handle_or_outlet || it.src || it.source)) || "").replace(/^@/, "").replace(/^X /i, ""),
    url,
    published_utc: (it && (it.publishedAt || it.published_utc || it.at || it.created_at)) || "",
    text: (it && (it.text || it.body || it.title)) || "",
    tier: (it && it.tier) || "2",
    retrieved_at: meta.nowIso,
    flight: meta.flight
  };
}

function collectAlreadyRead(xf, items, meta, { isTrustedItem } = {}) {
  const raw = [];
  for (const p of (xf && xf.posts) || []) raw.push(fromPost(p, meta));
  for (const it of (xf && xf.news) || []) raw.push(fromItem(it, meta));
  for (const it of items || []) raw.push(fromItem(it, meta));
  return raw.filter((s) => s.url && (!isTrustedItem || isTrustedItem(s)));
}

function appendAndPrune(store, incoming, { road, nowIso, cap = CAP } = {}) {
  const flight = (road && road.flight) || store.flight || null;
  const keepFrom = Number.isInteger(flight) ? flight - (FLIGHTS_KEPT - 1) : null;
  const sources = Array.isArray(store.sources) ? store.sources.slice() : [];
  const byUrl = new Map();
  for (const s of sources) {
    const u = normalizeUrl(s.url);
    if (u && !byUrl.has(u)) byUrl.set(u, s);
  }
  let added = 0, skipped = 0;
  for (const s of incoming || []) {
    const u = normalizeUrl(s.url);
    if (!u) { skipped++; continue; }
    if (byUrl.has(u)) { skipped++; continue; }
    const f = flightOf(s, road);
    if (keepFrom != null && f != null && f < keepFrom) { skipped++; continue; }
    byUrl.set(u, s);
    sources.push(s);
    added++;
  }
  let pruned = 0;
  let kept = sources.filter((s) => {
    if (keepFrom == null) return true;
    const f = flightOf(s, road);
    if (f == null) return true;
    if (f >= keepFrom) return true;
    pruned++;
    return false;
  });
  if (kept.length > cap) {
    kept.sort((a, b) => {
      const fa = flightOf(a, road), fb = flightOf(b, road);
      const pa = (fa == null || (keepFrom != null && fa >= keepFrom)) ? 1 : 0;
      const pb = (fb == null || (keepFrom != null && fb >= keepFrom)) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return publishedMs(b) - publishedMs(a);
    });
    pruned += kept.length - cap;
    kept = kept.slice(0, cap);
  }
  const changed = added > 0 || pruned > 0;
  const next = { ...store, sources: kept };
  if (flight) next.flight = flight;
  if (changed && nowIso) next.updated_at = nowIso;
  return { store: next, added, pruned, skipped, changed };
}

module.exports = {
  reviewWanted, sourcesPath, normalizeUrl, load, save, flightOf,
  collectAlreadyRead, appendAndPrune, fromPost, fromItem, CAP, FLIGHTS_KEPT
};
