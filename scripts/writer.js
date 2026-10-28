/* ─────────────────────────────────────────────────────────────
   The "writer": the AI model that check-road.js and check-flights.js
   send their prompts to. Picked by env vars, read on every call:
     WRITER=grok (default) | claude
     WRITER_MODEL=...   optional model override for the chosen writer
                        (defaults: claude-sonnet-5 / grok-4.3)
   Claude: Anthropic Messages API, key ANTHROPIC_API_KEY. The prompt asks
           for JSON and the reply text is parsed.
   Grok:   xAI Responses API (POST https://api.x.ai/v1/responses), key
           XAI_API_KEY, with schema-enforced JSON (text.format json_schema).
           Schemas must be objects, so arrays come back wrapped, e.g.
           {"entries": [...]}; askJson unwraps them via opts.unwrap.
   Both get the SAME prompt text. An empty or unparseable reply is retried
   (attempts, default 2); after the last one the error has err.empty = true.
   Grok first: ANY Grok failure (HTTP/API error, empty reply, invalid JSON, a
   reply the caller's extract() rejects) falls back to Claude for that call.
   ───────────────────────────────────────────────────────────── */

const DEFAULT_MODELS = { claude: "claude-sonnet-5", grok: "grok-4.3" };
const LABELS = { claude: "Claude", grok: "Grok" };

// WRITER=grok without an XAI_API_KEY falls back to Claude for the whole run
// (warned once per process), so a missing secret never costs a run's news.
let warnedFallback = false;
function fallingBack() {
  const w = String(process.env.WRITER || "grok").trim().toLowerCase();
  return w === "grok" && !String(process.env.XAI_API_KEY || "").trim();
}
function writerName() {
  const w = String(process.env.WRITER || "grok").trim().toLowerCase() || "claude";
  if (!DEFAULT_MODELS[w]) throw new Error(`Unknown WRITER "${process.env.WRITER}" (use claude or grok)`);
  if (fallingBack()) {
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn("⚠️ WRITER=grok but XAI_API_KEY not set — falling back to Claude");
      if (process.env.GITHUB_ACTIONS) console.log("::warning::WRITER=grok but XAI_API_KEY not set — falling back to Claude");
    }
    return "claude";
  }
  return w;
}
const writerLabel = () => LABELS[writerName()];
// On a fallback, WRITER_MODEL (meant for Grok) is ignored and Claude's default is used.
const writerModel = () => {
  const w = writerName();
  if (fallingBack()) return DEFAULT_MODELS.claude;
  return (process.env.WRITER_MODEL || "").trim() || DEFAULT_MODELS[w];
};
const resetFallbackWarning = () => { warnedFallback = false; }; // for tests

/* one HTTP call; returns { text, status, summary, body } (never throws for an empty reply) */
async function callClaude({ prompt, model, maxTokens, images }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: images && images.length ? [...images.map((url) => ({ type: "image", source: { type: "url", url } })), { type: "text", text: prompt }] : prompt }] }),
  });
  let json;
  try { json = await res.json(); } catch { json = { error: { type: "http_error", message: `HTTP ${res.status}` } }; }
  if (json.error || (res.status && !res.ok && res.status >= 400)) {
    const e = json.error || { type: "http_error", message: `HTTP ${res.status}` };
    throw Object.assign(new Error(`Anthropic API error (${e.type}): ${String(e.message).slice(0, 2000)}`), { status: res.status, provider: "claude" });
  }
  const blocks = (json.content || []).map((b) => b.type).join(",") || "none";
  const text = json.content?.find((b) => b.type === "text")?.text;
  // thinking signatures are long base64; show their size instead
  const body = JSON.stringify({ ...json, content: (json.content || []).map((b) => (b.signature ? { ...b, signature: `[${b.signature.length} chars]` } : b)) });
  return {
    text,
    summary: `stop_reason: ${json.stop_reason}`,
    details: `blocks: ${blocks}, input tokens: ${json.usage?.input_tokens ?? "?"}, output tokens: ${json.usage?.output_tokens ?? "?"}`,
    body,
  };
}

// Pulls the reply text out of a Responses API body: output[] items of type
// "message" hold content[] parts of type "output_text" (reasoning items are skipped).
function responsesText(json) {
  const parts = (json.output || []).filter((o) => o && o.type === "message")
    .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
    .filter((c) => c && c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text);
  if (parts.length) return parts.join("");
  return typeof json.output_text === "string" ? json.output_text : undefined;
}

async function callGrok({ prompt, model, maxTokens, schema, schemaName, images }) {
  const content = images && images.length ? [...images.map((url) => ({ type: "input_image", image_url: url, detail: "high" })), { type: "input_text", text: prompt }] : prompt;
  const reqBody = { model, input: [{ role: "user", content }], max_output_tokens: maxTokens, store: false };
  if (schema) reqBody.text = { format: { type: "json_schema", name: schemaName || "reply", schema, strict: true } };
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.XAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  const raw = await res.text();
  let json;
  try { json = JSON.parse(raw); } catch { throw Object.assign(new Error(`xAI API error (HTTP ${res.status}): ${raw.slice(0, 2000)}`), { status: res.status, provider: "grok" }); }
  if (!res.ok || (json.error && !json.output)) {
    const e = json.error;
    const msg = typeof e === "string" ? e : (e && (e.message || JSON.stringify(e))) || raw;
    throw Object.assign(new Error(`xAI API error (HTTP ${res.status}${json.code ? `, ${json.code}` : ""}): ${String(msg).slice(0, 2000)}`), { status: res.status, provider: "grok" });
  }
  const u = json.usage || {};
  const kinds = (json.output || []).map((o) => o.type).join(",") || "none";
  const why = json.incomplete_details && (json.incomplete_details.reason || JSON.stringify(json.incomplete_details));
  return {
    text: responsesText(json),
    summary: `status: ${json.status}${why ? ` (${why})` : ""}`,
    details: `output: ${kinds}, input tokens: ${u.input_tokens ?? "?"}, output tokens: ${u.output_tokens ?? "?"}, reasoning tokens: ${u.output_tokens_details?.reasoning_tokens ?? "?"}`,
    body: raw,
  };
}

