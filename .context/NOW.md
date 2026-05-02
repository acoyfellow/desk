# NOW

**Last touched:** 2026-05-01 (browser frame renderer graduated: exp-05b)

## Locked product identity

desk is a platform. The forcing function: **the operator can hold the M5
and build apps from the device, on the fly.** A larger agent ("LEE") is a
future tenant of desk, not desk's reason for existing.

A second compelling vector is dogfood-driven: **desk's MCP server lets
any MCP-capable agent in the operator's toolchain (pi, opencode, hermes,
Claude Desktop, Cursor) use the device for human-in-the-loop interaction.**
The "build apps on device" forcing function still holds; the MCP
integration is the killer demo for everyone but the operator.

## What ships in production today

The fabric Worker (URL configured per operator; see installation docs)
exposes:

| Endpoint | What |
|---|---|
| `GET /healthz` | unauth liveness |
| `GET /viewer` | unauth — browser frame renderer (operator pastes bearer in setup form or URL hash) |
| `GET /list` | apps + `pending_elicit` + `pending_notify` + `volume_target` (bearer auth) |
| `POST /run?app=...&action=...` | render an app frame (bearer auth) |
| `POST /mcp` | MCP server, McpAgent.serve("/mcp") (bearer auth) |

### MCP tools

- **`desk.echo(text)`** — sanity check
- **`desk.ask(question, options[], timeout_seconds)`** — yank device screen, return user choice
- **`desk.inbox(text, level)`** — post a non-blocking notification to device
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
D10 MCP (McpAgent.serve('/mcp') on the fabric Worker), **D11 protocol
portability (browser viewer ⇔ M5)**, **D12 bearer-in-hash for v0 viewer auth**.

## Hard rules

- **I-1 single-account** — desk runs on the operator's own Cloudflare account; never crosses into someone else's. (See INVARIANTS.md.)
- Rule 1: no production code without a graduated experiment
- Rule 2: read CF docs `llms.txt` FIRST when touching primitives

## Up next (priority)

1. **exp-09: QuickJS-WASM sandbox.** Already-queued alternative app-host
   runtime. Picked up alongside exp-05b for "the most fun" path. Compares
   Worker Loader vs in-process QuickJS isolation on the same counter
   workload, measures the 5 exp-04 attacks. Unblocks live-coded apps in
   the prompt→app loop.
2. **exp-19: device firmware OTA** (proposal in
   `experiments/exp-19-can-firmware-be-OTA-from-artifacts/`). Closes the
   loop on agent-driven firmware fixes.
3. **Public-release polish.** LICENSE shipped (MIT). Still need: rename
   `experiments/exp-13-…/` to top-level `fabric/`, end-to-end install
   doc that a new operator can follow without help.
4. **Per-device routing.** The singleton AppRunner means one device. Multi-
   device needs device IDs in routing keys.
5. **OAuth on `/mcp` and `/viewer`.** v1 uses bearer; a public app store
   would need OAuth 2.1. Both surfaces need it before going public.
6. **Pet's setAlarm replacement** (F-10) — supervisor-mediated alarms so
   pet's decay can run without polling on init.
7. **F-14/F-15 viewer hygiene** — fix the rapid-B input-swallow and
   active-app external-state-sync gaps from exp-05b's findings.

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
