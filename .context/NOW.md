# NOW

**Last touched:** 2026-05-01 (audio shipment: seq op + tunes app + real volume knob)

## Locked product identity

desk is a platform. The forcing function: **the operator can hold the M5
and build apps from the device, on the fly.** A larger agent ("LEE") is a
future tenant of desk, not desk's reason for existing.

A second compelling vector is dogfood-driven: **desk's MCP server lets
any MCP-capable agent in the operator's toolchain (pi, opencode, hermes,
Claude Desktop, Cursor) use the wrist for human-in-the-loop interaction.**
The "build apps on device" forcing function still holds; the MCP
integration is the killer demo for everyone but the operator.

## What ships in production today

The fabric Worker (URL configured per operator; see installation docs)
exposes:

| Endpoint | What |
|---|---|
| `GET /healthz` | unauth liveness |
| `GET /list` | apps + `pending_elicit` + `pending_notify` + `volume_target` (bearer auth) |
| `POST /run?app=...&action=...` | render an app frame (bearer auth) |
| `POST /mcp` | MCP server, McpAgent.serve("/mcp") (bearer auth) |

### MCP tools

- **`desk.echo(text)`** — sanity check
- **`desk.ask(question, options[], timeout_seconds)`** — yank wrist screen, return user choice
- **`desk.inbox(text, level)`** — post a non-blocking notification to wrist
- **`desk.observe(title, body?, repo?, phase?, level?, ttl_seconds?)`** — ambient agent activity status
- **`desk.set_volume(level)`** — 0=mute, 1=quiet, 2=loud (persists on device)

### Apps in dock

Current dock is intentionally small and physical/fun:

- **counter** — persistence/input sanity app
- **pet** — background/alarm/storage demo
- **tunes** — chiptune jukebox (the audio flex; ships 5 songs)
- **inbox** — reads notifications/elicits (auto-takeover surface)

Older demos (`hello`, `notify`, `tally`, `reaction`, `shaker`, `elicit`)
have either been pruned, retired, or rolled into MCP-tools-only form.

## What's true (D1–D10)

D1 transport (WS hibernation), D2 auth (presence-bound JWT, F-1+F-2 fixed),
D3 crypto (X25519+AES-256-CTR+HMAC-SHA256), D6 wire protocol (app DO emits
frames), D7 app format (markdown frontmatter + JS body), D8 runtime (Worker
Loader, 13ms cold start), D9 AppSource (Artifacts via isomorphic-git),
**D10 MCP (McpAgent.serve('/mcp') on the fabric Worker)**.

## Hard rules

- **I-1 single-account** — desk runs on the operator's own Cloudflare account; never crosses into someone else's. (See INVARIANTS.md.)
- Rule 1: no production code without a graduated experiment
- Rule 2: read CF docs `llms.txt` FIRST when touching primitives

## Up next (priority)

1. **exp-19: device firmware OTA** (proposal in
   `experiments/exp-19-can-firmware-be-OTA-from-artifacts/`). Closes the
   loop on agent-driven firmware fixes by pushing `desk-rt.py` through
   the same Artifacts pipeline as apps.
2. **Public-release polish.** LICENSE, scrub of operator-personal
   identifiers, restructuring `experiments/exp-13-...` into a top-level
   `fabric/` directory for clarity, and an end-to-end install doc that a
   new operator can follow without help.
3. **Per-device routing.** The singleton AppRunner means one wrist. Multi-
   device needs device IDs in routing keys. Important once a second
   operator (or a second M5 in one home) shows up.
4. **OAuth on `/mcp`.** v1 uses bearer; a public app store would need
   OAuth 2.1.
5. **Pet's setAlarm replacement** (F-10) — supervisor-mediated alarms so
   pet's decay can run without polling on init.

## Stopping conditions

- Any time work appears to drift onto an account other than the
  operator's → stop, surface, fall back to single-account equivalent.
- Any time an "I think this works" claim is made about runtime behavior
  → stop, write a tiny experiment that produces evidence.

## Operator-side environment

Token files live under `~/.config/desk/` with mode 600, exported via the
shell rc as environment variables:

- `device-token` → `DESK_DEVICE_TOKEN` — used by M5 + MCP clients
- `cf-deploy-token` → `CLOUDFLARE_DEPLOY_TOKEN` — Workers:Edit for `wrangler deploy`
- `cf-artifacts-edit-token` → Artifacts:Edit (revoke when not creating new repos)
- `apps-repo-token` → `art_v1_*` scoped to the `desk/apps` Artifacts repo

WiFi config lives at `~/.config/desk/wifi` (multi-network supported:
`WIFI_SSID`, `WIFI_SSID_2`, …).

M5 firmware: vanilla MicroPython **1.22.2** (NOT 1.24.1 — see
`runs/2026-04-27-m5-stable-on-edge.md` for the connectivity regression).
