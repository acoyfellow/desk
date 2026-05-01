# exp-13 · RESULT

**Date:** 2026-04-27
**State:** 🟢 **Graduated** — apps load from Cloudflare Artifacts via isomorphic-git, end-to-end. Versioning works. Rollback works. F-6 (loader cache by `${id}:${ver}:${sha}`) closed.

## What was proven

### 1. Real Artifacts repo created on the maintainer's personal account
- Namespace: `desk`
- Repo: `apps`
- Remote: `https://<account-id>.artifacts.cloudflare.net/git/desk/apps.git`
  (account ID redacted; each desk operator has their own.)
- Mounted with a repo-scoped `art_v1_*` token (cannot touch other repos)

### 2. Standard `git push` is the install protocol
```
$ git clone <repo>
$ cp counter.md apps/counter/manifest.md
$ git commit -am "install counter@0.1.0"
$ git push
```
That sequence runs on the host laptop with the standard `git` binary.
The Artifacts service speaks Git smart-HTTP; no special tooling.

### 3. The fabric Worker reads apps via isomorphic-git over HTTPS
`ArtifactsAppSource` uses `isomorphic-git` + the official MemoryFS pattern
from CF docs to clone the repo into a Worker's heap, read
`apps/<id>/manifest.md`, and return the parsed file. From there it's
the exp-08 path: hash the source, feed to Worker Loader, run as a Facet.

```
GET /list      → {"apps":[{"id":"counter","versions":["0.1.0"]}]}
POST /run?app=counter&action=init →
  frame:f=0, version=0.1.0, hash=2b02152..., sourceFetchMs=903
```

### 4. Versioning end-to-end (the Liquid Primitives demo)

**Push a new version → next request serves it. Zero Worker redeploys.**

```
git push counter@0.1.1 (A behavior changes from +1 to +2)
  → /run shows version=0.1.1
  → A press: f=2 (was f=1 before)
  → A press: f=4

git revert HEAD; git push
  → /run shows version=0.1.0 again
  → A press: f=1
```

This is the whole point of putting apps in Artifacts. **The platform's
"upgrade" and "rollback" stories are `git push` and `git revert`.**

## Numbers

| | |
|---|---|
| First fetch (clone) | **903 ms** |
| Subsequent fetch (incremental, but full clone in current impl) | **~950 ms** |
| Inside-isolate render (after fetch) | <5 ms (consistent with exp-08 warm) |
| Repo size | tiny — single 1.4 KB file |

## Findings

### F-7 (NEW): `ArtifactsAppSource` is recreated per request

In the current implementation, every `/run` instantiates a fresh
`ArtifactsAppSource`, which has a fresh empty `MemoryFS`, which forces
a fresh clone. The 30s in-class cache never fires.

**Fix:** hold the `AppSource` instance at the Worker module scope (or
in the supervisor DO's storage) so the MemoryFS persists. Worker module
state survives across requests within an isolate. Should drop steady-state
fetch time to <50ms (incremental fetch only when there are new commits).

Not graduating-blocking. Filed as F-7.

### F-6 (CLOSED): loader cache key includes content hash

Done in this experiment. Loader id is `${id}:${version}:${sha8}`. Any
source change forces a fresh load even at the same semver. Verified by
the version-bump test above.

### F-8 (NEW): MemoryFS needs `readlink` and `symlink` stubs

isomorphic-git's `bindFs` enumerates a fixed list of fs methods including
these. Missing methods → `undefined.bind()` failure at clone init. Fixed
in this experiment by adding stubs that throw with proper `EINVAL`/`ENOSYS`
codes. Worth upstreaming a note to the CF docs example.

### F-9 (NEW): MemoryFS needs Node-fs-style `err.code`

isomorphic-git's `exists()` helper inspects `err.code === 'ENOENT'`. Bare
`new Error("ENOENT: ...")` with the code only in the message string
breaks its detection. Fixed: errors now carry `.code`, `.errno`, `.path`
matching node:fs conventions.

## Decision

> **D9: AppSource for desk = Artifacts via isomorphic-git, today.**
> The `ArtifactsAppSource` impl in this experiment is the v0 production
> path. A `KvAppSource` exists in the same dir as the no-Artifacts
> fallback. When Cloudflare's `env.ARTIFACTS.tree()/blob()` binding ships
> publicly, the implementation will be replaced (same interface, less
> code, faster). The interface (`AppSource`) is the contract the rest of
> desk depends on; storage backends are swappable.

> **App install pipeline = `git push`** to the user's personal `desk/apps`
> Artifacts repo. Update = `git push` of a new manifest version. Rollback
> = `git revert; git push`. **No bespoke install protocol exists in desk
> because git already is one.**

## What this unblocks

- **The dock (exp-11)** can now list real apps via `/list` → render
  the result.
- **The prompt→app loop (exp-13b — to come).** Workers AI emits a
  manifest.md → fabric calls `appSource.push()` → the new version is
  immediately live. Mechanical, no inventions left.
- **Audit / observability.** `git log` is the audit trail. `git diff`
  is the change view. Free.

## Reproduce

```bash
# One-time setup (per operator):
# - Mint Artifacts:Edit token, save to ~/.config/desk/cf-artifacts-edit-token
# - curl POST /artifacts/namespaces/desk/repos {"name":"apps"}
# - Save resulting art_v1_ token to ~/.config/desk/apps-repo-token

cd experiments/exp-13-artifacts-app-source
bunx wrangler dev   # listens on :8913

# In another shell:
curl http://127.0.0.1:8913/list
curl -X POST 'http://127.0.0.1:8913/run?app=counter&action=init'
# To bump a version: clone the repo, edit, push, hit /run again.
```

## Security notes (for whoever reads this next)

- `.dev.vars` contains the repo token in plaintext for local dev. Mode 600,
  gitignored. NOT an account token — `art_v1_*` is scoped to the one repo.
- Production deployment uses `wrangler secret put` for the same vars.
- Token TTL: 1 hour default, 7-day max. `ArtifactsAppSource` will need
  a refresh path before production (the broker DO can mint new repo
  tokens via the broader Artifacts:Edit token, lazily).
- The broader Artifacts:Edit token lives at
  `~/.config/desk/cf-artifacts-edit-token`. Operators can revoke it when
  not actively creating new repos; the repo token continues to work.
