# exp-07 · RESULT (partial)

**Date:** 2026-04-27
**State:** 🟡 **Partial — protocol dance verified locally; real-LEE leg deferred to next session (no AX_TOKEN in this agent's environment)**

## What was built

A single-file Bun TypeScript client at `src/lee-cli.ts` (**146 lines**,
under the 200-line budget). One dependency: `ws` + `@types/ws`. Two modes:

- **`FAB_LOCAL=1 bun lee-cli.ts smoke`** — runs the full
  mint→verify→upgrade→receive dance against the local `_fab-local`
  Worker. Uses the exp-01 transport DO and the exp-02 auth DO directly
  to validate the protocol layer without needing real Cloudflare Access
  credentials.
- **`AX_HOST=... AX_TOKEN=... bun lee-cli.ts "hello"`** — points at real
  `cloudflare-agent`; mints a session token via `/api/ws`, opens a WS
  to `/agents/cloudflare-agent/<userTag>?t=<token>`, sends a chat request
  envelope, prints streamed bytes.

## Smoke run output (against `_fab-local`)

```
[1/4] checking http://127.0.0.1:8911/healthz
      ok
[2/4] minting presence-bound device JWT (exp-02 flow)
      jti=22884016-3930-45ab-a715-1ab75e712663  presence_window=60000ms
[3/4] verifying token
      {"ok":true,"jti":"...","age_ms":2,"sub":"lee-cli-smoke"}
[4/4] opening WS to /seq/lee-cli-smoke (exp-01 transport)
      connected, listening for 3 seq frames
      <- {"seq":1,"ts":1777302859945}
      <- {"seq":2,"ts":1777302860945}
      <- {"seq":3,"ts":1777302861945}

✅ smoke pass
```

## What this proves

- **The protocol-level dance works.** `fetch` → mint token → upgrade WS
  → receive streamed JSON frames. Every step in the cloudflare-agent
  flow has a tested local analog.
- **A 146-line client is enough.** No frameworks, no SDK, no agent SDK
  port. Just `fetch` + `ws`. That gives us a credible budget for
  M5 (where we have ~80KB RAM headroom and need ~300 LOC of MicroPython).
- **The transport semantics from exp-01 hold for an arbitrary TS client.**
  Hibernation, alarms, multi-frame streaming all observed.

## What this does NOT yet prove

- **Real cloudflare-agent end-to-end.** Needs `AX_TOKEN` (the user's
  Cloudflare Access JWT for the agent's audience). the operator can run this
  himself with one env var. The agent CANNOT mint that JWT.
- **The exact LEE wire format.** The smoke run uses the exp-01 SeqRoom's
  trivial `{seq, ts}` shape. Real cloudflare-agent uses the agents SDK
  envelope (we send `cf_agent_chat_request` as a guess based on
  `cloudflare-agent`'s patterns; the response shape is unknown to this
  client until run against the real worker). The CLI prints bytes
  verbatim so any shape will be visible — *but parsing/rendering them
  meaningfully is the next sub-experiment.*

## Open question for exp-07b (next session)

What does cloudflare-agent's WS actually emit? The agents SDK uses a
specific envelope (see `node_modules/agents/...` in the cloudflare-agent
repo, or just *run the CLI against staging* and observe). Once we know,
we know what the M5 client and pi-TUI client need to render.

Two ways to find out, both cheap:

1. **`AX_HOST=https://staging.ax.cloudflare.dev AX_TOKEN=<jwt> bun lee-cli.ts "hi"`**
   — the operator runs this in his shell with his real credentials. Output
   bytes go to stdout. We learn the shape from observation.
2. **Read `apps/cloudflare-agent/src/agent.ts` + the agents SDK source**
   to map the messages it emits via `routeAgentRequest`. Static analysis,
   no auth needed. Slower, more thorough.

Recommend (1) — fastest, ground truth.

## Decision (for the LEE chat app)

> **The desk LEE-chat app's wire protocol is whatever cloudflare-agent
> emits.** desk does not invent a parallel protocol. The CLI client built
> here is the reference implementation; the M5 and pi-TUI clients are
> reskins of the same handshake + message loop, with different render
> layers on top.

## Reproduce

```bash
# Local protocol smoke (no creds needed):
cd ~/cloudflare/desk/experiments/_fab-local && bunx wrangler dev &
cd ~/cloudflare/desk/experiments/exp-07-lee-cli-client && bun run smoke

# Real LEE (requires Cloudflare Access JWT for the agent's audience):
AX_HOST=https://staging.ax.cloudflare.dev \
AX_TOKEN="<your-api-gateway-jwt>" \
bun src/lee-cli.ts "hello"
```
