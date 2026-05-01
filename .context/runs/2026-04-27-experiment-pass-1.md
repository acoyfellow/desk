# 2026-04-27 — Experiment pass 1

## What ran

Five experiments executed today; one big pivot.

| # | Question | Time | Outcome |
|---|---|---|---|
| 03 | Crypto in 162KB RAM | ~15min | 🟢 Graduated w/ caveat — ChaCha20 not native, pivoted to AES-256-CTR + HMAC-SHA256. Numbers fit budget by 2 orders of magnitude. |
| 04 | What is an app | ~30min | 🟡 Partial — A and B implemented, frame-parity 6/6, **5/6 attacks against B's `new Function` sandbox SUCCEEDED**. Decision: B-shape with real isolate runtime. C deferred. |
| 01 | WS Hibernation cell handoff | ~10min | 🟢 Graduated (local-fidelity) — 0 message loss across 3 forced reconnects, p50 reconnect 6.7ms. Compromise: tested via host Python WS client, not real M5 Wi-Fi toggle. |
| 02 | Presence-bound JWT | ~5min run + ~70s wait | 🟢 Graduated w/ 2 findings — resurrection bug exposed (heartbeat after expiry brings token back; must reject); tamper-test bash bug exposed (methodology). |
| 06 | Non-Stratus client to LEE | ~25min | 🟢 Graduated — direct path exists via `/api/ws` + API Gateway JWT, **no Lee-side changes needed**. desk-broker pattern designed for the M5 surface. |

## Pivot

Mid-pass, the operator asked: "what about an app to chat with Lee from the
desk?" That question changes desk's killer app from "build a tiny app
platform" to "build a tiny *client* for Cloudflare's existing internal
agent." exp-06 was created on the fly to validate the pivot is viable
without depending on a Lee-side change. It is.

## Key findings

- **exp-04 attack results** are the most security-relevant outcome. The
  intuition that "JSON manifest = data, easy to sandbox" was naively
  wrong — `new Function` reads `globalThis` (86 keys), reads `process.env`
  (54 vars), exposes `fetch`, and can hang the host. Real production
  needs QuickJS-WASM or Workers-for-Platforms.

- **exp-02 resurrection bug** would have been a vulnerability in
  production. Heartbeat endpoint currently re-instates expired tokens.
  Three-line fix; documented as F-1.

- **exp-06 unblocks the project entirely.** desk doesn't need to build
  agent infrastructure. cloudflare-agent's `/api/ws` is already the
  contract. M5 rides via a desk-broker; browser/pi rides direct.

## Deferred

- exp-04C (AI-generated frames) — needs Workers AI; needs write-scoped CF token.
- exp-05a/b/c (renderer triplet) — partially obsolete now; the LEE-chat
  app *is* the renderer parity test. Will re-scope post-pivot.
- exp-07 (minimum LEE WS protocol subset) — drafted in exp-06's "open
  questions"; needs its own folder.
- exp-08 (JWT handoff at pairing) — drafted in exp-06; needs its own folder.

## Infrastructure left running

- `~/cloudflare/desk/experiments/_fab-local/` — local Worker with
  SeqRoom (exp-01), AuthRoom (exp-02), CounterRoom (exp-05 stub).
  Reproducible via `bunx wrangler dev`.
- M5StickC Plus 1.1 — clean (only the original test-firmware, no
  uploaded files lingering after the crypto bench).

## Next session entrypoints

- Fix F-1, F-2 in `_fab-local/src/index.ts`, re-run exp-02 (~5 min).
- Spec exp-07 + exp-08 (the LEE-broker design exps).
- Build the desk-broker Worker + the LEE-chat app. (This is the demo.)
