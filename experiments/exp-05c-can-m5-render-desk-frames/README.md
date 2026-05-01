# exp-05c · Can the M5StickC render desk frames?

## Why this matters

This is the original constraint: if it works on a 162KB device, it works
anywhere. We've already proven (in `~/code/hardware-in-the-machine/`)
that the M5 can drive its display; this experiment is the **runtime+protocol**
proof, not the display proof. Specifically: can a single MicroPython
program connect, authenticate, receive frames, render them, send inputs,
and stay alive — all within RAM budget?

## The acceptance criteria

1. The M5 runs a single `desk.py` module that is **≤300 lines**.
2. It boots, connects, renders the counter app within **≤5s** from cold.
3. RAM peak during steady-state operation is **≤80KB**, leaving room for
   future apps' state.
4. The runtime survives a 1-hour soak test without OOM, leaks, or
   visible glitches.

## What this experiment is NOT

- Not the transport experiment (that's exp-01).
- Not the auth experiment (that's exp-02).
- Not the crypto experiment (that's exp-03).

This experiment **integrates** the winning answers from those into a
single device runtime, and proves the integration fits. It is the
last to graduate.

## Decision unblocked by this

Whether `desk-rt/` (the production device runtime) gets created at all,
and what its RAM/LOC envelope looks like.

## State

🔴 not started · blocked on exp-01, exp-02, exp-03 graduating first.
