# exp-03 · Can X25519 + ChaCha20-Poly1305 fit in 162KB RAM in MicroPython?

## Why this matters

desk's third claim is "you own your edge, the edge owns nothing about you."
That's only true if the device and the user (across renderers) share keys
the *Worker* doesn't have. TLS to Cloudflare is great for transport, but
Cloudflare can decrypt it. Real E2E means a key exchange the Worker only
brokers, never holds.

Modern E2E primitives (X25519 + ChaCha20-Poly1305) are designed to be tiny.
But "tiny" was defined by Bernstein on 64-bit servers, not 162KB MicroPython
on an ESP32 with garbage collection. We need numbers.

## The acceptance criteria

1. **RAM peak during a full handshake + 100 messages stays under 80KB**
   (≈half of the 162KB total — leaves headroom for app, display, network).
2. X25519 key generation completes in **≤500ms** on the device.
3. Per-message encrypt and decrypt complete in **≤50ms**.
4. The implementation is either **stdlib MicroPython**, a **single
   pure-Python file we audit ourselves**, or a **C module we are
   willing to bake into our firmware build.** No opaque blobs.

## Failure modes to document

If this fails, the *honest* alternatives are:
- **a)** Trust the edge (TLS to Worker, no E2E). Document loudly.
- **b)** Restrict E2E to ciphertext-at-rest only; transit is TLS.
- **c)** Ship a minimal C module in the firmware (one-time cost).

A disproven exp-03 produces a clear written choice between these, not a
panic.

## Decision unblocked by this

The honest version of desk's "secure e2e" claim. The README cannot say
"E2E" without this experiment graduating, or it is lying.

## State

🔴 not started
