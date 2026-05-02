# 2026-04-27 — MCP toolset complete; agent-loop demo end-to-end

## What shipped

**Three production MCP tools,** all bearer-auth gated, all callable from any
MCP-capable agent given `$DESK_DEVICE_TOKEN`:

- `desk.elicit(question, options[], timeout_seconds)` — device takeover, blocks for user choice
- `desk.notify(text, level)` — non-blocking notification queue
- `desk.tally(label, delta)` — named counter with persistent history
- `desk.echo(text)` — sanity check

**Two new system apps** in the Artifacts dock (renderers in supervisor, not
Worker Loader):

- `notify` — inbox of agent notifications, A=mark all read, B=back
- `tally` — read-only view of counters bumped by agents

**Bug fix:** the elicit app crashed when receiving a button input with no
pending elicit. Fixed by rendering the placeholder frame instead of
`#renderElicit(null!)`. Verified live; status_dot stays green.

**Wired into agent harnesses:**

- `~/.pi/agent/mcp.json` — `desk` server with `auth: bearer`,
  `bearerTokenEnv: DESK_DEVICE_TOKEN`, `directTools: ["elicit", "echo"]`
- `~/.config/opencode/opencode.jsonc` — `desk` server with bearer header,
  `${DESK_DEVICE_TOKEN}` interpolation

## Verified end-to-end

Two headless demos that drove the live deployed MCP server:

1. `bun demos/agent-elicit.ts elicit` — single elicit call.
   M5 chirped, took over, the operator pressed A, agent received `"yes please"`.
2. `bun demos/agent-loop.ts` — full deploy simulation:
   notify("starting deploy") → tally("build-step") x3 → elicit("ship?") → 
   user pressed A → tally("deploys")++ → notify("✓ shipped").
   Real round-trip, real device, real edge.

## Decisions added

(D10 already in DECISIONS.md from yesterday.) No new D-numbers; just
fleshing out the toolset under D10.

## Architecture additions

- `AppRunner` DO grew four new methods: `pushNotification`, `getNotifications`,
  `markAllRead`, `bumpTally`, `getTallies`.
- `AppRunner.fetch` got two new special paths: `appId === "notify"` and
  `appId === "tally"`. Both are read-mostly; agents write via MCP.
- `wrapToWidth` text-wrapping helper extracted to module scope; used by
  elicit + answered + notify + future renderers. Solves the recurring
  text-overflow issue when agent strings exceed 8 chars (big font) or 16
  chars (small font).

## Demos in repo

`demos/agent-elicit.ts`, `demos/agent-loop.ts`, `demos/elicit-test.ts`,
`demos/README.md` — moved from `/tmp/` and committed. Future agents can
re-run them after exporting `$DESK_DEVICE_TOKEN`.

## Open

- `desk.observe` (read M5 state) not yet built. Closes the v1 toolset.
- Pi restart needed for `~/.pi/agent/mcp.json` desk-entry to load. Opencode
  reads its config on session start (no restart needed for new sessions).
- Public test against Claude Desktop / Cursor / Hermes not done. They
  *should* work — both speak the same Streamable HTTP — but no smoke test yet.

## Next session entrypoints

If picking up cold:
1. Read `.context/START-HERE.md`
2. Read `.context/NOW.md`
3. Read this file
4. Try `bun demos/agent-loop.ts` — it should still work; the deployment
   doesn't time out.
