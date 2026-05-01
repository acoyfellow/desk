# exp-10 · What does a desk app manifest declare?

## Why this matters

A sandbox without a permission model just means malicious code runs in
a slightly smaller blast radius. The manifest is the **contract** between
an app and the desk fabric: what the app needs, what surfaces it touches,
what it commits to NOT touching. Until we know the manifest schema,
exp-08 and exp-09 are sandboxing nothing in particular.

## Acceptance criteria

A frozen v0 manifest schema (`manifest.v0.json`) lives in `experiments/`
and answers all of these *with examples*, not vibes:

1. **Identity** — id, name, version, author, signature(?). What makes
   two apps "the same app" across versions?
2. **Permissions** — declared up-front, enforceable by the broker.
   Initial set: `led`, `buzzer`, `screen`, `imu`, `button`, `net:outbound`,
   `net:fetch:<host>`, `store:read`, `store:write`, `mcp:<server>:read`,
   `mcp:<server>:write`. Need to define each enforcement point.
3. **Entrypoints** — what handlers the app implements. At minimum:
   `init`, `onInput`, `onAlarm`. Optional: `onBackground`, `onMessage`.
4. **Render contract** — does the app emit deltas or full frames? What's
   the Op alphabet (cribs from `experiments/exp-04-what-is-an-app/harness/protocol.ts`)?
5. **Resource budget** — declared max memory, max CPU per turn, max
   inputs/sec the app expects. The fabric uses these to pick a tier
   (QuickJS for small, W4P for fat).
6. **Lifecycle hooks** — install, uninstall, upgrade. What state survives?
7. **Source format** — is the manifest the whole app (handlers inline)
   or does it reference separate files? exp-04 candidate-B was inline;
   that should remain v0 default.

## What this unblocks

exp-08 and exp-09 can write real enforcement against a real schema. The
prompt→app loop has a target shape: "LLM, please produce a v0 manifest
with these permissions and an `onInput` handler that does X."

## What this is NOT

- Not a full IDL or spec doc. It's a *frozen v0 schema with one or two
  example apps.* If we get it 80% right, that's enough to unblock; we'll
  bump to v1 when a real app stretches it.
- Not a marketplace catalog format. There is no marketplace.

## State

🔴 not started · runs alongside exp-08/09 since the schema feeds them
