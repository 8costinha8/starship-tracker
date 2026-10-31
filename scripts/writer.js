/* ─────────────────────────────────────────────────────────────
   The "writer": the AI model that check-road.js and check-flights.js
   send their prompts to. xAI Grok is the ONLY model (no other provider):
     WRITER_MODEL=...   optional model override (default grok-4.3)
   Grok:   xAI Responses API (POST https://api.x.ai/v1/responses), key
           XAI_API_KEY, with schema-enforced JSON (text.format json_schema).
           Schemas must be objects, so arrays come back wrapped, e.g.
           {"entries": [...]}; askJson unwraps them via opts.unwrap.
   An empty or unparseable reply is retried (attempts, default 2); after the
   last one the error has err.empty = true. A Grok failure surfaces to the
   caller (which retries next run); the watchdog alarms on xAI credit faults.
   ───────────────────────────────────────────────────────────── */

const DEFAULT_MODELS = { grok: "grok-4.3" };
const LABELS = { grok: "Grok" };

// Only "grok" is supported; any other WRITER value (e.g. a leftover "claude") is ignored with one warning.
let warnedFallback = false;
function writerName() {
  const w = String(process.env.WRITER || "grok").trim().toLowerCase();
  if (w && w !== "grok" && !warnedFallback) {
    warnedFallback = true;
    console.warn(`⚠️ WRITER="${w}" is not supported — using Grok (the only writer)`);
  }
  return "grok";
}
const writerLabel = () => LABELS.grok;
const writerModel = () => (process.env.WRITER_MODEL || "").trim() || DEFAULT_MODELS.grok;
const resetFallbackWarning = () => { warnedFallback = false; }; // for tests

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

async function callGrok({ prompt, model, maxTokens, schema, schemaName, images, timeoutMs }) {
  const content = images && images.length ? [...images.map((url) => ({ type: "input_image", image_url: url, detail: "high" })), { type: "input_text", text: prompt }] : prompt;
  const reqBody = { model, input: [{ role: "user", content }], max_output_tokens: maxTokens, store: false };
  if (schema) reqBody.text = { format: { type: "json_schema", name: schemaName || "reply", schema, strict: true } };
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.XAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(timeoutMs || 60000), // a hung xAI call must not stall the run
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
   raw body or any header (no secrets). watchdog.providerCheck turns it into an alarm. */
const PROVIDER = { grok: "xAI" };
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

// Per-process Grok call counter (askJson calls, not retries) → one GROK_CALLS summary line per run.
const counts = { text: 0, vision: 0 };
const grokCalls = () => ({ total: counts.text + counts.vision, ...counts });
const grokCallsLine = () => { const c = grokCalls(); return `GROK_CALLS run total=${c.total} text=${c.text} vision=${c.vision} model=${writerModel()}`; };
const resetGrokCalls = () => { counts.text = 0; counts.vision = 0; };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/* Ask the writer for JSON.
   opts: maxTokens, schema (JSON schema object, used by Grok), schemaName,
         unwrap (key to unwrap from Grok's object, e.g. "entries"),
         extract(text) → value (throws if not usable; default JSON.parse after
         stripping ``` fences), attempts (default 2), retryMs, log. */
async function askJson(prompt, opts = {}) {
  writerName();
  const vision = Array.isArray(opts.images) && opts.images.length > 0, model = writerModel();
  counts[vision ? "vision" : "text"]++;
  console.log(`MODEL ${vision ? "vision" : "text"}=${model} purpose=${opts.schemaName || "unnamed"}`);
  return noteFault("grok", () => askWith("grok", model, prompt, opts));
}

async function askWith(w, model, prompt, opts) {
  const label = LABELS[w];
  const log = opts.log || console.log;
  const attempts = opts.attempts || 2;
  const extract = opts.extract || ((t) => JSON.parse(t.replace(/```json|```/g, "").trim()));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = await callGrok({ prompt, model, maxTokens: opts.maxTokens || 16000, schema: opts.schema, schemaName: opts.schemaName, images: opts.images, timeoutMs: opts.timeoutMs });
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

module.exports = { providerFault, providerFaults, resetProviderFaults, askJson, writerName, writerLabel, writerModel, responsesText, resetFallbackWarning, DEFAULT_MODELS, grokCalls, grokCallsLine, resetGrokCalls };
