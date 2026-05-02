# HTTP endpoints

The fabric Worker exposes the following routes. All endpoints
return JSON unless noted. All authenticated endpoints require
`Authorization: Bearer <DESK_DEVICE_TOKEN>`; unauthenticated
calls get `401`.

## Public (no auth)

### `GET /healthz`

Liveness probe. Returns `ok\n` as plain text. Cheap; safe to
poll.

### `GET /viewer`

Browser frame renderer. Returns a self-contained HTML page
(~14KB, ~5.5KB gzipped) that polls `/list` and `/run` and
renders frames against a 135×240 canvas.

The page itself is unauth (anyone can fetch the HTML), but the
viewer collects a bearer token from the user — either via a
setup form, from `sessionStorage`, or from the URL hash:

```
https://<your-fabric>.workers.dev/viewer#url=<base>&token=<bearer>
```

The hash never reaches the server. After first load it's
cached in `sessionStorage` and the URL hash can be cleared.

Cache: `Cache-Control: public, max-age=300`.

## Bearer-authenticated

### `GET /list`

Dock + state poll. Called every 10s by the M5 firmware and
every 2s by the browser viewer.

Response:

```json
{
  "apps": [
    { "id": "inbox", "versions": ["0.1.0"] },
    { "id": "counter", "versions": ["0.2.0"] }
  ],
  "pending_elicit": null | { "id", "question", "options" },
  "pending_notify": null | { "id", "text", "level" },
  "volume_target": null | 0 | 1 | 2
}
```

`apps` reflects the current state of the operator's
`desk/apps` Artifacts repo, with `inbox` always prepended.
The `elicit` and `notify` legacy app ids are filtered out
(they're MCP-tool-only now).

`pending_elicit` and `pending_notify` are surfaced so clients
can yank to the inbox surface on next poll without waiting
for a user-initiated `/run`.

`volume_target` is set by `desk.set_volume`; clients apply it
idempotently and update their on-disk persistence.

### `POST /run?app=<id>&action=<verb>&input=<json>`

Render one frame from an app. The fabric routes all `/run`
calls through a singleton `AppRunner` Durable Object that
enforces inbox takeover (pending elicit / unread notify
override the requested app).

Query params:

| Param | Required | Notes |
|---|---|---|
| `app` | yes | app id from `/list` |
| `action` | yes | `init`, `input`, or `alarm` |
| `input` | when `action=input` | URL-encoded JSON, shape `{ kind, id, phase }` |

Response:

```json
{
  "frame": { "f", "ops": [...] },
  "side_effects": [],
  "meta": {
    "version": "0.2.0",
    "contentHash": "fa60a2da...",
    "sourceFetchMs": 320
  }
}
```

`meta.sourceFetchMs` is the time the fabric spent fetching
the manifest from Artifacts; high values (>200ms) indicate a
cache miss in the module-scoped `ArtifactsAppSource`.

Errors return JSON with `{ error, name?, message? }` and
HTTP 4xx/5xx.

### `POST /mcp`

MCP server (Streamable HTTP transport). See
[MCP tools reference](mcp-tools.md) for the tools exposed.

Sessions are tracked via the `Mcp-Session-Id` response
header on the initial `initialize` call; subsequent calls
echo the id back via `Mcp-Session-Id` request header.

### `GET /side-effects?app=<id>&clear=<0|1>`

Read accumulated side-effect events for an app (currently
populated by capability stubs that never reach production
because v0 emits ops via returned frames, not capability
calls). Pass `clear=1` to drain the queue.

Useful for debugging. Not load-bearing.

## Internal / debug

### `?app=diag`

Special app id that triggers a diagnostic frame. Not in the
Artifacts repo — handled by the runtime. Reflects the
device's last request envelope plus a server-side timestamp.

The M5 firmware enables this on `run_app("diag", "init")`
calls, which it sends with an `X-Desk-Device` header
containing local diagnostic state (IP, SSID, free heap,
uptime, DNS status).

## Latency rough numbers

These are anecdotal, not measured rigorously:

| Path | p50 | Notes |
|---|---|---|
| `/healthz` | ~100ms | one round-trip, no DO |
| `/list` (warm) | ~150ms | DO storage read + Artifacts fetch (cached) |
| `/run?action=init` (warm) | ~250ms | DO + Worker Loader + facet roundtrip |
| `/run?action=input` (warm) | ~200ms | same as init, slightly less work |
| `/run?action=init` (cold) | ~900ms | first Artifacts fetch (F-7, mitigated; can spike if the Worker isolate is fresh) |
| `/mcp` `tools/call` | varies | bound by the tool's work; `desk.ask` blocks 1–60s waiting for the user |

## Auth model

Single shared bearer token (`DESK_DEVICE_TOKEN`). Constant-time
compare. Length-mismatch fast path. Fail-closed if the secret is
missing.

Anyone with the token can:

- Read the dock list and any app frame
- Drive any app (press buttons remotely)
- Drive any MCP tool (including `desk.ask` to phish the operator)
- Change the device volume

Treat the bearer like an SSH key. v0 is single-operator on
purpose. OAuth on `/mcp` is exp-12 territory.

## See also

- [MCP tools](mcp-tools.md)
- [Frame protocol](frame-protocol.md)
- [Environment variables](env-vars.md)
