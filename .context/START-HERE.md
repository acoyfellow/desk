# desk — START HERE (for agents and contributors)

If you're an agent picking this project up, read this file first, then
`NOW.md`, `INVARIANTS.md`, `DECISIONS.md`. If you're a human contributor
who wants to *use* desk, the user docs at [`../docs/`](../docs/index.md)
split into tutorials, how-to guides, reference, and explanation — start
with the tutorial. Read this file when you want the engineering context.

## What desk is

A personal, secure, prompt-to-app environment on Cloudflare. Apps live as
markdown files in a Cloudflare Artifacts git repo. They run on Worker
Loader isolates with state in DO Facets. **The M5StickC Plus 1.1 is the
first client, not the product.**

In addition: desk's fabric Worker exposes an **MCP server** at `/mcp`. Any
MCP-capable agent (pi, opencode, Claude Desktop, Cursor) can call into
it to use the operator's device for human-in-the-loop interaction. **This
is the demo that makes desk distinctive.**

## What's currently shipped (production)

A Worker on the operator's personal Cloudflare account (URL configured
per install). See `NOW.md` for the precise current dock + MCP toolset.

- Dock apps at time of writing: counter, pet, tunes, inbox
- MCP tools live: `desk.echo`, `desk.ask`, `desk.inbox`, `desk.observe`, `desk.set_volume`
- M5StickC Plus 1.1 running vanilla MicroPython 1.22.2; speaks an HTTP
  poll loop to the deployed Worker, with Wi-Fi multi-network fallback
- Audio: `seq` op in firmware lets apps ship full chiptunes; volume
  knob (0=mute, 1=quiet, 2=loud) persists on device flash

See `NOW.md` for the precise current state.

## The hard rules

### Rule 1: No production code without a graduated experiment

Every architectural choice must be backed by a runnable experiment in
`experiments/exp-NN-question-shape/` with a measurable `RESULT.md`.
Exception: tiny patches (typos, render fixes, manifest tweaks) where the
existing graduated decision still holds.

### Rule 2: Read Cloudflare docs FIRST when touching CF primitives

```bash
curl -sS https://developers.cloudflare.com/llms.txt | grep -i <product>
curl -sS https://developers.cloudflare.com/<product>/llms.txt > /tmp/<product>.txt
curl -sS -H "Accept: text/markdown" https://developers.cloudflare.com/<page>/ > /tmp/<page>.md
```

Cache snapshots locally; don't commit them to the public repo (they're
upstream's content to publish, not ours).

### Rule 3: Single-account install (I-1)

desk runs on the operator's own Cloudflare account. Don't deploy to
someone else's account. Don't mix tokens across accounts. See
`INVARIANTS.md`.

## Project layout

```
desk/
├── README.md                 ← what desk is, top-level
├── LICENSE                   ← MIT
├── .context/
│   ├── START-HERE.md         ← this file
│   ├── NOW.md                ← current state, what shipped, what's next
│   ├── INVARIANTS.md         ← I-1 single-account and other hard rules
│   ├── DECISIONS.md          ← every architectural decision + experiment proof
│   └── runs/                 ← dated session receipts
├── experiments/
│   ├── README.md             ← index of experiments + their state
│   ├── exp-08-...            ← Worker Loader sandbox (graduated)
│   ├── exp-10-...            ← App manifest schema (graduated)
│   ├── exp-13-...            ← Artifacts AppSource (graduated; CONTAINS THE PRODUCTION FABRIC TODAY)
│   ├── exp-17-...            ← MCP cross-DO + elicit pattern (graduated)
│   ├── exp-19-...            ← Device firmware OTA (proposal)
│   └── (others)
├── device/
│   ├── desk-rt.py            ← MicroPython runtime that lives on the M5
│   └── playground/           ← hardware boilerplate, demos
└── demos/
    ├── README.md
    ├── agent-elicit.ts       ← drives desk.ask headless
    └── elicit-test.ts        ← smaller smoke test
```

The production fabric Worker lives at
`experiments/exp-13-artifacts-app-source/`. That's where `wrangler
deploy` runs from. "Experiment" is a misnomer now — it's production.
Renaming to `fabric/` is on the public-release polish to-do list.

## Working norms

- Agents have a shell — use it. Don't ask the operator to run commands
  the agent can run itself.
- No assumptions. Every architectural claim must be backed by a
  measurable experiment. "I think X is better" is not allowed.
- Vendor lock-in is suspect. The architecture intentionally minimizes
  Cloudflare-specific assumptions; where we use Cloudflare primitives,
  the contract (e.g. `AppSource`) is explicit so backends are
  swappable.

## Tokens / secrets

All operator secrets live under `~/.config/desk/` (mode 600), exported
via the shell rc as environment variables:

| Env var | What |
|---|---|
| `DESK_DEVICE_TOKEN` | bearer used by M5 + MCP clients to talk to the fabric Worker |
| `CLOUDFLARE_DEPLOY_TOKEN` | Workers:Edit + Workers AI:Edit for `wrangler deploy` |
| `CLOUDFLARE_ARTIFACTS_EDIT_TOKEN` | Artifacts:Edit (only needed when creating new repos) |
| `DESK_APPS_REPO_TOKEN` | `art_v1_*` scoped to the `desk/apps` Artifacts repo |
| `DESK_APPS_REPO_REMOTE` | computed URL for the Artifacts repo |

To `wrangler deploy`:

```bash
cd experiments/exp-13-artifacts-app-source
export CLOUDFLARE_API_TOKEN="$(cat ~/.config/desk/cf-deploy-token | tr -d '[:space:]')"
export CLOUDFLARE_ACCOUNT_ID="<your account id>"
bunx wrangler deploy
```

To push a new app:

```bash
cd "$(mktemp -d)"
TOKEN="$(cat ~/.config/desk/apps-repo-token | tr -d '[:space:]' | sed 's/?expires=.*//')"
git clone "https://x:${TOKEN}@<your-account-id>.artifacts.cloudflare.net/git/desk/apps.git" apps
cd apps
mkdir -p apps/<id> && cat > apps/<id>/manifest.md <<'MD'
... see exp-10 RESULT.md for the schema ...
MD
git add . && git commit -m "+ <id>" && git push
```

The M5 dock auto-refreshes every 10s and will surface the new app.

## What to do first as a fresh agent

1. Read `NOW.md` to know what's shipped right now and what's next.
2. Read `INVARIANTS.md` so you don't violate I-1.
3. Read `DECISIONS.md` to understand the architecture decisions and
   their proof.
4. Skim `experiments/README.md` to see which experiments graduated and
   why the others were parked.
5. Then ask the operator what to work on. Don't propose architectural
   changes until you've read the relevant graduated experiment for that
   area.
