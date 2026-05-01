# 2026-04-27 — M5 stable on the deployed edge

## What works (right now, in the operator's hands)

- **MicroPython firmware**: v1.22.2 (NOT v1.24.1 — that build's WiFi
  driver hits abort() with "Expected to init 10 rx buffer, actual is 4"
  on this ESP32-PICO-D4 because the IDF 5.x defaults can't fit).
- **WiFi/DNS/TLS**: M5 connects to JandM, resolves
  `desk-fabric.workers.dev`, completes TLS handshake.
- **Dock UI**: CF cloud + DESK header (small font, aligned), app list,
  delta repaint on B press (no full redraw).
- **End-to-end**: M5 → deployed Worker → Artifacts repo → Worker Loader
  isolate → frame back → ST7789 render. Real production stack, real
  edge, real device.

## Findings nailed down (all of F-13 understood now)

| Cause | Reality |
|---|---|
| `Expected 10 rx buffer, actual 4` | v1.24.1 IDF 5.x WiFi defaults too big for ESP32-PICO-D4. v1.22.2 IDF 4.x defaults fit. |
| `Failed to configure netif... duplicate key` after machine.reset() | `machine.reset()` is CPU-only; leaves netif registered. Use esptool RTS reset or full USB unplug. |
| `OSError -202` from urequests after DNS warmup | lwIP DNS cache loses entries during heavy I2C ops between WiFi-up and HTTP. Fix: warm up the SPECIFIC fabric host right before each HTTP call. |
| `ETIMEDOUT` on TLS handshake | TLS needs ~30-40KB contiguous heap. With v2 big font loaded we had 102KB but fragmented. Dropping vga2_bold_16x32 freed 16KB and fixed it. |

## Files / state

- `~/cloudflare/desk/device/playground/firmware-v1.22.bin` (1.7 MB) — pinned
- `~/cloudflare/desk/device/playground/firmware-v1.24.bin` — kept as
  reference; do not flash on this chip
- `desk-rt.py` final shape: 2-phase boot (network first, stick second),
  per-call DNS warmup, no big-font dependency
- `stick.py`: removed `vga2_bold_16x32` import; big=True now uses 2x
  manual scaling of the small font

## What's still open

- F-10 pet app fails (`Facets currently cannot set alarms.`) — needs
  supervisor-mediated alarms or "stateless decay" rewrite of pet.
- F-11 HTTPS-per-press latency — D1 (WebSocket) was the right answer.
- F-12 button polling can miss presses during in-flight HTTPS.
- Big-font replacement is a hand-rolled 2x scale; quality untested.

## What's next (per the operator's priorities)

A) Polish pass: pet works, button responsiveness, error recovery
B) Orchestration layer: BROWSE / EDIT / NEW modes; phone-as-typing
   surface via QR; voice-to-app via Workers AI Whisper.
