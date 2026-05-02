# 2026-04-27 — desk.elicit working end-to-end via MCP

## What happened

Agent → MCP → device → button → MCP → agent. Full loop, real edge.

```
laptop (MCP client)
  ↓  POST /mcp tools/call { name: "elicit", question, options }
  ↓
desk-fabric.workers.dev (production)
  ↓
DeskMcp DO  (per-MCP-session, McpAgent-backed)
  ↓  writes pending request into AppRunner DO
  ↓  polls AppRunner DO every 250ms for an answer
  ↓
M5StickC dock (HTTPS-polling /list every 10s)
  ↓  /list returns pending_elicit { question, options }
  ↓  M5 force-opens "elicit" app (takeover from dock)
  ↓  AppRunner intercepts even non-elicit /run with elicit-takeover frame
  ↓  M5 renders "AGENT ASKS / deploy desk-fabric to prod? / A: ship cancel"
  ↓  user presses A
  ↓  /run?app=elicit&action=input&input={btn,a,down}
  ↓  AppRunner.resolveElicit writes choice to answer slot
  ↓
DeskMcp DO's poll loop sees the answer on poll #56 (~16s elapsed)
  ↓
returns { choice: "ship" } via SSE to the original MCP caller
```

## Numbers

- 17.0s total round-trip from laptop firing call to result returning
- 56 polls at 250ms = 14s blocked + ~3s of edge round-trip overhead
- Worker compute: minimal — DOs + AppRunner DO (already exists for apps)
- M5 latency to surface elicit: bounded by 10s dock-poll interval
  (could be reduced by polling /list more often; trade vs. battery)

## What's now true (D10 lived in production)

- `/mcp` endpoint on desk-fabric-exp13, bearer-auth gated by DESK_DEVICE_TOKEN
- `desk.elicit(question, options, timeout_seconds)` tool, schema-validated
- `desk.echo(text)` tool, sanity-check
- Elicit takeover: ANY HTTPS request to /run is intercepted by AppRunner
  if there's a pending elicit. The user can't accidentally bypass.
- /list returns pending_elicit so the M5 yanks to takeover even on dock
  auto-refresh, not just on button press.

## Architecture validation

The exp-17 spike's claims all held in production:
- McpAgent.serve("/mcp") integration works at the deployed scale
- Cross-DO routing (DeskMcp → AppRunner via env binding) is fast
- Tools that block on cross-DO state work for at least 60s without timeouts
- McpAgent's per-session DO state is automatic; no manual session mgmt

## What's NOT yet built (deferred, real)

- `desk.notify(text)` — passive badge, queued in dock corner
- `desk.tally(label)` — generic counter any agent can ++
- `desk.observe()` — read M5's current state (active app, IMU snapshot)
- OAuth on /mcp — currently DESK_DEVICE_TOKEN bearer; a public store would
  need OAuth 2.1 with PKCE. v1 is personal-only so bearer is fine.
- Real MCP client compatibility — tested with our own probe.ts. Real-world
  Claude Desktop / Cursor / pi need a smoke-test pass.

## Reproduce

```bash
DESK_DEVICE_TOKEN=$(cat ~/.config/desk/device-token | tr -d '[:space:]') \
  bun ~/cloudflare/desk/experiments/exp-13-artifacts-app-source/elicit-test.ts
```

Watch the M5. It will chirp twice, take over the screen, and prompt for input.
