# exp-07 · A minimal CLI client that talks to LEE via `/api/ws`

## Why

exp-06 graduated with a claim: a non-Stratus client can ride
`cloudflare-agent`'s existing `/api/ws` flow with no Lee-side changes.
This experiment **builds the smallest possible client** to falsify or
confirm that claim end-to-end.

If the CLI client works against real `cloudflare-agent`, exp-06's
architectural conclusion is empirically validated and we have the
shortest possible artifact for desk: ≤200 lines of Node, no UI, just
"send message → see streamed response."

Also serves as the **reference implementation** for the protocol —
once it works, the M5 client and pi-TUI client are reskins of it.

## Acceptance criteria

1. `lee-cli "hello"` opens a WebSocket to `/agents/cloudflare-agent/<userTag>?t=<token>`
   after first acquiring a session token via `/api/ws`.
2. Receives streaming chunks and prints them to stdout.
3. Total client code (single file, no deps beyond `ws`) is **≤200 lines**.
4. Auth ergonomics: client reads the API Gateway JWT from one env var
   (`AX_TOKEN`) and the agent host from another (`AX_HOST`). No hidden config.
5. Local-only sanity mode against `_fab-local` proves the *protocol-level
   handshake* (mint token, verify, upgrade, send/receive) is correct
   without needing real Lee credentials.

## State

🟡 in progress
