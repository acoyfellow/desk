# exp-03 · RESULT

**Date:** 2026-04-27
**State:** 🟢 **Graduated with caveats** — fits, but not in the shape we asked for.

## Numbers (measured on M5StickC Plus 1.1, MicroPython 1.24.1, 160 MHz)

| Metric | Target | Measured | Verdict |
|---|---|---|---|
| X25519 keygen | ≤500ms | **438ms** | ✅ pass |
| X25519 full handshake (2 keypairs + 2 DH) | — | 1351ms | (info) |
| RAM delta during X25519 | <80KB | **448 bytes** | ✅ way under |
| Per-1KB encrypt | ≤50ms | **0.37ms** (AES) | ✅ pass |
| Per-1KB decrypt | ≤50ms | **0.43ms** (AES) | ✅ pass |
| HMAC-SHA256 / 1KB | — | 2.82ms | (info, polyfill works) |
| RAM peak after all crypto loaded | <80KB | **10.7KB** | ✅ way under |
| RAM free after all crypto | — | 155.8KB / 162.7KB | ✅ healthy |

## What we asked vs. what we got

We asked: **X25519 + ChaCha20-Poly1305** in budget.

Reality on this firmware:

- **X25519 in pure Python** — ✅ works, fits easily, single keygen = 438ms (acceptable for one-time pairing; painful for per-message ephemeral keys).
- **ChaCha20-Poly1305** — **not in `cryptolib`**. Only AES is exposed natively. A pure-Python ChaCha20 would be ~50× slower than native AES based on these numbers. Not viable for streaming.
- **AES-256-CBC native** — ✅ extremely fast (sub-millisecond per KB).
- **SHA-512, BLAKE2** — **missing from `hashlib`** on this firmware.
- **`hmac` module** — **missing**, but ~6-line polyfill on `hashlib.sha256` passes RFC 4231 vector and runs at 2.82ms / 1KB.

## The honest decision

**Use X25519 + AES-256-GCM (or AES-256-CBC + HMAC-SHA256), not ChaCha20-Poly1305.**

Justification:
1. Numbers fit our budget by **two orders of magnitude** for memory and one for CPU.
2. AES-256-GCM is just as standard as ChaCha20-Poly1305 and AES is the native primitive on this firmware (likely hardware-accelerated on ESP32).
3. ChaCha20 was a hedge against ARM Cortex-M0 devices without AES hardware. ESP32 has AES instructions; the hedge isn't ours to make.

Caveat: `cryptolib` exposes AES with modes `1=ECB`, `2=CBC`, `6=CTR`. **No GCM**. So in practice we get **AES-256-CTR + HMAC-SHA256 (encrypt-then-MAC)** — Bellare-Namprempre proven secure when constructed correctly. We accept the construction-correctness burden in exchange for fitting the firmware.

## What this unblocks in DECISIONS.md

> **Crypto suite:** X25519 ECDH for key exchange, AES-256-CTR for stream encryption, HMAC-SHA256 (polyfill) for authentication, SHA-256 for hashing/HKDF. The README **may** use the phrase "end-to-end encrypted" with a footnote linking here. ChaCha20-Poly1305 is rejected.

## What this does NOT unblock

- The **protocol-level** security (replay protection, forward secrecy on long-lived sessions, key rotation). Those are exp-02's territory and will get their own measurements.
- Whether desk *needs* E2E at all vs. trusting the Worker. Open question, but now we know we *can* afford to add it later if the answer changes.

## Reproduce

```bash
cd ~/cloudflare/desk/experiments/exp-03-can-e2e-crypto-fit-in-162kb
PORT=/dev/cu.usbserial-7152181438 \
  mpremote connect $PORT cp x25519_pure.py :x25519_pure.py
mpremote connect $PORT run run_bench.py
mpremote connect $PORT exec "import os; os.remove('x25519_pure.py')"
```
