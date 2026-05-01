# exp-06 · RESULT

**Date:** 2026-04-27
**State:** 🟢 **Graduated** — there is a clean, existing path. No Lee-side changes needed.

## What the cloudflare-agent Worker exposes (read line-by-line)

`apps/cloudflare-agent/src/index.ts` defines two distinct authenticated
surfaces on top of the same DO-backed agent:

### Path 1 — Service binding (Lee → CloudflareAgent)
- WS upgrade on `/agents/cloudflare-agent/:userTag` with **no token**.
- Trusted because service bindings are an internal Cloudflare runtime
  channel; you can't reach it from the public internet.
- This is how Stratus's Lee Worker forwards turns today.
- **Not available to a desk client** — service bindings are Worker→Worker
  only.

### Path 2 — Direct browser connection (`/api/ws` → WS upgrade with `?t=<token>`)

Two-step:

1. **`GET /api/ws`** — the caller proves they're a real Cloudflare employee
   via the **API Gateway middleware** (`packages/auth/src/api-gateway.ts`).
   That middleware does:
   - Reads `Authorization: Bearer <jwt>`
   - Verifies signature via JWKS at `API_CERTS_URL`
   - Verifies audience matches `API_AUD`
   - Extracts `{ accountId, accountTag, accountName, userId, userTag,
     userEmail }` from the payload's `account`/`user` claims.
   - Returns 401 if any step fails.
   - On success, the handler mints an **encrypted session token** (JWE,
     `A256GCMKW` + `A256GCM`) sealed with `SESSION_KEY`, containing the
     resolved `Auth` + a 6-hour expiration.
   - Returns `{ wsUrl, agentHost, token, userTag }`.

2. **`WS /agents/cloudflare-agent/:userTag?t=<token>`** — middleware
   parses the session token via `parseToken(token, SESSION_KEY)`, checks
   `expiration > now`, and routes to the user-tag-keyed CloudflareAgent
   DO via the agents SDK. Tools, MCP, prompts, all unchanged.

**This second path is the one a non-Stratus client can ride.**

## What a desk client needs to do, end-to-end

```
┌─────────────────┐    1. Bearer JWT     ┌──────────────────────┐
│  desk client    │ ───────────────────▶ │  cloudflare-agent    │
│  (M5 / pi /     │                      │  /api/ws             │
│   browser)      │ ◀─────────────────── │  (validates via      │
│                 │   2. session token   │   API Gateway JWKS)  │
└────────┬────────┘                      └──────────────────────┘
         │
         │ 3. WS upgrade with ?t=<session_token>
         ▼
┌─────────────────────────────────────────────────────────────┐
│  /agents/cloudflare-agent/<userTag>?t=<token>               │
│  → routeAgentRequest → CloudflareAgent DO                   │
│  → existing chat protocol, tools, MCP                       │
└─────────────────────────────────────────────────────────────┘
```

The desk client needs **one input**: a Cloudflare API Gateway JWT for
the `cloudflare-agent` audience. That JWT is what employees already get
when they log into anything Cloudflare-internal via Access. The desk
client itself has no special permissions — it borrows the user's
identity for the duration of a session.

## Threat model — desk vs. Stratus

| Property | Stratus (browser) | Desk (M5 / pi / arbitrary client) |
|---|---|---|
| User identity proof | Cloudflare Access SSO via API Gateway JWT | **Same** API Gateway JWT |
| Token at rest on client | session JWE in browser memory + cookie | session JWE in device/process memory |
| Token replay window | 6h hard cap, refresh via re-auth | **Same** |
| Token theft impact | Attacker speaks as user for ≤6h | **Same** |
| Token theft + key extraction | Browser sandbox | **Worse** — M5 flash is plaintext |
| Network confidentiality | TLS to ax.cloudflare.dev | TLS, **plus** option to layer exp-03 E2E |
| MCP write capability | Granted by user via elicitation per call | Same elicitation flow; desk renders to LCD |

The threat model is **identical for browser-class clients** (a pi-TUI on
your laptop, a browser tab opened by URL). It is **strictly worse on the
M5** because the M5 holds the session JWE in clear flash. Mitigation:

- **Layered presence-binding (exp-02)** in front of `/api/ws` so that
  even a stolen 6h session token requires a fresh device heartbeat to be
  honored. Becomes a proxy in front of cloudflare-agent that the M5
  authenticates to with a presence-bound token, and that proxy then
  holds the API Gateway JWT and brokers the chat.
- **No `/api/token` write enablement on M5 sessions** — the desk client
  never gets to elevate to write tokens; that flow stays on Stratus.
  M5 = read-only conversational access.

This **strictly improves** posture vs. Stratus for the M5 surface, by
voluntarily accepting fewer capabilities than the existing flow grants.

## Decision unblocked

> **Lee-chat app architecture for desk:**
>
> 1. Browser/pi/CLI clients: connect directly to `cloudflare-agent` at
>    `/api/ws` using the user's Cloudflare API Gateway JWT (Bearer auth).
>    Receive session JWE; upgrade WS with `?t=`. Same flow as Stratus.
>
> 2. M5 (constrained device): connect to a tiny **desk-broker Worker**
>    (we own this). desk-broker holds the API Gateway JWT (issued by the
>    user once at pairing time). M5 talks to desk-broker over a
>    presence-bound device JWT (exp-02). desk-broker brokers WS frames
>    to/from cloudflare-agent's `/api/ws`. Read-only by policy: write
>    elicitations from CloudflareAgent are filtered out and the user is
>    told "open Stratus to approve this."
>
> No Lee-side / cloudflare-agent-side changes are required for either path.

## Open questions surfaced (NOT blockers)

These are real and need their own experiments, but don't block desk.

- **exp-07** — What's the minimum WS protocol subset for "send message,
  receive streaming response" from a stripped-down client? (LeeProtocolAdapter
  was designed against the Lee-Stratus protocol, not the cloudflare-agent
  WS protocol directly. Need to read what the agents SDK actually emits.)
- **exp-08** — How does the desk-broker obtain the user's API Gateway JWT
  in the first place? Browser-mediated handoff at pairing time is the
  obvious answer; need to spec it.
- **MCP write filter** — non-trivial. CloudflareAgent's MCP elicitations
  travel inside the agent stream; the broker needs to inspect frames
  and either drop, redirect-to-Stratus, or veto. Worth its own exp.

## Reproduce

```bash
# Read the auth surface yourself:
cd ~/cloudflare/cloudflare-agent
sed -n '60,110p' apps/cloudflare-agent/src/index.ts   # WS auth middleware
sed -n '116,165p' apps/cloudflare-agent/src/index.ts  # /api/ws issuance
cat packages/auth/src/api-gateway.ts                  # API Gateway JWT validator
cat packages/auth/src/session.ts                      # JWE session token
```
