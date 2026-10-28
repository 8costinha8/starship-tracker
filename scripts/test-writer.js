/* Offline tests for scripts/writer.js: xAI Grok is the only writer — never calls Anthropic.
     node scripts/test-writer.js        exit 1 if any check fails */
process.env.XAI_API_KEY = "fake-xai"; delete process.env.WRITER; delete process.env.WRITER_MODEL;
const writer = require("./writer.js");
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };
let grokMode = "ok", calls = { grok: 0, claude: 0 }, lastGrokBody = null;
global.fetch = async (url, opts) => {
  const ok = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
  if (url.startsWith("https://api.x.ai/")) {
    calls.grok++; lastGrokBody = JSON.parse(opts.body);
    if (opts.headers.authorization !== "Bearer fake-xai") throw new Error("bad auth");
    if (grokMode === "http") return ok({ error: { message: "rate limited" } }, 429);
    if (grokMode === "throw") throw new Error("network down");
    const text = grokMode === "empty" ? "" : grokMode === "invalid" ? "{not json" : grokMode === "wrongshape" ? '{"other": 1}' : '{"entries":[{"item":1,"line":"from grok","vehicles":null}]}';
    return ok({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 20, output_tokens: 8 } });
  }
  if (/anthropic/.test(url)) { calls.claude++; throw new Error("Anthropic must never be called"); }
  throw new Error("unexpected " + url);
};
const opts = { unwrap: "entries", retryMs: 0, log: () => {}, schema: { type: "object", properties: { entries: { type: "array" } } }, schemaName: "t" };
(async () => {
  check(writer.writerName() === "grok", "WRITER defaults to grok");
  let r = await writer.askJson("p", opts);
  check(r[0].line === "from grok" && r.writer === "grok" && calls.claude === 0, "Grok ok → Grok answer, no Claude call");
  check(lastGrokBody.text && lastGrokBody.text.format.type === "json_schema" && lastGrokBody.store === false, "Grok gets schema JSON, store:false");
  for (const mode of ["http", "throw", "empty", "invalid", "wrongshape"]) {
    grokMode = mode; calls = { grok: 0, claude: 0 };
    r = await writer.askJson("p", opts).catch((e) => e);
    check(r instanceof Error && calls.claude === 0 && calls.grok >= 1, `Grok ${mode} → error surfaces, no Anthropic call (grok calls ${calls.grok})`);
  }
  grokMode = "ok"; calls = { grok: 0, claude: 0 };
  r = await writer.askJson("p", { ...opts, extract: () => { throw new Error("rejected by caller"); } }).catch((e) => e);
  check(calls.claude === 0 && r instanceof Error, "reply the caller rejects → error surfaces, no Anthropic call");
  process.env.WRITER = "claude"; calls = { grok: 0, claude: 0 };
  r = await writer.askJson("p", opts);
  check(writer.writerName() === "grok" && calls.claude === 0 && calls.grok === 1 && r.writer === "grok", "leftover WRITER=claude → still Grok only");
  delete process.env.WRITER;
  check(writer.writerLabel() === "Grok" && writer.writerModel() === "grok-4.3" && !("claude" in writer.DEFAULT_MODELS), "only Grok model configured");
  console.log(failed ? `\n❌ ${failed} check(s) failed.` : "\n✅ All checks passed. (Offline — no real API calls.)");
  process.exit(failed ? 1 : 0);
})();
