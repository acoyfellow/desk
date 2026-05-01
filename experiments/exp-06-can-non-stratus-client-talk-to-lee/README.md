# exp-06 · Can a non-Stratus client connect to Lee's chat WS, with what auth?

## Why this matters

The killer app for desk is "chat with LEE." LEE is the existing Cloudflare
employee-facing AI agent at `ax.cloudflare.dev`, backed by the
`cloudflare-agent` monorepo. If a non-Stratus client (M5, pi TUI, browser
tab loaded by URL, Atom Echo) can connect to LEE with a sensible auth
story, **we don't build a new agent** — we build a new client for an
existing battle-tested one.

If it cannot, exp-06 disproves the hypothesis and we either:
- propose Lee-side changes (high cost, requires team alignment), or
- build a parallel desk-only agent (high cost, less interesting), or
- defer the LEE app and pick a smaller MCP target.

## Acceptance criteria

This experiment graduates if all three are true:

1. There is **at least one auth path** in the existing `cloudflare-agent`
   Worker that a non-Stratus client could ride **without Lee-side code
   changes**, and we have read it line-by-line.
2. We can describe end-to-end what a desk client would need to obtain,
   transmit, and refresh — with no hand-waving.
3. The path's threat model is documented and is **at least as strict as
   Stratus's**, not weaker.

## State

🟢 **Graduated** — see RESULT.md
