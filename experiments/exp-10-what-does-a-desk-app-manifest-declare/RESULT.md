# exp-10 · RESULT

**Date:** 2026-04-27
**State:** 🟢 **Graduated** — v0 manifest schema frozen, two example apps built.

## Method

Pure design. Read the Dynamic Workers + DO Facets + Bindings + Egress docs first
(snapshot at `.context/cf-docs-snapshot/`), then designed the schema to map
1:1 onto what the runtime actually expects. No infrastructure needed.

## What the Cloudflare runtime constrains for us (free decisions)

The shape of a desk app is **already determined** by Worker Loader + DO Facets:

1. **The dynamic code is a `DurableObject` subclass** — facet-loadable. Mandatory.
2. **The class is loaded via `LOADER.get(id, callback)`** with a `WorkerCode` object
   `{ compatibilityDate, mainModule, modules, globalOutbound }`. Mandatory.
3. **State isolation is automatic** — the facet's SQLite is invisible to the
   supervisor. Free.
4. **Network isolation is automatic** — `globalOutbound: null` blocks all `fetch`
   and `connect`. Free.
5. **Permissions are capability-based** — if the supervisor doesn't pass a
   `WorkerEntrypoint` stub as a binding, the app literally has no reference to
   call. Permission == binding.

This means our manifest only needs to declare *the things the runtime cannot
infer*: identity, what bindings to grant, what entrypoints/handlers exist,
which UI surfaces it touches, and budget hints.

## The v0 manifest format

A desk app is a single **markdown file with YAML frontmatter** (artifact-spec
shape). The body of the markdown is the JavaScript module string; the
frontmatter is the manifest. One file, two layers, parseable everywhere.

```markdown
---
spec: desk.app.v0
id: counter
name: Counter
version: 0.1.0
author: the operator@coey.dev
description: |
  Press A to increment, B to reset. Persists across reboots.

# What surfaces the app touches. Each entry granted == one binding stub
# passed to the dynamic Worker. Missing entries == no stub == cannot call.
permissions:
  screen: write          # render frames to the device's LCD
  buttons: read          # receive btn:a / btn:b events
  buzzer: write          # buzz with controlled freq/duration
  led: write             # set LED on/off
  imu: read              # read accelerometer
  storage: facet         # use ctx.storage (own SQLite, isolated)
  net.fetch: []          # outbound fetch hosts allowed (empty = blocked)

# Resource budget. Fabric uses these to pick the right tier and to enforce
# limits on the running app via Worker Loader's custom limits API.
budget:
  cpu_ms_per_input: 50           # max CPU per input event
  ram_mb_steady: 8               # steady-state memory ceiling
  inputs_per_sec: 30             # rate-limit incoming inputs
  alarm_min_interval_ms: 1000    # fastest alarm() the app can request

# What handlers the dynamic class is expected to expose. The supervisor
# routes inputs into these handlers on the facet.
entrypoints:
  - init                 # called once on facet creation; returns first frame
  - onInput              # called for every device input event
  - onAlarm              # optional; called on DO alarms (background work)

# How the app surface should appear in the dock and lifecycle.
dock:
  icon: "+"              # 1-3 char glyph for the dock list
  background: false      # if true, runs onAlarm even when not foregrounded
  default_alarm_ms: null # null = no scheduled alarms (set by app code if needed)

# Optional. If the app needs custom RPC capabilities beyond standard
# device permissions, declare them here. Each one maps to a
# WorkerEntrypoint class the fabric must implement.
custom_bindings: []
---

import { DurableObject } from "cloudflare:workers";

export class App extends DurableObject {
  init() {
    return this.render(0);
  }

  onInput(input) {
    let count = this.ctx.storage.kv.get("count") ?? 0;
    if (input.kind === "btn" && input.phase === "down") {
      if (input.id === "a") count += 1;
      if (input.id === "b") count = 0;
      this.ctx.storage.kv.put("count", count);
    }
    return this.render(count);
  }

  render(count) {
    return {
      f: count,
      ops: [
        ["clr", "black"],
        ["bnr", "COUNTER", "orange"],
        ["txt", 4, 30, "value:", "gray"],
        ["txt", 30, 80, String(count), "white", true],
        ["txt", 4, 200, "A: +1", "gray"],
        ["txt", 4, 220, "B: reset", "gray"],
      ],
    };
  }
}
```

The body of the markdown above the closing `---` is the human/agent-readable
documentation; below the second `---` is the executable JS module that gets
fed into `LOADER.get()`'s `modules: { "app.js": <body> }`.

## Frozen field reference

### Required

