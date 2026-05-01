# desk demos — drive the live MCP from a laptop

Small scripts that talk to your deployed fabric Worker's `/mcp` endpoint.
Each picks up the bearer token from `DESK_DEVICE_TOKEN` and the URL from
`DESK_MCP_URL`.

| File | What it does |
|---|---|
| `agent-elicit.ts` | Runs `desk.ask("should I keep going?", ["yes please", "wait", "take a break"])`. Inbox takes over the M5 screen; user presses A or holds A; result returns. |
| `elicit-test.ts` | Direct `desk.ask` smoke test with a hardcoded "deploy?" question. |

## Run

```bash
export DESK_MCP_URL="https://<your-fabric>.workers.dev/mcp"
export DESK_DEVICE_TOKEN="$(cat ~/.config/desk/device-token | tr -d '[:space:]')"

bun demos/agent-elicit.ts elicit
```

## What they prove

- The fabric MCP server (`/mcp`) accepts bearer auth and routes `tools/call`
  to the right `McpAgent` DO method.
- `desk.ask` blocks for up to 60s waiting on a wrist button press.
- `desk.inbox` posts a non-blocking message to the Inbox surface.
