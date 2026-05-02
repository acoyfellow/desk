# Manifest schema

A desk app is a single Markdown file: YAML frontmatter declaring
what the app needs, plus a JS body that exports the app class.

## File shape

```markdown
---
spec: desk.app.v0
id: counter
name: Counter
version: 0.2.0
author: you@example.com
description: |
  Multiline description.

permissions:
  screen: write
  buttons: read
  storage: facet

budget:
  cpu_ms_per_input: 20

entrypoints:
  - init
  - onInput

dock:
  icon: "+"
---

import { DurableObject } from "cloudflare:workers";

export class App extends DurableObject {
  init() { /* ... */ }
  onInput(input) { /* ... */ }
}
```

Apps live at `apps/<id>/manifest.md` in the operator's
`desk/apps` Artifacts repo. `git push` installs.

## Frontmatter fields

### `spec` *(required)*

`desk.app.v0` — current schema version. The fabric rejects
manifests with a different value.

### `id` *(required)*

Unique app id. Used as the URL key in `/run?app=<id>` and as
the directory name in the Artifacts repo. Lowercase ASCII,
digits, dashes; no spaces.

Reserved ids: `inbox`, `elicit`, `notify`, `diag`. Don't use these.

### `name` *(required)*

Human-readable name. Free-form string.

### `version` *(required)*

Semver string. The fabric loads the manifest matching the
requested version (defaults to `latest`). Cache key includes
the source content hash, so any change forces a fresh load
even at the same semver — but bumping versions is good
hygiene.

### `author` *(required)*

Free-form string. By convention, an email address.

### `description` *(optional)*

Free-form. Multiline allowed via YAML block scalars (`|`).

### `permissions` *(required)*

What hardware/storage your app declares it needs. The fabric
runtime mounts only the capability bindings you declare; an
app that doesn't declare `buzzer: write` cannot make sound.

| Key | Values | What |
|---|---|---|
| `screen` | `write` | Can emit screen ops (`clr`, `bnr`, `txt`, `rect`, `fill`, `bmp`, `spr`). |
| `buttons` | `read` | Receives `onInput` calls for button events. |
| `buzzer` | `write` | Can emit `buz` and `seq` ops. |
| `led` | `write` | Can emit `led` ops. |
| `storage` | `facet` | Gets a per-app SQLite-backed key/value store at `this.ctx.storage.kv`. |

Keys not in this table are ignored. Missing keys default to
"no, you can't do that."

### `budget` *(optional but strongly recommended)*

Resource limits the runtime enforces.

| Key | Default | What |
|---|---|---|
| `cpu_ms_per_input` | 50 | Max CPU time per `onInput` / `init` call. Worker Loader kills overruns. |
| `ram_mb_steady` | 4 | Documentation-only at v0; not enforced. |
| `inputs_per_sec` | 10 | Documentation-only at v0; not enforced. |
| `alarm_min_interval_ms` | `null` | Documentation-only at v0; alarms are not yet wired (F-10). |

### `entrypoints` *(required)*

Which methods your `App` class implements. Must include at
least `init`. Others:

- `init()` — called when the user opens the app from the dock; must return a frame
- `onInput(input)` — called on every button event; must return a frame
- `alarm()` — *future* — called when a scheduled alarm fires (F-10 blocks this)

### `dock` *(optional)*

Display settings for the dock surface.

| Key | Type | What |
|---|---|---|
| `icon` | string | 1–2 ASCII characters shown next to the app id (currently unused; reserved for future dock styling). |
| `background` | bool | *Future* — keep app's facet alive while not foregrounded. Currently always `false`. |
| `default_alarm_ms` | number | *Future* — register a periodic alarm at install time. Currently must be `null`. |

### `custom_bindings` *(optional)*

`[]` for now. Reserved for future capability extensions.

## JS body

Standard ES module. The fabric runtime wraps your `App` class in a
Durable Object adapter, so:

- The `App` class **must** extend `DurableObject` from `cloudflare:workers`.
- It **must** export a class named exactly `App`.
- Methods declared in `entrypoints` **must** exist on the class.

The runtime injects these as `this.env.*` based on `permissions`:

| Permission | Binding | Type |
|---|---|---|
| `screen: write` | `this.env.SCREEN` | `WorkerEntrypoint` (currently a stub for capabilities; emit ops via the returned frame instead) |
| `buttons: read` | `this.env.BUTTONS` | stub |
| `buzzer: write` | `this.env.BUZZER` | stub |
| `led: write` | `this.env.LED` | stub |
| `storage: facet` | `this.ctx.storage.kv` | a key/value API over the facet's SQLite |

In v0, ops are emitted by **returning** a frame from `init` /
`onInput` rather than calling capability bindings imperatively.
This is intentional — see
[Why frames are returned, not pushed](../explanation/architecture.md#why-frames-are-returned-not-pushed).

## Input shape

`onInput(input)` receives:

```js
{
  kind: "btn",
  id: "a" | "b",
  phase: "down" | "long"
}
```

Convention:

- A press resolves with `phase: "down"` for short, `phase: "long"`
  for held >800ms.
- B press is **runtime-owned**: B always means "back to dock."
  Apps don't see B events.

If your app only handles short presses, write
`if (input.phase === "down")` and let `long` quietly no-op.
If you want both to fire the same action, write
`if (input.phase === "down" || input.phase === "long")`.

## Output shape

`init` and `onInput` must return either:

- A frame `{ f, ops }` (see [frame-protocol.md](frame-protocol.md))
- `null` / `undefined` — the runtime keeps the previous frame on screen

Throwing an error renders an "APP ERR" screen on the device with
the app id and `B: back` footer. The error message is logged
fabric-side via `console.log`.

## Storage API

`this.ctx.storage.kv.get(key)` returns the stored value or
`undefined`.

`this.ctx.storage.kv.put(key, value)` stores any
JSON-serializable value.

State is **per-app**: there is no way to read another app's
state. State persists across `wrangler deploy` redeploys
(it lives in the DO Facet's SQLite, not in Worker code).

## Examples

See live apps in the operator's Artifacts repo. The fabric ships
with reference apps:

- `counter` — minimum viable app (storage + button input)
- `pet` — sprites, mood machine, multi-state rendering
- `tunes` — `seq` op driving chiptunes; demonstrates audio
- `inbox` — special: rendered by the runtime, not an installable app

## See also

- [How to write an app](../how-to/write-an-app.md)
- [Frame protocol reference](frame-protocol.md)
- [HTTP endpoints reference](http-endpoints.md)
