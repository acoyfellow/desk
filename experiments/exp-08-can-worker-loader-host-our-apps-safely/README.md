# exp-08 · Can Worker Loader host our apps safely?

(Renamed from "Workers for Platforms" — see Rule 2 in `.context/START-HERE.md`
about reading docs first. Worker Loader / Dynamic Workers is the right
primitive on the public Workers Paid plan.)

## Why this matters

This is the load-bearing experiment for desk-as-platform. exp-04 proved
that the JSON-manifest "app as data" shape is correct and that the
naive `new Function` runtime fails 5/6 attacks. exp-10 graduated the
v0 manifest schema. **This experiment validates that Worker Loader,
fed an exp-10-shaped manifest, contains those attacks for real.**

## Acceptance criteria

A `desk-fabric` Worker (under `wrangler dev`, fully local) loads
`apps/counter.md` and `apps/pet.md` from exp-10 and:

1. **Renders the counter app** — sends synthetic `{kind:"btn", id:"a", phase:"down"}`
   inputs and verifies the returned frames match the expected sequence.
2. **Storage isolates** — facet's SQLite is invisible to the supervisor.
   Test: counter persists across "restart" (DO eviction). Test: an
   attacker app cannot read the counter app's storage.
3. **Network isolates** — `globalOutbound: null` + permission map enforced.
   Test: an attacker app calling `fetch("https://attacker.com")` fails.
4. **CPU limit enforced** — `limits.cpuMs` from manifest budget kills
   `while(true) {}` attacks. Test: the host process stays responsive.
5. **Permission stubs enforced** — an app declaring `permissions: { led: write }`
   gets `env.LED`; an app NOT declaring it does NOT have `env.LED` even if
   it tries to call it.
6. **Cold start latency measured.** Target p50 ≤200ms for `LOADER.get(id, ...)`
   on first call; warm reuse measured separately.

## What "graduated" looks like

A run.sh script that, against `wrangler dev`, drives the same 6
synthetic checks the exp-04 attack harness ran but against Worker
Loader. Numbers are written to RESULT.md. Decision either:
- 🟢 graduated → desk's runtime is Worker Loader; F-3 and F-4 closed.
- ⛔ disproved → document the gap; fall back to exp-09 (QuickJS) and
  reopen the runtime question.

## State

🟡 in progress
