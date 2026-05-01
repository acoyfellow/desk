# exp-13 · Can desk-fabric load apps from Cloudflare Artifacts via isomorphic-git?

(Numbered 13 to keep the original 11=dock, 12=pairing slots intact.
The deferred AI-generated frames slot keeps its name. We can renumber later.)

## Why this matters

exp-08 graduated with apps loaded inline from HTTP request bodies — fine
for tests, useless for a real platform where apps need to **persist**,
**version**, and **roll back**. exp-10's `AppSource` abstraction was
designed for exactly this: a pluggable interface so the runtime doesn't
care where app source comes from.

This experiment ships **two `AppSource` implementations** in priority order:

1. **`KvAppSource`** — works on any Workers Paid account. Default v0.
2. **`ArtifactsAppSource`** — git-backed app store via `isomorphic-git`
   over Cloudflare Artifacts' standard Git smart-HTTP. Versioning, rollback,
   audit trail come for free.

Why not wait for `env.ARTIFACTS.tree()/blob()`? Per the docs we have, those
methods aren't public yet (referenced in artifact-spec via internal MR !107).
We'll swap to the binding helpers when they ship; until then, isomorphic-git
gets us 100% of the *capability* with one extra dep.

## Acceptance criteria

For both `AppSource` implementations:

1. **`get(appId, version) -> Manifest + source`** returns the same
   markdown-frontmatter shape exp-10's parser accepts.
2. **`list() -> [{appId, latestVersion}]`** enumerates installed apps.
3. **The exp-08 fabric**, swapped to use either `AppSource`, passes the
   same 8/8 test suite from exp-08 unchanged. Apps come from KV/Artifacts
   instead of HTTP body; behavior is identical.
4. **Versioning works for ArtifactsAppSource specifically:**
   - Push v0.1.0 of counter, install, verify increment behavior.
   - Push v0.1.1 with reset-on-A semantics, install, verify new behavior.
   - `git revert` v0.1.1, push, verify v0.1.0 behavior is back.
   - All without re-deploying the desk-fabric Worker.
5. **Cold-start with isomorphic-git fetch ≤500ms** for a small repo.
   This is much higher than exp-08's 13ms because of the git fetch
   round-trip — measure honestly. Cache aggressively after first load.

## What "graduated" looks like

- `src/sources/KvAppSource.ts` — works.
- `src/sources/ArtifactsAppSource.ts` — works against the live `desk/apps`
  Artifacts repo on the operator's personal account.
- `src/index.ts` — exp-08's fabric, but reads via `AppSource`.
- A re-run of exp-08's `run.ts` test harness: 8/8 pass, plus 3 versioning
  tests that pass.

## State

🟡 in progress — scaffolded, awaiting `DESK_APPS_REPO_TOKEN` from the operator
to run the Artifacts half. KV half is unblocked.
