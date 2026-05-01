# exp-01 · Can WebSocket Hibernation survive a cell→hotspot handoff on ESP32?

## Why this matters

desk wants to be a real-time-feeling system on a battery-powered device
that roams between Wi-Fi networks. Polling drains battery and adds latency;
WebSockets have well-known reconnection pain. Cloudflare Durable Objects
ship a "Hibernation API" that's supposed to keep the *logical* connection
alive across short network blips. We need to know: in practice, on ESP32
MicroPython, with a real cell hotspot, does it work, or does the abstraction
leak?

## The acceptance criteria

A run is successful if all three are true:

1. The device, holding a single open WebSocket to a Hibernating DO, can
   survive **at least 5 deliberate network outages** (Wi-Fi off → on)
   over a 30-minute test, with **automatic reconnection in ≤10s p95**.
2. **Zero application-layer message loss** in steady state. (DO buffers
   what it can; device acks; we measure gap detection.)
3. Total device-side reconnect code is **≤80 lines** of MicroPython.
   If the abstraction needs more glue than that, we should know.

## Test plan (sketch — refine before running)

- DO emits a monotonic `seq` counter every 1s.
- Device records seq + wall-clock on receive.
- Test harness toggles ESP32 Wi-Fi on/off on a randomized schedule.
- 30-minute run. Output: CSV of seq gaps, reconnect intervals, RAM peak.

## Decision unblocked by this

Whether desk's transport is **WebSocket Hibernation** or a **polling +
SSE hybrid.** A no on this experiment doesn't kill desk; it just changes
the spine.

## State

🔴 not started
