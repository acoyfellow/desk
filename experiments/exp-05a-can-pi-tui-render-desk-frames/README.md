# exp-05a · Can pi render desk frames in a TUI pane?

## Why this matters

If the same wire format that drives a 162KB MicroPython device can also
drive a TUI panel inside `pi`, the protocol is genuinely portable, and
the operator can develop/debug desk apps **without the hardware in his hand.**
This is the cheapest possible portability proof.

## The acceptance criteria

1. A pi extension subscribes to the same WebSocket / endpoint the M5
   would, and renders the resulting frames into a bordered panel.
2. The same demo app (the exp-04 counter) runs on pi *and* M5, and
   visually matches: same banner, same text positions, same color
   intent. Color may degrade to nearest-256 or grayscale.
3. Inputs work: pressing a keybinding in pi sends the same `btn:a:down`
   event the M5's button would. No code branches in the app.

## What "match" means with different display sizes

The M5 is 135×240. A pi panel is character cells. The renderer is allowed
to scale, wrap, or down-sample, but **must not require the app to know**.
If the app sends `["txt", 4, 30, "hi", WHITE]`, the pi renderer figures
it out.

## Decision unblocked by this

Whether desk's protocol is "the M5 protocol" or "a portable display
protocol that happens to run on M5 first." We want the latter. This
experiment proves it.

## State

🔴 not started
