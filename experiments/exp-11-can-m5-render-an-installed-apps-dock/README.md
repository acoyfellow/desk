# exp-11 · Can the M5 render a "dock" — installed apps list, A=open, B=back?

## Why this matters

The platform isn't a platform until you can switch apps. The dock is
the simplest possible expression of that: a list of installed apps,
A opens the highlighted one, B goes back. Hold-A enters edit mode (move
or remove). Without this, every demo is a single hand-rolled app and
the platform claim is false advertising.

## Acceptance criteria

1. The M5 boots into a dock screen showing all apps installed for that
   device, fetched from the desk fabric.
2. Button A on a highlighted entry opens that app — the WS reconnects
   to that app's DO and the screen is fully owned by the app.
3. Button B from any app returns to the dock.
4. The dock itself is rendered using **the same frame protocol every
   app uses** (i.e. the dock is just an app called `desk:dock`). Eat
   our own dog food on the protocol.
5. Switch latency (button press → new app's first frame on screen)
   is measured. Target p50 ≤300ms.
6. Background apps continue to receive `onAlarm` callbacks while not
   foregrounded — verified by a test app that increments a counter
   on alarm and shows the value when re-opened.

## What this unblocks

The "many apps installed" claim from the platform vision. Plus the
mental model needed for prompt→app: when an LLM creates a new app,
where does it go? It goes in the dock.

## What this is NOT

- Not a beautiful UI. 135×240 pixels.
- Not multi-user, not multi-device-foreground (one app at a time on
  a given device).
- Not a marketplace. The dock shows what's installed; it doesn't
  let you discover new apps.

## State

🔴 not started · blocks on exp-10 (need manifest to know what to render)
                 blocks on exp-08 *or* exp-09 (need somewhere to host
                 a couple of test apps to put in the dock)
