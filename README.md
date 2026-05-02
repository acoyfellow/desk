# desk

> Your wrist as an MCP surface. Your edge as the agent's I/O.

A personal, Cloudflare-hosted platform that lets any AI agent
— Claude Desktop, Cursor, opencode, your own scripts — use
your wrist for human-in-the-loop interaction.

You own the edge. The edge owns nothing about you.

```typescript
// Any MCP-capable agent:
const decision = await desk.ask({
  question: "ship to prod?",
  options: ["ship", "cancel"],
});
// → operator's wrist takes over screen, plays a chime, shows the question
// → operator presses A or B
// → decision === { choice: "ship" } returns to the agent
```

The agent never sees the wrist. The operator never sees a
sidebar. The wrist is the I/O channel.

## Status

**v0** — one operator, one device. MIT-licensed. Working
end-to-end. Multi-device, OAuth, public app distribution, and
the prompt→app loop are not yet shipped.

## Get started

Read the [docs](./docs/index.md). Specifically:

- **First time?** [Build your first desk](./docs/tutorials/01-build-your-first-desk.md) (60–90 min)
- **Already have a CF account?** [Deploy the fabric](./docs/how-to/deploy-the-fabric.md)
- **Curious about the architecture?** [Architecture explanation](./docs/explanation/architecture.md)

## Architecture, in one diagram

```
agent (any MCP client)         M5StickC Plus 1.1 / browser tab
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

## Repo layout

```
desk/
├── README.md                  ← this file
├── LICENSE                    ← MIT
├── SECURITY.md                ← what to report and how
├── CONTRIBUTING.md            ← rules of the road
├── docs/                      ← Diátaxis-organized docs
│   ├── index.md               ← start here
│   ├── tutorials/
│   ├── how-to/
│   ├── reference/
│   └── explanation/
├── .context/                  ← agent + maintainer context
│   ├── START-HERE.md
│   ├── NOW.md
│   ├── INVARIANTS.md
│   └── DECISIONS.md
├── experiments/               ← question-driven engineering history
│   ├── exp-13-…/              ← THE PRODUCTION FABRIC (yes, "experiment" is a misnomer; rename pending)
│   └── exp-NN-…/              ← graduated and parked questions
├── device/
│   ├── desk-rt.py             ← MicroPython runtime that ships on the M5
│   └── playground/            ← hardware demos and primitives
└── demos/
    └── agent-elicit.ts        ← drive desk.ask from a script
```

## License

MIT. See [LICENSE](./LICENSE).
