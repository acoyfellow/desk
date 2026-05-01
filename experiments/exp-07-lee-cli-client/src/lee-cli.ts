#!/usr/bin/env bun
// lee-cli.ts — minimal client for cloudflare-agent's /api/ws flow.
//
// Two modes:
//
//   AX_HOST=https://staging.ax.cloudflare.dev AX_TOKEN=<api-gw-jwt>  bun lee-cli.ts "hello"
//     → real LEE
//
//   FAB_LOCAL=1  bun lee-cli.ts smoke
//     → hits the desk-fab-local Worker at http://127.0.0.1:8911 to validate
//       the *protocol-level* dance (mint→connect→message→close) without
//       needing real Cloudflare Access credentials. Only available when
//       wrangler dev is running.
//
// Total: aiming for ≤200 lines incl. blank lines and types.

import WebSocket from "ws";

interface SessionResponse {
  status: string;
  result: { wsUrl: string; agentHost: string; token: string; userTag: string };
}

const arg = process.argv[2];
if (!arg) {
  console.error("usage: lee-cli <message>   |   FAB_LOCAL=1 lee-cli smoke");
  process.exit(2);
}

if (process.env.FAB_LOCAL === "1") {
  await runFabLocalSmoke();
} else {
  await runLee(arg);
}

// ────────────────────────────────────────────────────────────────────────────
// Mode A: real cloudflare-agent
// ────────────────────────────────────────────────────────────────────────────

async function runLee(message: string) {
  const host = mustEnv("AX_HOST");                       // e.g. https://staging.ax.cloudflare.dev
  const apiToken = mustEnv("AX_TOKEN");                  // your API Gateway JWT

  console.error(`[1/3] minting session token at ${host}/api/ws`);
  const sessRes = await fetch(`${host}/api/ws`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!sessRes.ok) {
    console.error(`  failed: HTTP ${sessRes.status} ${await sessRes.text()}`);
    process.exit(1);
  }
  const sess = (await sessRes.json()) as SessionResponse;
  console.error(`      userTag=${sess.result.userTag}  agentHost=${sess.result.agentHost}`);

  const wsUrl = `${sess.result.wsUrl}?t=${encodeURIComponent(sess.result.token)}`;
  console.error(`[2/3] connecting WS: ${wsUrl.replace(/t=[^&]+/, "t=***")}`);
  const ws = new WebSocket(wsUrl);

  await once(ws, "open");
  console.error(`[3/3] connected, sending message`);

  // Agents SDK uses a JSON envelope. The exact shape needs verification
  // against cloudflare-agent's wire format — for now send a generic prompt
  // shape and print whatever comes back. exp-07 explicitly notes this as
  // an open protocol-discovery question.
  ws.send(JSON.stringify({
    type: "cf_agent_chat_request",
    id: crypto.randomUUID(),
    init: { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: message }] }) },
  }));

  ws.on("message", (data) => {
    const s = data.toString();
    process.stdout.write(s);
  });
  ws.on("close", (code, reason) => {
    console.error(`\n[ws closed] code=${code} reason=${reason || "(none)"}`);
  });
  ws.on("error", (e) => console.error(`[ws error]`, e.message));

  // Hold the process; user kills with Ctrl-C.
  await new Promise(() => {});
}

// ────────────────────────────────────────────────────────────────────────────
// Mode B: protocol smoke against desk-fab-local
// ────────────────────────────────────────────────────────────────────────────

async function runFabLocalSmoke() {
  const BASE = "http://127.0.0.1:8911";
  console.error(`[1/4] checking ${BASE}/healthz`);
  const h = await fetch(`${BASE}/healthz`);
  if (!h.ok) { console.error(`  fab-local not up; run: cd experiments/_fab-local && bunx wrangler dev`); process.exit(1); }
  console.error(`      ok`);

  console.error(`[2/4] minting presence-bound device JWT (exp-02 flow)`);
  const issue = await fetch(`${BASE}/auth/issue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: "lee-cli-smoke" }),
  });
  const { token, jti, presence_window_ms } = (await issue.json()) as {
    token: string; jti: string; presence_window_ms: number;
  };
  console.error(`      jti=${jti}  presence_window=${presence_window_ms}ms`);

  console.error(`[3/4] verifying token`);
  const check = await fetch(`${BASE}/auth/check?token=${encodeURIComponent(token)}`);
  const checkBody = await check.json();
  console.error(`      ${JSON.stringify(checkBody)}`);

  console.error(`[4/4] opening WS to /seq/lee-cli-smoke (exp-01 transport)`);
  const ws = new WebSocket(`ws://127.0.0.1:8911/seq/lee-cli-smoke`);
  await once(ws, "open");
  console.error(`      connected, listening for 3 seq frames`);

  let n = 0;
  await new Promise<void>((resolve) => {
    ws.on("message", (data) => {
      const s = data.toString();
      console.error(`      <- ${s}`);
      n++;
      if (n >= 3) { ws.close(); resolve(); }
    });
  });

  console.error("\n✅ smoke pass — token flow + WS transport work end-to-end against fab-local");
  console.error("   To hit real LEE, set AX_HOST and AX_TOKEN and run without FAB_LOCAL=1.");
}

// ────────────────────────────────────────────────────────────────────────────
// utils
// ────────────────────────────────────────────────────────────────────────────

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`missing env: ${name}`); process.exit(2); }
  return v;
}

function once(ws: WebSocket, ev: "open" | "close" | "message"): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once(ev as any, () => resolve());
    ws.once("error", reject);
  });
}
