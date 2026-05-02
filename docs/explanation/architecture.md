# Architecture

This page explains *why* desk is shaped the way it is. For
*how* to use it, see the [how-to guides](../how-to/). For
*what exactly* a thing does, see the [reference](../reference/).

## The one-line summary

desk is **a fabric Worker that loads apps from a git repo, runs
them in isolates, renders them as frames, and exposes them to
both wrist hardware and AI agents.**

## The forcing function

The constraint that shaped every decision: **the operator can
hold an M5 in their hand and build apps from the device, on
the fly.**

This forces:

- App install must be cheap (so you can iterate fast)
- App execution must be sandboxed (so a bad app doesn't brick the wrist)
- The wire format must be small (so a 162KB MicroPython device can render it)
- The whole thing must run on infrastructure the operator owns
  (so it's actually personal, not a service)

Everything else falls out from there.

## The big picture

```
┌─────────────────────────────────────────────────────────────────┐
│ Operator's Cloudflare account                                    │
│                                                                   │
│  ┌─────────────────────────────┐   ┌──────────────────────────┐  │
│  │ desk-fabric (Worker)        │   │ desk/apps Artifacts repo │  │
│  │                              │   │                           │  │
│  │  ┌────────┐ ┌────────────┐  │ ◀─┤ apps/counter/manifest.md │  │
│  │  │DeskMcp │ │AppRunner   │  │   │ apps/pet/manifest.md     │  │
│  │  │  DO    │ │  DO        │  │   │ apps/tunes/manifest.md   │  │
│  │  └────────┘ └─┬──────────┘  │   │                           │  │
│  │               ▼              │   │ git push installs.        │  │
│  │     ┌──────────────────┐    │   │ git revert rolls back.    │  │
│  │     │ Worker Loader    │    │   │ git log is the audit.     │  │
│  │     │ (per-app isolate)│    │   └──────────────────────────┘  │
│  │     └─────┬────────────┘    │                                   │
│  │           ▼                  │                                   │
│  │     ┌──────────────────┐    │                                   │
│  │     │ DO Facets        │    │                                   │
│  │     │ (per-app SQLite) │    │                                   │
│  │     └──────────────────┘    │                                   │
│  └─────────────────────────────┘                                   │
└──────────────┬──────────────────────────────────────┬──────────────┘
               │ HTTPS                                 │ HTTPS (MCP)
               ▼                                       ▼
       ┌──────────────────┐                    ┌──────────────────┐
       │ wrist clients    │                    │ MCP-capable      │
       │  - M5StickC      │                    │ agents           │
       │  - browser       │                    │  - Claude        │
       │  - (future:      │                    │  - Cursor        │
       │     pi, watch,   │                    │  - opencode      │
       │     etc.)        │                    │  - your script   │
       └──────────────────┘                    └──────────────────┘
```

## The four moving parts

### 1. The fabric Worker

A single Cloudflare Worker. It:

- Serves the wrist clients (`/list`, `/run`, `/viewer`)
- Hosts the MCP server (`/mcp`)
- Owns the singleton `AppRunner` Durable Object that orchestrates app execution
- Owns the `DeskMcp` Durable Object that holds MCP session state
- Loads app source from the Artifacts repo via `ArtifactsAppSource`

Source: `experiments/exp-13-artifacts-app-source/src/index.ts`.

### 2. Apps as files

Apps are Markdown files (YAML frontmatter manifest + JS body)
in a Cloudflare Artifacts git repo. The fabric uses
`isomorphic-git` to clone the repo into Worker memory.

This decision is graduated as **D9: AppSource via Artifacts**.
See [exp-13 RESULT](../../experiments/exp-13-artifacts-app-source/RESULT.md).

The trade-off: standard `git push` is the install protocol.
There's no bespoke install system because git already is one.
`git revert` is rollback. `git log` is the audit trail.

### 3. Worker Loader for app execution

The fabric doesn't run app code directly. Each app is loaded
into its own Worker Loader isolate via
`env.LOADER.get(appId, callback)`. The callback returns a
sandbox spec that includes:

- `globalOutbound: null` — apps can't make network calls
- `env` — only the capability bindings the manifest declared
- `limits.cpuMs` — from the manifest's `budget.cpu_ms_per_input`

Per-app state lives in **DO Facets** — one SQLite database
per app, isolated from the others.

This decision is graduated as **D8: Worker Loader runtime**.
See [exp-08 RESULT](../../experiments/exp-08-can-worker-loader-host-our-apps-safely/RESULT.md).

### 4. The frame protocol

Apps don't manipulate displays directly. They return *frames*:
JSON objects with an array of drawing ops. The runtime walks
the ops and dispatches to whatever surface is rendering.

This indirection is what lets the same app run on:

- The M5StickC's 135×240 ST7789 LCD (135K transistors of MicroPython)
- A 14KB browser viewer page
- (Future) any other surface that implements the op vocabulary

This decision is graduated as **D11: protocol portability**.
See [exp-05b RESULT](../../experiments/exp-05b-can-browser-render-desk-frames/RESULT.md).

## Why MCP

MCP (Model Context Protocol) is the AI-agent integration
standard from Anthropic. Any agent that speaks MCP can call
desk's tools without bespoke integration code.

The fabric mounts an MCP server at `/mcp` using
`McpAgent.serve()` from the `agents/mcp` package. Tool
handlers that need user input (`desk.ask`) write a request
into the `AppRunner` DO and poll for the answer; the wrist's
existing `/run` polling handles the rendering and answer
collection.

**No new transport, no new auth, no wrist-side changes.** The
MCP server is just another route on the fabric Worker. This
decision is graduated as **D10: MCP via McpAgent.serve**. See
[exp-17 RESULT](../../experiments/exp-17-mcp-spike/RESULT.md).

## Why frames are returned, not pushed

A natural-feeling API would be:

```js
// imaginary, NOT what desk does
this.env.SCREEN.clear("black");
this.env.SCREEN.banner("COUNTER", "orange");
this.env.SCREEN.text(4, 80, "7", "white", { big: true });
```

desk doesn't work that way. Apps **return** a frame:

```js
return {
  f: count,
  ops: [
    ["clr", "black"],
    ["bnr", "COUNTER", "orange"],
    ["txt", 4, 80, "7", "white", true],
  ],
};
```

Why:

1. **Atomic frames.** A returned frame is one HTTP response.
   The runtime can transmit, render, and acknowledge it as a
   unit. With imperative pushes, partial failures (some ops
   landed, some didn't) are real.
2. **Cacheable.** A frame is just JSON. The runtime can hash
   it, dedupe identical frames, replay the last one without
   re-running the app.
3. **Multi-surface natural.** A returned frame is a portable
   object. The same frame can be rendered to M5, browser, or
   any future surface. Imperative pushes would need
   per-surface adapters in the app code.
4. **Sandbox-friendly.** Apps in Worker Loader isolates have
   no network egress (`globalOutbound: null`). They literally
   can't push anywhere — they can only return values to the
   host.

The capability bindings (`SCREEN`, `BUTTONS`, `BUZZER`, `LED`)
exist as `WorkerEntrypoint` stubs in the runtime, but at v0
they're documentation: apps don't call them. This may change
if a future experiment finds a use that justifies it.

## Why a singleton AppRunner

There's exactly one `AppRunner` Durable Object instance
(`idFromName("singleton")`). It owns:

- The pending-elicit queue
- The notification queue
- The active observation
- The volume target

Because it's a singleton, all wrist clients (M5 + every
browser tab) see the same state. Press A in the browser, and
the M5's next dock-refresh sees the result.

This is also why **multi-device is currently unsupported.**
The singleton means one wrist per fabric. Per-device routing
needs device IDs in the DO key, which is on the roadmap but
not shipped.

## Why HTTP polling, not WebSockets

The original D1 decision picked WebSockets via DO Hibernation
API. exp-13 shipped HTTPS polling instead because:

- Polling is the simplest correct implementation on
  MicroPython
- The M5's poll interval is 10s — battery-friendly
- Hibernation costs are not a concern at one-operator scale
- WebSockets become valuable when input latency matters; the
  current ~250ms p50 is fine

WS may come back as exp-NN-followup once a real workload
demands it.

## Where state lives

| What | Where | Survives... |
|---|---|---|
| App source code | Artifacts repo (git) | forever; `git log` is the audit |
| App per-app state | DO Facet SQLite | DO hibernation, fabric redeploys |
| Pending elicits / notifications | AppRunner DO storage | DO hibernation |
| MCP session state | DeskMcp DO | DO hibernation |
| Volume setting | M5 flash file `:desk_volume` + AppRunner DO `_volume_target` | both: device reboot + worker redeploy |
| Operator credentials | `~/.config/desk/<name>` files on operator's machine | nothing else; never leaves |

## What this isn't trying to be

- **Not a SaaS.** Each operator runs their own fabric on
  their own CF account. There is no central desk service.
- **Not a marketplace.** Apps live in the operator's private
  Artifacts repo. There's no discovery, no rating, no install
  flow for "third-party" apps.
- **Not an enterprise tool.** Single bearer, no audit log,
  no per-agent scoping. Designed for one person.
- **Not multi-tenant.** Singleton AppRunner. One wrist per
  fabric.
- **Not AGI.** desk is plumbing. The agents driving it are
  the smart part, and they live elsewhere.

## See also

- [The decisions log (`.context/DECISIONS.md`)](../../.context/DECISIONS.md)
  — every architectural choice with the experiment that proved it
- [Hard invariants (`.context/INVARIANTS.md`)](../../.context/INVARIANTS.md)
  — non-negotiables
- [Frame protocol reference](../reference/frame-protocol.md)
- [Manifest schema reference](../reference/manifest-schema.md)
