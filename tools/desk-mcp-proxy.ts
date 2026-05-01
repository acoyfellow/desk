#!/usr/bin/env bun
// Local stdio MCP proxy for desk.
// Why: opencode's remote MCP config currently treats 401 Bearer as OAuth-only
// and does not appear to expand custom Authorization headers for desk.
// This proxy keeps DESK_DEVICE_TOKEN in the local environment and forwards
// stdio JSON-RPC to the deployed Streamable HTTP MCP endpoint.

const BASE = process.env.DESK_MCP_URL;
if (!BASE) {
  console.error("desk-mcp-proxy: export DESK_MCP_URL=https://<your-fabric>.workers.dev/mcp");
  process.exit(2);
}
let TOKEN = process.env.DESK_DEVICE_TOKEN;
if (!TOKEN || TOKEN.includes("${")) {
  try {
    TOKEN = (await Bun.file(`${process.env.HOME}/.config/desk/device-token`).text()).trim();
  } catch {
    // fall through to the explicit error below
  }
}
if (!TOKEN || TOKEN.includes("${")) {
  console.error("desk-mcp-proxy: DESK_DEVICE_TOKEN is required or ~/.config/desk/device-token must exist");
  process.exit(2);
}

let sessionId: string | null = null;
const decoder = new TextDecoder();
const encoder = new TextEncoder();
let buf = "";

function write(msg: any) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function parseMcpResponse(res: Response): Promise<any> {
  const text = await res.text();
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data && data !== "[DONE]") return JSON.parse(data);
        }
      }
    }
    throw new Error("no SSE data in MCP response: " + text.slice(0, 200));
  }
  return JSON.parse(text);
}

async function forward(msg: any) {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify(msg),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return await parseMcpResponse(res);
}

async function handleLine(line: string) {
  if (!line.trim()) return;
  let msg: any;
  try { msg = JSON.parse(line); }
  catch (e: any) { return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: e.message } }); }

  // Notifications have no id; forward but don't write a response.
  const isNotification = msg.id === undefined || msg.id === null;
  try {
    const out = await forward(msg);
    if (!isNotification && out) write(out);
  } catch (e: any) {
    if (!isNotification) write({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32000, message: e.message } });
  }
}

for await (const chunk of Bun.stdin.stream()) {
  buf += decoder.decode(chunk, { stream: true });
  while (true) {
    const idx = buf.indexOf("\n");
    if (idx < 0) break;
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    await handleLine(line);
  }
}
if (buf.trim()) await handleLine(buf);
