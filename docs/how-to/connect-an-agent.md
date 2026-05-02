# How to connect an agent

This solves the problem of letting an MCP-capable agent (Claude
Desktop, Cursor, opencode, pi, hermes, your own script) drive
desk to:

- Ask you questions on your wrist (`desk.ask`)
- Post notifications (`desk.inbox`)
- Show ambient activity (`desk.observe`)
- Change wrist volume (`desk.set_volume`)
- Sanity-check the connection (`desk.echo`)

## Prerequisites

- The fabric Worker deployed (see [deploy-the-fabric.md](deploy-the-fabric.md))
- `DESK_DEVICE_TOKEN` and `DESK_MCP_URL` exported in your shell

## Pattern A: Native MCP client (Claude Desktop, Cursor)

Most MCP clients support remote servers via HTTP. Add to the
client's MCP config:

```json
{
  "mcpServers": {
    "desk": {
      "url": "https://<your-fabric>.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <DESK_DEVICE_TOKEN>"
      }
    }
  }
}
```

For **Claude Desktop**: edit
`~/Library/Application Support/Claude/claude_desktop_config.json`,
restart the app.

For **Cursor**: settings → MCP → Add server.

For **opencode**: edit `~/.config/opencode/opencode.jsonc`.

After restart, the desk tools (`desk.ask`, `desk.inbox`, etc.)
appear in the agent's tool list.

## Pattern B: Local stdio proxy (clients without custom-header support)

Some MCP clients treat 401 Bearer responses as OAuth-only and
ignore the `headers` config. For those, use the local stdio
proxy that ships with desk:

```json
{
  "mcpServers": {
    "desk": {
      "command": "bun",
      "args": ["/path/to/desk/tools/desk-mcp-proxy.ts"],
      "env": {
        "DESK_MCP_URL": "https://<your-fabric>.workers.dev/mcp"
      }
    }
  }
}
```

The proxy reads `DESK_DEVICE_TOKEN` from
`~/.config/desk/device-token` if not in the env. It speaks
stdio JSON-RPC to the agent, forwards over the streamable
HTTP transport to the fabric.

## Pattern C: Headless from a script

```bash
DESK_MCP_URL="https://<your-fabric>.workers.dev/mcp" \
DESK_DEVICE_TOKEN="$(cat ~/.config/desk/device-token | tr -d '[:space:]')" \
bun demos/agent-elicit.ts
```

This runs `desk.ask("should I keep going?", ["yes please", "wait", "take a break"])`
and prints the user's answer. Use it to verify the MCP path
end-to-end before integrating into a real agent.

## Verifying the connection

Once the client is wired, ask the agent something like:

> Use the desk.echo tool to send "hello from <client>".

If desk responds with `desk says: hello from <client>`, you're
connected. If the call fails:

- Check `DESK_MCP_URL` ends in `/mcp` (not `/mcp/` and not the bare base URL)
- Check the bearer token matches the secret you `wrangler secret put`
- Check the fabric is actually deployed: `curl https://<fabric>/healthz` returns `ok`

## Common workflows

### Ask the user before destructive actions

```
agent: I'm about to delete 3 files. Use desk.ask("delete?", ["yes", "no"], 60).
[wrist takes over, user presses A]
agent: Got "yes". Deleting...
```

### Stream activity without blocking

```
agent: [calls desk.observe("running tests", body="142/200", phase="testing", ttl_seconds=60)]
[wrist shows ambient status; user can glance, no input needed]
```

### Office mode

```
operator: I'm in the office. Use desk.set_volume(0).
agent: [calls desk.set_volume(0)]
agent: Got it. Volume set to mute. The wrist will silence on its next dock-refresh poll.
```

### Notification, not interruption

```
agent: Tests passed. desk.inbox("142 passed in 4.2s", "info")
[wrist beeps once and shows the message; user dismisses with A]
```

## Changing volume

The wrist has three volume levels (mute / quiet / loud). Three
ways to change it:

1. **Remote (any agent):** `desk.set_volume(0|1|2)` — change persists
   across reboots; device picks it up on next poll (~10s).
2. **On-device:** hold-B on the local STATUS screen (rescue mode)
   cycles 0 → 1 → 2 → 0.
3. **Direct flash:** `mpremote ... fs cp <(echo 1) :desk_volume`.

## Sharing a desk fabric (don't, yet)

The bearer is a static shared secret. Anyone with it can drive
every tool on your wrist. There's no audit log, no per-agent
scoping, no revocation.

If you give an agent the bearer, you're trusting:

- That agent's ability to keep secrets
- Every machine that agent runs on
- The transitive trust of any tool that agent calls

For v0, treat the bearer like an SSH key. Don't share it across
operators. Don't paste it into chat. Don't commit it to a public
repo.

OAuth on `/mcp` is on the roadmap but not shipped.

## See also

- [MCP tools reference](../reference/mcp-tools.md) — exact signatures of each tool
- [HTTP endpoints reference](../reference/http-endpoints.md) — what `/mcp` runs alongside
- [Architecture explanation](../explanation/architecture.md#why-mcp) — why MCP at all
