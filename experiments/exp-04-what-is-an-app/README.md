# exp-04 · What is an "app" — TS DO class, JSON manifest+sandbox, or AI-generated frame stream?

## Why this matters

This is the load-bearing question for the prompt→app loop. The format of
an "app" determines:

- Whether an LLM can reliably generate one from a prompt.
- Whether a stranger can read one and understand it in 7 minutes.
- The blast radius if an app is malicious.
- The rev-loop time when the operator says "make it red instead of blue."

We need empirical evidence for which format wins, not architectural taste.

## The three candidates

**A. TS DO class.** Each app is a `DurableObject` subclass deployed as a
Worker. Powerful, full type safety, but a malicious app gets full Worker
capabilities, and prompt→app means the LLM is generating production
TypeScript.

**B. JSON manifest + sandboxed JS.** App is `{manifest, render(input,
state) -> frames}` — manifest declares permissions, render is JS in a
restricted runtime. Clear blast radius, harder to write expressively.

**C. AI-generated render-frame stream.** App is a *prompt* the fabric
runs every interaction. Worker calls Workers AI; AI emits the next frame
+ side-effects. No code at all; only the prompt is the artifact. Wildly
flexible, performance-bounded by AI latency, blast radius unclear.

## The acceptance criteria

For each candidate, build a **trivial counter app** ("press A, number goes
up; press B, reset"). Measure:

| Metric | Target |
|---|---|
| Lines of code (or prompt) | record actual |
| Wall-clock time to ship from "I want this" | record actual |
| p50 latency from button press to frame on device | <250ms desirable |
| Edit-loop time (change "+1" to "+2") | <30s desirable |
| Documented attack: malicious app reads another app's state | record yes/no/how |
| RAM/CPU cost on the device | record actual |

A candidate **graduates** if it: (a) ships in the time/lines budget,
(b) has a documented attack path that we can plausibly close,
(c) passes the 7-minute README test for "how do I make my own app."

Multiple candidates can graduate. desk may end up with two layered
formats (e.g. "C for prompt-to-app, A for power users"). The experiment
is allowed to recommend a hybrid.

## Decision unblocked by this

The protocol shape, the security model's blast-radius story, and whether
desk's prompt→app loop is realistic at all.

## State

🔴 not started
