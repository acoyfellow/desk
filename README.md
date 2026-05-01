# desk

> Your wrist as an MCP surface. Your edge as the agent's I/O.

A personal, Cloudflare-hosted platform that lets any AI agent — pi,
opencode, Claude Desktop, Cursor — use your wrist for human-in-the-loop
interaction.

You own the edge. The edge owns nothing about you.

---

## What it is, today

A Cloudflare Worker the operator deploys to their own account that:

- **Hosts apps** as markdown files in a Cloudflare Artifacts repo. Apps
  run on Worker Loader isolates with state in DO Facets. `git push`
  installs.
- **Exposes an MCP server** at `/mcp`. Tools include `desk.ask` (ask
  the operator a question), `desk.inbox` (post a notification),
  `desk.observe` (ambient activity), and `desk.set_volume`. Any
  MCP-capable agent given the bearer token can call them.
- **Drives an M5StickC Plus 1.1** as a glanceable wrist surface. The
  M5 polls `/list` and `/run` over HTTPS and renders frames the
  fabric sends.

The killer demo:

```typescript
// In an agent (Claude / pi / opencode / whatever):
const decision = await desk.ask({
  question: "ship the fabric to prod?",
  options: ["ship", "cancel"],
});
// → operator's M5 takes over the screen, plays a chime, shows the question
// → operator presses A or B
// → decision === { choice: "ship" } returns to the agent
```

The agent never sees the M5. The operator never sees a sidebar. The
wrist is the I/O channel.

## Status

**v0 — one operator, one device.** Multi-device, OAuth, public
distribution, and the prompt→app loop are not yet shipped. The
public install path (deploy worker → mint tokens → flash M5 → push
first app) works for the maintainer but isn't documented end-to-end
yet — that's the next polish pass.

## Architecture, in one diagram

```
agent (any MCP client)         M5StickC Plus 1.1
      │                              │
      │ POST /mcp/tools/call         │ HTTPS poll /list + /run
      ▼                              ▼
┌─────────────────────────────────────────────────┐
│  desk fabric Worker                             │
│                                                  │
│  ┌──────────┐  ┌─────────────┐  ┌────────────┐  │
│  │ DeskMcp  │  │  AppRunner  │  │  Worker    │  │
│  │   DO     │←→│      DO     │  │  Loader    │  │
│  │          │  │  (singleton)│  │ (per-app)  │  │
│  └──────────┘  └─────────────┘  └────────────┘  │
│         ▲                              │         │
│         │                              ▼         │
│         │                  ┌─────────────────┐   │
│         │                  │  DO Facets      │   │
│         │                  │  (per-app SQL)  │   │
│         │                  └─────────────────┘   │
│         │                                        │
│         └─────── ArtifactsAppSource              │
│                  (isomorphic-git over Artifacts) │
└─────────────────────────────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │ desk/apps Artifacts repo │
            │  ├ counter/manifest.md   │
            │  ├ pet/manifest.md       │
            │  ├ tunes/manifest.md     │
            │  └ … (markdown + JS)     │
            └──────────────────────────┘
```

## Layout

```
desk/
├── README.md                                   ← this file
├── LICENSE                                     ← MIT
├── SECURITY.md                                 ← what to report and how
├── CONTRIBUTING.md                             ← rules of the road
├── .context/                                   ← agent + maintainer docs
│   ├── START-HERE.md                           ← read first
│   ├── NOW.md                                  ← current state
│   ├── INVARIANTS.md                           ← hard rules (e.g. single-account install)
│   ├── DECISIONS.md                            ← every D# decision + experiment link
│   └── runs/                                   ← dated session receipts
├── experiments/
│   ├── README.md                               ← experiment index
│   ├── exp-13-artifacts-app-source/            ← THE PRODUCTION FABRIC LIVES HERE TODAY
│   └── exp-NN-…/                               ← graduated and parked questions
├── device/
│   ├── desk-rt.py                              ← MicroPython runtime that ships on the M5
│   └── playground/                             ← hardware demos and primitives
└── demos/
    └── agent-elicit.ts                         ← drive desk.ask from a script
```

> "Experiment" is a misnomer for the production fabric — it's still in
> the `experiments/` tree because that's where the work graduated from
> and renaming it to `fabric/` is a public-release polish task. See
> `.context/NOW.md`.

## Where to start

**Reading the project:**

- `.context/START-HERE.md` for orientation
- `.context/NOW.md` for current state
- `experiments/README.md` for the experiment-driven design history

**Running it (for the maintainer; for new operators, this needs an
install doc which is in progress):**

- Deploy the fabric Worker to your Cloudflare account (`bunx wrangler
  deploy` from `experiments/exp-13-artifacts-app-source/`).
- Mint a `DESK_DEVICE_TOKEN`, save to `~/.config/desk/device-token`.
- Flash `device/desk-rt.py` to your M5 as `:main.py` plus
  `device/playground/lib/stick.py` as `:stick.py`.
- Run `DESK_MCP_URL=https://<your-fabric>.workers.dev/mcp
  DESK_DEVICE_TOKEN=… bun demos/agent-elicit.ts` to drive it from
  the laptop.

If you are an agent picking this up: same as above, plus read
`.context/INVARIANTS.md` so you don't violate I-1.

## License

MIT. See [LICENSE](./LICENSE).
