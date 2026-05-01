# exp-05b · Can a browser tab render desk frames?

## Why this matters

A browser renderer is the *demo surface* for desk. New users will not
own an M5. They open `desk.coey.dev`, sign in, see their desk in a tab,
and within minutes are typing `make me an app that...`. If we can't
render the same protocol in a browser, the on-ramp is gated by hardware,
which contradicts "the protocol is the product."

It's also the surface where the prompt→app conversation likely lives,
because typing on the M5 is a non-starter.

## The acceptance criteria

1. A static page (no framework required for the spike) opens a WebSocket
   to the same fabric endpoint, receives the same frames, and renders to
   a `<canvas>` at the M5's native 135×240, scaled up.
2. The same demo app (counter) works without app code changes.
3. Inputs work: clicking a button in the canvas sends `btn:a:down`.
4. Page is **<10KB** of JS, no build step. If we can't fit a desk
   renderer in 10KB of vanilla JS, we picked the wrong protocol.

## Decision unblocked by this

Whether desk's onboarding can be "open a URL" instead of "buy hardware."
Affects the README's 7-minute test directly.

## State

🔴 not started
