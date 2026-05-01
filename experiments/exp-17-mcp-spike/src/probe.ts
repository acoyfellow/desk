// probe.ts — minimal MCP client to drive the spike.
// Uses Streamable HTTP transport (JSON-RPC over POST + SSE).
//
// Usage: bun src/probe.ts <test>
//   echo, cross_do, long_wait, poll_for

const BASE = "http://127.0.0.1:8917/mcp";

let nextId = 1;
function rpc(method: string, params?: unknown) {
  return { jsonrpc: "2.0", id: nextId++, method, params };
}

async function call(method: string, params?: unknown, opts: { sessionId?: string; timeoutMs?: number } = {}): Promise<{ status: number; body: any; sessionId?: string; ms: number }> {
  const body = JSON.stringify(rpc(method, params));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
  };
  if (opts.sessionId) headers["mcp-session-id"] = opts.sessionId;

  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 60_000);

  const t0 = performance.now();
  const r = await fetch(BASE, {
    method: "POST",
    headers,
    body,
    signal: ctl.signal,
  }).finally(() => clearTimeout(timeout));
  const ms = performance.now() - t0;
  const sessionId = r.headers.get("mcp-session-id") ?? opts.sessionId;

  // The server may respond with either application/json (single response)
  // or text/event-stream (streamed). Try to detect.
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("event-stream")) {
    // Read SSE until first JSON-RPC response
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let result: any = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n\n");
      buf = lines.pop() ?? "";
      for (const ev of lines) {
        const dataLine = ev.split("\n").find(l => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const obj = JSON.parse(dataLine.slice(5).trim());
          if (obj.jsonrpc === "2.0" && (obj.result !== undefined || obj.error !== undefined)) {
            result = obj;
            break;
          }
        } catch {}
      }
      if (result) break;
    }
    return { status: r.status, body: result, sessionId, ms };
  } else {
    const text = await r.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body, sessionId, ms };
  }
}

async function initialize(): Promise<string> {
  const r = await call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "exp17-probe", version: "0.0.1" },
  });
  console.log(`initialize: status=${r.status} ms=${r.ms.toFixed(0)} sessionId=${r.sessionId}`);
  if (!r.sessionId) throw new Error("no session id from initialize");
  return r.sessionId!;
}

async function listTools(sessionId: string) {
  const r = await call("tools/list", {}, { sessionId });
  console.log(`tools/list: status=${r.status} ms=${r.ms.toFixed(0)}`);
  if (r.body?.result?.tools) {
    for (const t of r.body.result.tools) console.log(`  - ${t.name}: ${t.description?.slice(0, 60) ?? ""}`);
  } else {
    console.log("  body:", JSON.stringify(r.body).slice(0, 300));
  }
}

async function callTool(sessionId: string, name: string, args: any, timeoutMs = 60_000) {
  const r = await call("tools/call", { name, arguments: args }, { sessionId, timeoutMs });
  console.log(`tools/call ${name}: status=${r.status} ms=${r.ms.toFixed(0)}`);
  if (r.body?.result?.content) {
    for (const c of r.body.result.content) {
      console.log(`  [${c.type}] ${c.text?.slice(0, 400) ?? JSON.stringify(c)}`);
    }
  } else if (r.body?.error) {
    console.log("  error:", r.body.error);
  } else {
    console.log("  body:", JSON.stringify(r.body).slice(0, 300));
  }
  return r;
}

// ───── tests ─────

const test = process.argv[2] ?? "all";

const sid = await initialize();
await listTools(sid);

if (test === "echo" || test === "all") {
  console.log("\n=== echo ===");
  await callTool(sid, "echo", { text: "hello desk" });
}

if (test === "cross_do" || test === "all") {
  console.log("\n=== cross_do (E2: cross-DO routing) ===");
  await callTool(sid, "cross_do", { key: "k1", value: "v1-" + Date.now() });
}

if (test === "long_wait" || test === "all") {
  for (const sec of [5, 30, 60]) {
    console.log(`\n=== long_wait ${sec}s (E1: connection liveness) ===`);
    const t0 = performance.now();
    await callTool(sid, "long_wait", { seconds: sec }, sec * 1000 + 10_000);
    console.log(`  wall: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }
}

if (test === "poll_for") {
  console.log("\n=== poll_for (the elicit pattern) ===");
  console.log("Drive: in another terminal:");
  console.log(`  curl -X POST 'http://127.0.0.1:8917/set?key=ans&value=ship'`);
  console.log("Calling poll_for now (60s timeout)...");
  await callTool(sid, "poll_for", { key: "ans", timeout_seconds: 60 }, 65_000);
}

console.log("\ndone.");