/* Provider faults the watchdog must act on at the FIRST occurrence: HTTP 401/402/403, or any credit, quota
   or spending-limit error. Recorded per process as { provider, reason } — a short, fixed reason, never the
   raw body or any header (no secrets). The fallback still runs; watchdog.providerCheck decides warn vs fail. */
const PROVIDER = { grok: "xAI", claude: "Anthropic" };
function providerFault(provider, err) {
  const m = String((err && err.message) || ""), st = Number(err && err.status) || Number((m.match(/HTTP (\d{3})/) || [])[1]) || 0;
  let reason = null;
  if (/credit balance is too low/i.test(m)) reason = "credit balance too low";
  else if (/used all available credits|out of credits|credits? (?:exhausted|depleted)|insufficient (?:credits|funds|balance)/i.test(m)) reason = "credits exhausted";
  else if (/spending limit/i.test(m)) reason = "spending limit reached";
  else if (/quota/i.test(m)) reason = "quota exceeded";
  else if (st === 401) reason = "authentication failed";
  else if (st === 402) reason = "payment required";
  else if (st === 403) reason = "access forbidden";
  if (!reason) return null;
  return { provider: PROVIDER[provider] || provider, reason: `${reason}${st ? ` (HTTP ${st})` : ""}` };
}
const faults = new Map();
async function noteFault(provider, fn) {
  try { return await fn(); } catch (err) { const f = providerFault(provider, err); if (f && !faults.has(f.provider)) faults.set(f.provider, f); throw err; }
}
const providerFaults = () => [...faults.values()];
const resetProviderFaults = () => faults.clear();

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/* Ask the writer for JSON.
   opts: maxTokens, schema (JSON schema object, used by Grok), schemaName,
         unwrap (key to unwrap from Grok's object, e.g. "entries"),
         extract(text) → value (throws if not usable; default JSON.parse after
         stripping ``` fences), attempts (default 2), retryMs, log. */
async function askJson(prompt, opts = {}) {
  const w = writerName();
  const log = opts.log || console.log;
  if (w !== "grok") return noteFault("claude", () => askWith("claude", DEFAULT_MODELS.claude, prompt, opts));
  try {
    return await noteFault("grok", () => askWith("grok", writerModel(), prompt, opts));
  } catch (err) {
    log(`⚠️ Grok failed (${String(err.message).slice(0, 300)}) — falling back to Claude for this call`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::Grok failed — fell back to Claude (${String(err.message).slice(0, 200)})`);
    const v = await noteFault("claude", () => askWith("claude", DEFAULT_MODELS.claude, prompt, { ...opts, maxTokens: opts.claudeMaxTokens || opts.maxTokens }));
    if (v && typeof v === "object") Object.defineProperty(v, "writer", { value: "claude (fallback)", enumerable: false, configurable: true });
    return v;
  }
}

async function askWith(w, model, prompt, opts) {
  const label = LABELS[w];
  const log = opts.log || console.log;
  const attempts = opts.attempts || 2;
  const extract = opts.extract || ((t) => JSON.parse(t.replace(/```json|```/g, "").trim()));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = w === "grok"
      ? await callGrok({ prompt, model, maxTokens: opts.maxTokens || 16000, schema: opts.schema, schemaName: opts.schemaName, images: opts.images })
      : await callClaude({ prompt, model, maxTokens: opts.maxTokens || 16000, images: opts.images });
    log(`${label} ${r.summary} (attempt ${attempt}, model: ${model}, ${r.details})`);
    let problem;
    if (!r.text || !r.text.trim()) problem = "no text in the reply";
    else {
      let text = r.text;
      try {
        if (w === "grok" && opts.unwrap) {
          const obj = JSON.parse(text.replace(/```json|```/g, "").trim());
          if (Array.isArray(obj)) text = JSON.stringify(obj); // tolerate a bare array
          else if (obj && Array.isArray(obj[opts.unwrap])) text = JSON.stringify(obj[opts.unwrap]);
          else throw new Error(`no "${opts.unwrap}" array`);
        }
        const value = extract(text);
        if (value && typeof value === "object") {
          Object.defineProperty(value, "raw", { value: r.text, enumerable: false, configurable: true });
          Object.defineProperty(value, "writer", { value: w, enumerable: false, configurable: true });
        }
        return value;
      } catch (err) { problem = `unparseable reply (${err.message})`; }
    }
    log(`${label} reply problem: ${problem}${attempt < attempts ? " — retrying once" : ""}. Body: ${String(r.body).slice(0, 2000)}`);
    if (attempt < attempts) await sleep(opts.retryMs ?? 3000);
    else { const err = new Error(`${problem}${attempts > 1 ? `, ${attempts === 2 ? "twice" : `${attempts} times`}` : ""}`); err.empty = true; throw err; }
  }
}

module.exports = { providerFault, providerFaults, resetProviderFaults, askJson, writerName, writerLabel, writerModel, responsesText, resetFallbackWarning, DEFAULT_MODELS };