| Field | Type | Description |
|---|---|---|
| `spec` | const `desk.app.v0` | Schema version. Bump on incompatible changes only. |
| `id` | string, `^[a-z][a-z0-9-]{1,30}$` | Unique within a desk. Stable across versions. |
| `name` | string | Human-facing display name. |
| `version` | semver string | Bumps when handlers/permissions/render change. |

### Strongly recommended

| Field | Type | Description |
|---|---|---|
| `author` | string | Email or handle. Identity for audit/log. |
| `description` | string | One paragraph. Shown in dock detail view. |

### Permissions (the security contract)

`permissions` is a map of permission name → mode. **Absence of a key means
the app does not have that capability.** The supervisor uses this to decide
which `WorkerEntrypoint` stubs to pass as bindings into `LOADER.get()`'s
returned config.

| Key | Modes | What it grants |
|---|---|---|
| `screen` | `write` | `env.SCREEN.frame(ops)` — push a render frame |
| `buttons` | `read` | `onInput` receives `btn:*` events |
| `buzzer` | `write` | `env.BUZZER.tone(freq, ms)` |
| `led` | `write` | `env.LED.set(on)` |
| `imu` | `read` | `onInput` receives `tilt`/`shake` events; `env.IMU.read()` |
| `storage` | `facet` | `this.ctx.storage` — own isolated SQLite |
| `net.fetch` | `[]` or `[host, ...]` | Outbound HTTP. `[]` = no, `["api.example.com"]` = whitelist. Translated to `globalOutbound` interceptor. |
| `mcp.<server>` | `read`/`write` | Future: MCP server access through fabric proxy |

Unknown keys are **rejected at install time** by the fabric (defense in depth
against typos becoming silent privilege escalation).

### Budget (resource hints)

Hints, not hard contracts. The fabric uses them to:
- Pick a Worker Loader tier (more on this once the runtime experiment confirms).
- Set custom limits via `LOADER.get()`'s limits API.
- Reject installs that request more than the device/account allows.

### Entrypoints

Names of methods the facet's `App` class must export. v0 baseline:
- `init()` → returns first frame, runs once on facet creation
- `onInput(input)` → returns next frame
- `onAlarm()` → optional, returns frames to broadcast to listeners

### Dock metadata

How the app appears in the M5 dock UI. `icon` is one to three printable
ASCII chars (we have one font; emoji aren't a thing yet). `background: true`
means the app's `onAlarm` keeps firing even when not foregrounded — for
PR Pager, DO Pet, etc.

### Custom bindings

For apps that need capabilities beyond the standard device set (e.g. a
LEE-chat app needs `env.AGENT_WS` to talk to cloudflare-agent). Each entry
names a `WorkerEntrypoint` the fabric must implement and pass.

## What's deliberately NOT in v0

- **Multi-file apps.** The body of the markdown is the entire `mainModule`.
  Apps that need imports must inline them. Future: `modules:` map in
  frontmatter referencing other files in the same Artifacts repo.
- **Signing / provenance.** v0 trusts whoever pushes the manifest into the
  fabric's app store. Future: `signature:` field, validated against a
  per-user pubkey stored on first-pair.
- **i18n.** All strings are en-US. Future: `name_i18n: { es: "Contador" }`.
- **App-to-app messaging.** Apps cannot call other apps. Future: explicit
  `imports:` declaring which other apps' RPC interfaces to receive stubs for.
- **A real schema file.** This RESULT.md is the spec. A `manifest.v0.zod.ts`
  ships in exp-08 once we're using the schema in code.

## Two example apps shipped

Concrete validation: the schema is real if two genuinely different apps
fit it cleanly without contortions.

- **`apps/counter.md`** — minimal, the running example above. Tests:
  buttons + screen + storage. No background, no network.
- **`apps/pet.md`** — the DO-Pet idea. Tests: alarms, background mode,
  storage longevity. No buttons triggered by user; updates on its own.

## Decision unblocked

> **App format (D7):** desk apps are markdown files with YAML frontmatter,
> body is JS (`DurableObject` subclass exporting `App` with `init` /
> `onInput` / `onAlarm`). Permissions are *which `WorkerEntrypoint` stubs
> the supervisor binds*; missing permission = no stub passed = no
> reference to call. The Worker Loader runtime enforces network and
> state isolation by construction.
>
> The naive `new Function` host runtime from exp-04 is fully retired.
> exp-08 will validate this manifest against the real Worker Loader.

## What this unblocks for exp-08

1. The example apps are the test inputs.
2. The permission map tells exp-08 exactly which custom-binding stubs
   to plumb (or not) and which attacks should pass/fail.
3. The budget fields tell exp-08 what `LOADER.get()` limits to set.

## Reproduce

Read this RESULT.md and `apps/counter.md`, `apps/pet.md`. There is no
`run.sh` because there's nothing runtime to verify here — exp-08 does
the runtime verification using these files as input.
