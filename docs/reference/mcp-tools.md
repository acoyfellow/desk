# MCP tools

The fabric Worker exposes an MCP server at `/mcp` (Streamable
HTTP transport). Any MCP-capable agent given the bearer token
can call these tools.

## Endpoint

```
POST https://<your-fabric>.workers.dev/mcp
Authorization: Bearer <DESK_DEVICE_TOKEN>
Content-Type: application/json
Accept: application/json, text/event-stream
```

The server uses `McpAgent.serve("/mcp")` from the `agents/mcp`
package; sessions are tracked via the `Mcp-Session-Id` header
that the server returns on `initialize`.

## Tools

### `desk.echo(text)`

Sanity check. Returns `desk says: <text>`.

| Field | Type | Notes |
|---|---|---|
| `text` | string | what to echo back |

Use this to verify your MCP client is wired correctly before
trying anything that affects the wrist.

### `desk.ask(question, options, timeout_seconds?)`

**Blocking.** Yanks the wrist screen to the inbox surface,
displays `question`, waits for the user to press a button, and
returns their choice.

| Field | Type | Notes |
|---|---|---|
| `question` | string | shown in big text; wraps at 16 chars |
| `options` | array of 1–3 strings | `options[0]` = A button. `options[1]` (optional) = shown but unselectable visual; use as a "cancel" hint. `options[2]` (optional) = long-press A. |
| `timeout_seconds` | number 1..120, default 60 | how long to wait |

Returns:

```json
{ "choice": "<the chosen option>", "polls": <number>, "elapsed_ms": <number> }
```

Or, on timeout:

```json
{ "isError": true, "content": [{ "type": "text", "text": "timeout after 60s; user did not answer" }] }
```

Latency on the wrist: takeover appears within ~10s
(dock-refresh poll cadence) after the call hits the fabric.

### `desk.inbox(text, level?)`

**Non-blocking.** Posts a notification to the wrist. The wrist
takes over to display it on the next poll; the user dismisses
with A.

| Field | Type | Notes |
|---|---|---|
| `text` | string ≤ 200 chars | wraps on the wrist; longer is truncated |
| `level` | `"info"` \| `"warn"` \| `"error"`, default `"info"` | controls text color (white/yellow/red) |

Returns immediately with `{ ok: true, id, queued: text }`.

Newest first. Queue caps at 50; older notifications are dropped.

### `desk.observe(title, body?, repo?, phase?, level?, ttl_seconds?)`

**Non-blocking.** Updates the wrist with ambient agent
activity. Use for "showing what an agent is doing" without
asking for input. Replaces previous observation; one slot only.

| Field | Type | Notes |
|---|---|---|
| `title` | string ≤ 40 chars | required |
| `body` | string ≤ 120 chars | optional detail |
| `repo` | string ≤ 32 chars | optional repo/project name |
| `phase` | string ≤ 32 chars | optional, e.g. `"reading"`, `"editing"`, `"testing"` |
| `level` | `"info"` \| `"warn"` \| `"error"`, default `"info"` | |
| `ttl_seconds` | number 5..3600, default 120 | auto-expires after this |

The wrist picks up changes on its next dock-refresh poll.

### `desk.set_volume(level)`

Set the wrist buzzer volume. Persists across reboots; the
device picks up the change on its next dock-refresh poll
(~10s).

| Field | Type | Notes |
|---|---|---|
| `level` | integer 0..2 | 0=mute (office mode), 1=quiet, 2=loud |

Returns `{ ok: true, volume_target: <level>, label: "mute"|"quiet"|"loud" }`.

The volume setting is also editable on-device via the local
status screen (rescue mode, hold-B to cycle 0→1→2→0).

## Wiring desk into agents

### Claude Desktop / Cursor / generic MCP clients

Add to the MCP servers config:

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

If the client doesn't support custom auth headers (e.g. older
versions of opencode treat 401 as OAuth-only), use the local
stdio proxy at `tools/desk-mcp-proxy.ts`:

```json
{
  "mcpServers": {
    "desk": {
      "command": "bun",
      "args": ["/path/to/desk/tools/desk-mcp-proxy.ts"],
      "env": {
        "DESK_MCP_URL": "https://<your-fabric>.workers.dev/mcp",
        "DESK_DEVICE_TOKEN": "<bearer>"
      }
    }
  }
}
```

The proxy pulls the token from `~/.config/desk/device-token`
if `DESK_DEVICE_TOKEN` isn't set.

### Direct from a script

See `demos/agent-elicit.ts` for a Bun script that drives
`desk.ask` directly via the Streamable HTTP transport.

## See also

- [How to connect an agent](../how-to/connect-an-agent.md)
- [HTTP endpoints reference](http-endpoints.md) — what the MCP server runs alongside
- [Frame protocol reference](frame-protocol.md) — what `desk.ask` renders on the wrist
