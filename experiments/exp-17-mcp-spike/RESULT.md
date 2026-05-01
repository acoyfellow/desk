# exp-17 · RESULT

**Date:** 2026-04-27
**State:** 🟢 **Graduated** — all 4 unknowns answered with empirical evidence.

## What I tested

A minimal `McpAgent`-backed Worker exposing 4 tools:

| Tool | Tests |
|---|---|
| `echo` | basic plumbing |
| `cross_do` | **U2** — McpAgent DO calling into a separate `Store` DO via `idFromName` |
| `long_wait(N)` | **U1/U3** — how long a tool can hold the SSE connection alive |
| `poll_for(key)` | **the elicit pattern** — tool blocks on cross-DO state until external HTTP supplies the answer |

Code: `src/index.ts`. Driver: `src/probe.ts` (minimal MCP client over Streamable HTTP).

## Numbers

```
✅ initialize         status=200  ms=23     sessionId returned
✅ tools/list         status=200  ms=3      4 tools registered
✅ echo               status=200  ms=4      content roundtrips
✅ cross_do           status=200  ms=4      McpAgent DO → Store DO write+read, match=true
✅ long_wait(5s)      wall=5.0s             clean return
✅ long_wait(30s)     wall=30.0s            clean return, no timeout
✅ long_wait(60s)     wall=60.0s            clean return, no SSE drop
✅ poll_for           status=200  polls=21  elapsed_ms=5038
                                            tool blocked until external POST /set arrived
```

## What this proves about the architecture

**All five unknowns I was worrying about are solved by the SDK:**

| Unknown | Resolution |
|---|---|
| U1: Hono integration | `McpAgent.serve("/mcp")` returns a Worker handler; route `/mcp/*` to it from the existing default fetch. ~5 lines. |
| U2: Cross-DO routing inside a tool handler | Works. `env.STORE.idFromName(...).get(...)` from inside the McpAgent class. RPC calls to other DOs return their result. |
| U3: MCP tool timeouts | Tools can run at least 60s. SDK handles SSE keepalives transparently. No timeouts observed. |
| U4: Manual heartbeats needed? | No. SDK manages the transport. |
| U5: DO-backed sessions | `McpAgent` IS a DurableObject; per-session state automatic. |

## The elicit pattern, derived

`poll_for` is the prototype of `desk.elicit`. It proves:

1. An MCP tool handler can suspend and **wait on storage state**.
2. State can be written by **anything else with HTTP access** (in our case the M5, in this test a `curl POST`).
3. The tool resumes the moment storage updates.
4. Total round-trip is bounded only by how often the tool polls (250ms) plus how long the user takes to answer.

Translated to production:

```
Agent (Claude/pi/Cursor) → POST /mcp .../tools/call {
    name: "elicit",
    args: { question: "deploy?", options: ["ship", "cancel"] }
}
    ↓
McpAgent DO (per session) tool handler:
    1. Write {question, options} into an AppRunner DO keyed app=elicit
    2. Poll AppRunner storage every 250ms for an answer
    3. Return answer when it lands

M5 (existing dock, no changes):
    next /run?app=elicit&action=init → fetches the pending question
    User presses A → /run?app=elicit&action=input&input={...}
    AppRunner stores the answer → next poll picks it up → tool returns
```

The M5 doesn't know it's part of an MCP flow. It just runs the `elicit` app via the same dock path every other app uses. All the MCP plumbing lives in the supervisor + storage layer.

## Decisions unblocked

> **D-MCP: desk's MCP server is implemented as `McpAgent.serve("/mcp")` mounted on the desk-fabric Worker.** Per-session state lives in the McpAgent DO. Tool handlers that need user input (`elicit`, future approval flows) write a request into an AppRunner DO and poll that DO's storage; the M5's existing `/run` polling handles rendering and answer collection. No new transport, no new auth, no changes to the M5 runtime.

## What this does NOT prove

Open questions deferred to the production build, not this spike:

- **MCP client compatibility.** Some MCP clients may not honor long-running tool calls. Tested with our own `probe.ts` (which definitely does). Real-world: Claude Desktop, Cursor, pi — verify each.
- **Auth.** Spike runs without bearer auth. Production needs the same `Authorization: Bearer <DEVICE_TOKEN>` gate the rest of desk has.
- **The 4-tool minimum** (`elicit`, `notify`, `tally`, `observe`) hasn't been built. Just the patterns.

## Reproduce

```bash
cd ~/cloudflare/desk/experiments/exp-17-mcp-spike
bunx wrangler dev   # term 1, port 8917

cd ~/cloudflare/desk/experiments/exp-17-mcp-spike
bun src/probe.ts cross_do
bun src/probe.ts long_wait
bun src/probe.ts poll_for &
sleep 5
curl -X POST 'http://127.0.0.1:8917/set?key=ans&value=ship-it'
wait
```
