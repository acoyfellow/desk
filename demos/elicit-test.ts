// elicit-test.ts — drive desk.elicit against your deployed fabric.
// Watch the M5 for the takeover; press A to choose first option.
//
// Run: DESK_MCP_URL=https://<your-fabric>.workers.dev/mcp \
//      DESK_DEVICE_TOKEN=<bearer> \
//      bun elicit-test.ts

const BASE = process.env.DESK_MCP_URL;
const TOKEN = process.env.DESK_DEVICE_TOKEN;
if (!BASE) { console.error("export DESK_MCP_URL first"); process.exit(2); }
if (!TOKEN) { console.error("export DESK_DEVICE_TOKEN first"); process.exit(2); }

let nextId = 1;
function rpc(method: string, params?: unknown) {
  return { jsonrpc: "2.0", id: nextId++, method, params };
}

async function call(method: string, params: unknown, sessionId?: string, timeoutMs = 35_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const headers: Record<string, string> = {
    "Authorization": "Bearer " + TOKEN,
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const r = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify(rpc(method, params)),
    signal: ctl.signal,
  }).finally(() => clearTimeout(t));

  const sid = r.headers.get("mcp-session-id") ?? sessionId;

  // SSE response: read until first JSON-RPC result
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const ev of events) {
      const dataLine = ev.split("\n").find(l => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const obj = JSON.parse(dataLine.slice(5).trim());
        if (obj.jsonrpc === "2.0") return { sid, body: obj };
      } catch {}
    }
  }
  return { sid, body: null };
}

console.log("→ initialize");
const init = await call("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "elicit-test", version: "0.0.1" },
});
const sid = init.sid!;
console.log("  session:", sid?.slice(0, 16));

console.log("\n→ tools/list");
const tools = await call("tools/list", {}, sid);
for (const t of tools.body?.result?.tools ?? []) {
  console.log("  -", t.name, ":", t.description?.slice(0, 60));
}

console.log("\n→ desk.elicit asking 'deploy?'");
console.log("  ⌚ WATCH YOUR M5 — it should TAKE OVER any current screen");
console.log("  press A on the M5 to choose 'ship'\n");
const t0 = Date.now();
const result = await call("tools/call", {
  name: "elicit",
  arguments: {
    question: "deploy desk-fabric to prod?",
    options: ["ship", "cancel"],
    timeout_seconds: 30,
  },
}, sid, 35_000);
const ms = Date.now() - t0;

console.log(`\n→ returned after ${(ms/1000).toFixed(1)}s`);
const content = result.body?.result?.content?.[0];
if (content?.type === "text") {
  console.log("  result:", content.text);
} else if (result.body?.result?.isError) {
  console.log("  error:", result.body.result.content);
} else {
  console.log("  body:", JSON.stringify(result.body).slice(0, 300));
}
