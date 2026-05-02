# Build your first desk

This tutorial takes you from "nothing" to "an MCP-capable agent
asks me a question on my wrist and I press a button to answer."

By the end you'll have:

- A fabric Worker running on your Cloudflare account
- An M5StickC Plus 1.1 (or just a browser tab) showing your dock
- An app you wrote yourself, installed via `git push`
- An agent connected via MCP that can drive your wrist

Estimated time: **60–90 minutes**, of which about half is
waiting for one-time setup (Cloudflare account, M5 firmware
flash).

> **Hardware optional:** if you don't have an M5StickC, you can
> still complete this tutorial using the browser viewer
> (`/viewer`). Skip step 4 and use the browser instead.

---

## What you'll need

- A Cloudflare account (free tier is fine for this tutorial; in
  production Worker Loader is paid)
- A laptop with [Bun](https://bun.sh) installed
- *(Optional)* An M5StickC Plus 1.1 + USB-C cable
- About 90 minutes

---

## Step 1: Get the code

```bash
git clone https://github.com/acoyfellow/desk.git
cd desk
bun install --cwd experiments/exp-13-artifacts-app-source
```

We'll use this directory throughout.

---

## Step 2: Mint your tokens

Follow [the deploy-the-fabric guide](../how-to/deploy-the-fabric.md)
through step 4 (token files in place, env vars exported).

When you're done, this should work:

```bash
echo "Account: $CLOUDFLARE_PERSONAL_ACCOUNT_ID"
echo "Device token: $(cat ~/.config/desk/device-token | head -c 8)..."
echo "Repo token: $(cat ~/.config/desk/apps-repo-token | head -c 8)..."
```

Pause here if any of those are missing — the rest of the
tutorial assumes they're set.

---

## Step 3: Deploy the fabric

```bash
cd experiments/exp-13-artifacts-app-source

# Set Worker secrets
export CLOUDFLARE_API_TOKEN="$(cat ~/.config/desk/cf-deploy-token | tr -d '[:space:]')"
export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_PERSONAL_ACCOUNT_ID"
echo -n "$DESK_DEVICE_TOKEN" | bunx wrangler secret put DESK_DEVICE_TOKEN
echo -n "$DESK_APPS_REPO_REMOTE" | bunx wrangler secret put DESK_APPS_REPO_REMOTE
echo -n "$DESK_APPS_REPO_TOKEN" | bunx wrangler secret put DESK_APPS_REPO_TOKEN

# Deploy
bunx wrangler deploy
```

Wrangler prints your fabric URL on success. It looks like:

```
https://desk-fabric-exp13.<your-subdomain>.workers.dev
```

Save it:

```bash
export DESK_MCP_URL="https://<your-fabric>.workers.dev/mcp"
echo "export DESK_MCP_URL=\"$DESK_MCP_URL\"" >> ~/.zshrc
```

Verify it's live:

```bash
curl https://<your-fabric>.workers.dev/healthz
# → ok
```

✅ The fabric is now deployed.

---

## Step 4 (option A): Browser viewer

If you don't have an M5 yet, use the browser:

```bash
open "https://<your-fabric>.workers.dev/viewer#url=https://<your-fabric>.workers.dev&token=$DESK_DEVICE_TOKEN"
```

You should see an orange `DESK` banner with `inbox` listed in
the dock. That's your wrist surface in browser form.

Keep this tab open. Skip to step 5.

## Step 4 (option B): Flash the M5

Follow [the flash-the-m5 guide](../how-to/flash-the-m5.md) all
the way through. When you're done:

- The M5 boots
- Connects to WiFi
- Shows an orange `DESK` banner with `inbox` in the dock

Keep the M5 nearby. Continue to step 5.

---

## Step 5: Write your first app

We'll add a tiny dice-roller app.

```bash
cd $(mktemp -d)
TOKEN="$(cat ~/.config/desk/apps-repo-token | tr -d '[:space:]' | sed 's/?expires=.*//')"
git clone "https://x:${TOKEN}@${CLOUDFLARE_PERSONAL_ACCOUNT_ID}.artifacts.cloudflare.net/git/desk/apps.git" .
mkdir -p apps/dice
```

Save the following as `apps/dice/manifest.md`:

```markdown
---
spec: desk.app.v0
id: dice
name: Dice
version: 0.1.0
author: you@example.com
description: Roll a die. A = roll. Hold A = change die size.

permissions:
  screen: write
  buttons: read
  buzzer: write
  storage: facet

budget:
  cpu_ms_per_input: 20

entrypoints:
  - init
  - onInput

dock:
  icon: "d"
---

import { DurableObject } from "cloudflare:workers";

const SIZES = [6, 20, 100];

export class App extends DurableObject {
  init() {
    return this.render(this.ctx.storage.kv.get("last") ?? null);
  }

  onInput(input) {
    if (input.kind !== "btn" || input.id !== "a") {
      return this.render(this.ctx.storage.kv.get("last") ?? null);
    }
    if (input.phase === "long") {
      const cur = this.ctx.storage.kv.get("size_idx") ?? 0;
      this.ctx.storage.kv.put("size_idx", (cur + 1) % SIZES.length);
      return this.render(null, true);
    }
    const size = SIZES[this.ctx.storage.kv.get("size_idx") ?? 0];
    const result = 1 + Math.floor(Math.random() * size);
    this.ctx.storage.kv.put("last", result);
    return this.render(result);
  }

  render(result, justChanged) {
    const size = SIZES[this.ctx.storage.kv.get("size_idx") ?? 0];
    const ops = [
      ["clr", "black"],
      ["bnr", "DICE", "magenta"],
      ["txt", 4, 30, "d" + size, "cyan", true],
    ];
    if (result != null) {
      ops.push(["txt", 4, 90, "rolled:", "gray"]);
      ops.push(["txt", 30, 130, String(result), "white", true]);
      ops.push(["buz", 2400, 60]);
    } else if (justChanged) {
      ops.push(["txt", 4, 110, "size changed", "yellow"]);
    } else {
      ops.push(["txt", 4, 110, "press A", "gray"]);
    }
    ops.push(["txt", 4, 200, "A: roll", "gray"]);
    ops.push(["txt", 4, 218, "hold A: size", "gray"]);
    return { f: Date.now(), ops };
  }
}
```

Push it:

```bash
git add apps/dice/manifest.md
git -c user.email="you@example.com" -c user.name="you" \
    commit -m "+ dice"
git push origin HEAD:main
```

---

## Step 6: Watch it appear on the dock

The M5 dock auto-refreshes every 10s. Within 10 seconds you'll
hear a chirp and see `dice` in the list. (Browser viewer:
within 2s.)

Cycle to it (B button) and open it (A). Press A again to roll
the die. Hold A to cycle size (d6 → d20 → d100). Press B to
go back to the dock.

🎲 You wrote and shipped a desk app.

---

## Step 7: Drive it from an agent

The fabric also exposes an MCP server that lets agents drive
your wrist. Quick test:

```bash
DESK_MCP_URL=https://<your-fabric>.workers.dev/mcp \
DESK_DEVICE_TOKEN=$(cat ~/.config/desk/device-token | tr -d '[:space:]') \
bun demos/agent-elicit.ts
```

Your wrist should:

1. Chirp
2. Display the question "should I keep going?"
3. Wait for you to press A or hold-A

Press A. The script prints `{"choice": "yes please", ...}` and
exits.

🤖 An agent just drove your wrist.

To wire desk into a real agent (Claude Desktop, Cursor,
opencode), follow [the connect-an-agent guide](../how-to/connect-an-agent.md).

---

## What you've built

```
┌──────────────────────┐     ┌─────────────────────┐
│ Your laptop          │     │ Cloudflare account  │
│ - bun + wrangler     │     │ - desk fabric       │
│ - apps repo (git)    │ ──▶ │ - Artifacts repo    │
│ - tokens at ~/.config│     │ - Worker Loader     │
└──────────────────────┘     └─────────┬───────────┘
                                       │
              ┌────────────────────────┼────────────────┐
              ▼                        ▼                ▼
       ┌──────────────┐        ┌──────────────┐  ┌──────────┐
       │ M5 / browser │        │ MCP-capable  │  │ git push │
       │ (the wrist)  │        │ agents       │  │ apps     │
       └──────────────┘        └──────────────┘  └──────────┘
```

A wrist surface, an app distribution channel, an agent-control
plane — all running on infrastructure you own.

---

## Next steps

- **Read the [architecture explanation](../explanation/architecture.md)**
  to understand *why* it's shaped this way.
- **Build a real app** — see [How to write an app](../how-to/write-an-app.md)
  for patterns.
- **Wire desk into your agent** — see
  [How to connect an agent](../how-to/connect-an-agent.md).
- **Browse the [reference docs](../reference/)** when you need exact field names.

---

## What's not in v0

So you don't get surprised:

- **OAuth.** The bearer is shared. Don't share it.
- **Multiple devices.** Singleton AppRunner = one wrist per
  fabric.
- **Background apps.** `setAlarm` doesn't work inside DO Facets
  yet (F-10).
- **Pairing flow.** Every M5 is hand-flashed with a `secrets.py`.
- **Public app store.** Apps live in your private Artifacts
  repo.

These are documented in `.context/NOW.md` and tracked as
findings in `.context/DECISIONS.md`. Some are scoped for future
experiments (exp-12, exp-19); others wait until they matter.
