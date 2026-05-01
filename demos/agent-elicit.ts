// agent-elicit.ts — what an MCP agent does to ask the desk operator
// something. Uses standard MCP Streamable HTTP over the deployed
// desk fabric Worker.
//
// Configure DESK_MCP_URL to point at your fabric Worker's /mcp path,
// and DESK_DEVICE_TOKEN to the bearer your fabric was deployed with.

const BASE = process.env.DESK_MCP_URL;
const TOKEN = process.env.DESK_DEVICE_TOKEN;
if (!BASE) { console.error("export DESK_MCP_URL=https://<your-fabric>.workers.dev/mcp"); process.exit(2); }
if (!TOKEN) { console.error("export DESK_DEVICE_TOKEN=<bearer>"); process.exit(2); }

let nextId = 1;
function rpc(method: string, params?: unknown) {
  return { jsonrpc: "2.0", id: nextId++, method, params };
}

async function call(method: string, params: unknown, sid?: string) {
  const headers: Record<string, string> = {
    "Authorization": "Bearer " + TOKEN,
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sid) headers["mcp-session-id"] = sid;

  const r = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify(rpc(method, params)),
  });
  const newSid = r.headers.get("mcp-session-id") ?? sid;
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
      const dl = ev.split("\n").find(l => l.startsWith("data:"));
      if (!dl) continue;
      try {
        const obj = JSON.parse(dl.slice(5).trim());
        if (obj.jsonrpc === "2.0") return { sid: newSid, body: obj };
      } catch {}
    }
  }
  return { sid: newSid, body: null };
}

const arg = process.argv[2] ?? "elicit";

if (arg === "echo") {
  const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agent", version: "0.0.1" } });
  const r = await call("tools/call", { name: "echo", arguments: { text: "hi from headless" } }, init.sid);
  console.log("echo result:", r.body?.result?.content?.[0]?.text);
  process.exit(0);
}

if (arg === "elicit") {
  console.log("→ initialize");
  const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agent", version: "0.0.1" } });
  console.log("→ desk.elicit('should I keep going?', ['yes please','take a break'])");
  console.log("  WATCH M5: should chirp + show question. Press A for yes, hold A for break.");
  const t0 = Date.now();
  const r = await call("tools/call", {
    name: "elicit",
    arguments: {
      question: "should I keep going?",
      options: ["yes please", "wait", "take a break"],  // A=yes, (mid line), long-A=break
      timeout_seconds: 30,
    },
  }, init.sid);
  const ms = Date.now() - t0;
  console.log(`← returned in ${(ms/1000).toFixed(1)}s`);
  if (r.body?.result?.isError) {
    console.log("  ERR:", r.body.result.content);
  } else {
    console.log("  ", r.body?.result?.content?.[0]?.text);
  }
}
