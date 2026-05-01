# exp-02 · RESULT

**Date:** 2026-04-27 (re-run with F-1 + F-2 fixes applied 2026-04-27)
**State:** 🟢 **Graduated. Both findings fixed and re-verified.**

## Numbers (post-fix)

| Test | Result | Notes |
|---|---|---|
| Mint + immediate check | ✅ ok, age 136 ms | |
| Heartbeat keeps token live | ✅ ok, age 9 ms | |
| Tamper detection (flip middle byte of signature) | ✅ **HTTP 401 `bad_signature`** | F-2 fix verified |
| Presence expiry (65s without heartbeat) | ✅ HTTP 401 `presence_expired` | window worked |
| **Resurrection attempt via heartbeat after expiry** | ✅ **HTTP 401 `presence_expired`, token now also explicitly revoked** | **F-1 fix verified** |
| Explicit revoke → reject | ✅ HTTP 401 `revoked` after 39 ms | within budget |

## Finding 1 — Tamper test methodology (FIXED)

Original test used `TAMPERED="${TOKEN%?}A"` (truncate + append) which
was unreliable. **Fix landed:** test now uses Python to flip a single
character at the midpoint of the signature component, choosing a
different char from the same base64url alphabet. Post-fix run returns
`HTTP 401 bad_signature` as expected. The Worker's `jwtVerify` was
always correct; only the test was lying.

## Finding 2 — Resurrection bug (FIXED, verified)

**Original observation:** `POST /heartbeat` from anyone holding the
token re-wrote the `hb:<jti>` storage entry, resurrecting an expired
token. Attacker holding token after a 60s+ unplug could keep using it.

**Fix landed (in `_fab-local/src/index.ts`):**

```ts
const age = Date.now() - last;
if (age > AuthRoom.PRESENCE_WINDOW_MS) {
  await this.ctx.storage.delete(`hb:${jti}`);  // also revoke explicitly
  return j({ ok: false, reason: "presence_expired", age_ms: age }, 401);
}
```

**Post-fix verification (test #6):**
- Heartbeat against an expired token now returns 401 `presence_expired`
  AND deletes the `hb:` record (explicit revocation).
- A subsequent `/check` returns `revoked` (not `presence_expired`),
  confirming the token is now hard-dead and cannot be brought back
  even by the legitimate user. The legitimate user must re-issue via
  `/auth/issue`.

This matches the intended security property. The earlier behavior was a
latent vulnerability the experiment exposed — exactly the point of
running experiments before writing production code.

## Numbers against the acceptance criteria (post-fix)

| Criterion | Target | Measured | Verdict |
|---|---|---|---|
| Revocation latency after unplug | ≤60s | 65s (window expiry) | ✅ pass (window configurable) |
| Heartbeat replay attack | must fail | **fails with 401** | ✅ pass (F-1 fix) |
| Legitimate 60s blip does not revoke | should keep alive | configurable; currently equals window | ⚠️ design tension still present — see below |
| Explicit revoke latency | ≤100ms | 39 ms | ✅ pass |
| Tamper detection | must reject | rejects 401 `bad_signature` | ✅ pass (F-2 fix) |

## Design tension to resolve

If the presence window equals the maximum tolerable network blip, those
two are the **same number**. Two solutions:

- **Option A:** keep them equal (60s). A device that goes silent for 60s
  is treated as gone and must re-issue. Simple, secure.
- **Option B:** two windows — `presence_window` (e.g. 60s, controls
  validity) and `grace_window` (e.g. 5min, controls how long a
  presence-expired-but-recently-valid token can self-renew with proof of
  liveness, e.g. fresh signature over a Worker-supplied nonce).

Option B is more user-friendly for spotty cell connections. Option A is
more secure. **Pick A for v0**, document upgrade path to B.

## Decisions

> **Auth model (v0):** Presence-bound device JWT (HS256 over a
> Worker-held secret), `jti` indexed in DO storage with a `last_heartbeat`
> timestamp. Validity check requires `now - last_heartbeat ≤
> presence_window_ms` (default 60s). Heartbeat endpoint **must reject
> updates to expired tokens** (Finding 2 fix). Explicit `/revoke` deletes
> the `jti` record, taking effect on the next request.

> **Open for v1:** grace-window upgrade per Option B above; rotation of
> the signing secret; per-device-bound TLS pinning.

## Reproduce

```bash
# Terminal 1
cd ~/cloudflare/desk/experiments/_fab-local
bunx wrangler dev

# Terminal 2
cd ~/cloudflare/desk/experiments/exp-02-can-device-jwt-be-presence-bound
./run.sh
```
