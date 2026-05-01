# exp-09 · Can QuickJS-WASM-in-a-Worker sandbox desk apps with smaller ops cost than W4P?

## Why this matters

If exp-08 graduates, W4P solves the sandbox problem — but every app is
its own deployable Worker artifact. That's a lot of ceremony for a
30-line app. **QuickJS-WASM** runs a JS engine inside a single host
Worker; each app is just a string of JS the host evaluates inside a
sub-isolate of QuickJS's own making. Strictly weaker isolation than
W4P (still a single host process), but no per-app deploys, lower latency,
and arguably better fit for "I'm prototyping an app on the device right
now."

## Acceptance criteria

1. A single host Worker loads QuickJS-WASM and runs the same counter
   app source from exp-04 inside it.
2. The 5 exp-04 attacks are blocked or contained:
   - read globalThis → only the QuickJS-exposed surface is visible
   - read process.env → not present
   - fetch → only available if explicitly bridged by host
   - filesystem → not present
   - while(true) → killed by an `interruptHandler` after Nms
3. Cold start of the QuickJS context is measured. p50 ≤50ms expected.
4. Per-frame execution latency for the counter app is measured.
5. **Memory cost per loaded app** is measured (QuickJS contexts are
   not free). Target: ≥10 apps fit in one Worker's memory budget.

## What this unblocks

A potential **second tier** of app hosting: QuickJS for live-coded
"prototype" apps you create on-device in seconds, W4P for "promoted"
apps that need real isolation or persistence. If 09 graduates with a
clean security story, **the prompt→app loop becomes feasible** — an
LLM emits app source, the host loads it into QuickJS in tens of ms,
the user sees the result on the M5 in real time.

## State

🔴 not started · runs after exp-08 so we can compare apples-to-apples
