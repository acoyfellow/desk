# exp-12 · How does an unpaired M5 join a desk in one ceremony?

## Why this matters

Today every M5 is bootstrapped via USB + `mpremote cp`. That doesn't
scale to "I have three of these" or to "the operator got a new M5 and wants
to use it before he gets to a laptop." The pairing flow is the
onboarding ceremony for a new device, and it's the threshold where
trust gets established with the desk fabric.

## Acceptance criteria

A new M5 can be paired in **a single ceremony** that requires no manual
file copying after the firmware is on it. The flow must:

1. **Prove the user is the owner.** A short-lived pairing code (visible
   on the user's phone or laptop browser, signed into desk) is entered
   on the device — or scanned via QR on the device's screen by the
   user's phone. Either direction is acceptable; pick one and justify.
2. **Provision a presence-bound device JWT** (exp-02 flow) into the
   device's flash, scoped to that one device, that one user.
3. **Survive a factory reset.** Re-pairing a wiped device produces a
   fresh JWT with a new `jti`; the old `jti` is automatically
   invalidated server-side after a configurable window.
4. **Ceremony total wall-clock time ≤30s** from "unboxed M5 with desk
   firmware" to "dock visible on screen, talking to fabric."
5. **No secrets in firmware.** The desk firmware shipped to the device
   contains zero per-user secrets. The pairing ceremony is what turns
   a generic firmware into "the operator's stick #2."

## What this unblocks

Real personal use. Desk feels like a *product* instead of a *project*
the moment the M5 you got from a friend can be on your desk in 30
seconds without a USB cable.

## What this is NOT

- Not multi-user pairing (a stick belongs to one user).
- Not BYO-firmware (we ship the firmware).
- Not an Apple-style HomeKit pairing flow. Simpler.

## State

🔴 not started · blocks on exp-11 (the dock is what the device shows
                 after pairing succeeds)
