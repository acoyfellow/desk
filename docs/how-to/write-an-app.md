# How to write an app

This solves the problem of building your own desk app and
installing it via `git push`.

## Prerequisites

- The fabric Worker deployed (see
  [deploy-the-fabric.md](deploy-the-fabric.md))
- An M5 or browser viewer connected
- Your `DESK_APPS_REPO_TOKEN` and `DESK_APPS_REPO_REMOTE` set

## 1. Clone the apps repo

```bash
mkdir -p /tmp/desk-apps && cd /tmp/desk-apps

TOKEN="$(cat ~/.config/desk/apps-repo-token | tr -d '[:space:]' | sed 's/?expires=.*//')"
git clone "https://x:${TOKEN}@${CLOUDFLARE_PERSONAL_ACCOUNT_ID}.artifacts.cloudflare.net/git/desk/apps.git" .
```

If the clone is empty (you haven't pushed any apps yet), that's
fine — initialize:

```bash
git init -b main
git remote add origin "https://x:${TOKEN}@${CLOUDFLARE_PERSONAL_ACCOUNT_ID}.artifacts.cloudflare.net/git/desk/apps.git"
```

## 2. Create your app

Pick a unique app id. Lowercase ASCII, dashes ok. Don't use
the reserved ids: `inbox`, `elicit`, `notify`, `diag`.

For this example, we'll build a tiny dice-roller app.

```bash
mkdir -p apps/dice
cat > apps/dice/manifest.md <<'MD'
---
spec: desk.app.v0
id: dice
name: Dice
version: 0.1.0
author: you@example.com
description: |
  Roll a die. Short A = roll. Long A = change die size (d6 → d20 → d100 → d6).

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
    return this.render(this.last() ?? null);
  }

  onInput(input) {
    if (input.kind !== "btn" || input.id !== "a") {
      return this.render(this.last() ?? null);
    }
    if (input.phase === "long") {
      const cur = this.ctx.storage.kv.get("size_idx") ?? 0;
      const next = (cur + 1) % SIZES.length;
      this.ctx.storage.kv.put("size_idx", next);
      return this.render(null, /*just-changed*/ true);
    }
    // short A: roll
    const size = SIZES[this.ctx.storage.kv.get("size_idx") ?? 0];
    const result = 1 + Math.floor(Math.random() * size);
    this.ctx.storage.kv.put("last", result);
    return this.render(result);
  }

  last() { return this.ctx.storage.kv.get("last"); }

  render(result, justChanged) {
    const size = SIZES[this.ctx.storage.kv.get("size_idx") ?? 0];
    const ops = [
      ["clr", "black"],
      ["bnr", "DICE", "magenta"],
      ["txt", 4, 30, "d" + size, "cyan", true],
    ];
    if (result != null) {
      // big result number, centered-ish
      const s = String(result);
      ops.push(["txt", 4, 90, "rolled:", "gray"]);
      ops.push(["txt", 30, 130, s, "white", true]);
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
MD
```

The body is plain ES module JavaScript. Things to know:

- The `App` class **must** extend `DurableObject` from `cloudflare:workers`.
- `init()` is called when the user opens the app.
- `onInput(input)` is called on every button event the runtime forwards.
- `this.ctx.storage.kv` is your facet's per-app key/value store.
- Return a `{ f, ops }` frame. See
  [frame protocol reference](../reference/frame-protocol.md).

## 3. Push it

```bash
git add apps/dice/manifest.md
git -c user.email="you@example.com" -c user.name="you" \
    commit -m "+ dice"
git push origin HEAD:main
```

## 4. Verify on the device

The M5 polls `/list` every 10s. Within 10 seconds, the dock
chirps and `dice` appears in the list. Open it: short A rolls,
hold A cycles size.

In the browser viewer the same happens within 2 seconds (faster
poll cadence).

## Updating

Bump the `version` field, edit the body, push:

```bash
# In apps/dice/manifest.md, change version: 0.1.0 → 0.1.1
git add apps/dice/manifest.md
git -c user.email="you@example.com" -c user.name="you" \
    commit -m "dice: tweak roll feedback"
git push
```

The fabric loader caches by `${id}:${version}:${contentHash}`,
so any change to the file forces a fresh load even at the same
semver. Bumping `version` is good hygiene but not required.

## Rolling back

```bash
git revert <bad-commit-sha>
git push
```

`git log` is your audit trail. `git revert` is your rollback.

## What apps **can** and **can't** do

**Can:**

- Render frames using the full op vocabulary
- Persist state per-app via `this.ctx.storage.kv`
- Make sound (`buz`, `seq`) if `permissions.buzzer: write` declared
- Control the LED if `permissions.led: write` declared (M5 only)

**Can't (v0):**

- Make outbound network calls (Worker Loader runs apps with `globalOutbound: null`)
- Read other apps' state
- Schedule alarms — `setAlarm` throws inside DO Facets (F-10)
- Receive input from B button — B is runtime-owned, always means "back to dock"
- Run longer than `budget.cpu_ms_per_input` per call

## Common patterns

### Persistent state across reboots

```js
const count = this.ctx.storage.kv.get("count") ?? 0;
this.ctx.storage.kv.put("count", count + 1);
```

State survives device reboots, fabric redeploys, and DO
hibernation. It does NOT survive `wrangler delete` of the fabric
Worker itself.

### Optional long-press behavior

```js
if (input.id === "a") {
  if (input.phase === "long") {
    /* hold-A action */
  } else {
    /* short-A action */
  }
}
```

Apps that don't care about long-press can just check
`if (input.phase === "down")` and let `"long"` quietly no-op.

### Big text for headlines

Pass the optional 6th arg of `["txt", x, y, text, color, big]`
as `true`:

```js
["txt", 4, 80, "42", "white", true]   // 16px wide × 32px tall per glyph
```

### Playing audio

```js
["buz", 2400, 80]                          // single beep
["seq", [[523, 200], [659, 200], [784, 400]], 10]   // C-E-G arpeggio
```

See the `tunes` app for a full chiptune driver.

## Examples to copy

The repo ships reference apps you can read:

- `experiments/exp-13-artifacts-app-source/spike-apps/counter.md`
  — minimum viable
- (Pet, tunes manifests live in your Artifacts repo after first
  install — `git clone` it to read them)

## See also

- [Manifest schema reference](../reference/manifest-schema.md) — every field
- [Frame protocol reference](../reference/frame-protocol.md) — every op
- [How to connect an agent](connect-an-agent.md) — let agents drive your device
