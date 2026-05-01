# PARKED — but the WORK shipped

The question this experiment asked ("can the M5 render a dock of
installed apps?") was answered affirmatively, but not in this
directory.

The actual dock implementation lives at `device/desk-rt.py` (search
for `render_dock`, `_dock_chrome`, `_dock_row`). It pulls the app
list from the fabric Worker's `/list` endpoint and renders it using
the same frame primitives apps use.

Notable variances from the original acceptance criteria:

- ❌ The dock is NOT itself an app called `desk:dock` (criterion 4).
     It's drawn directly by the runtime. Less protocol-pure but it
     keeps the firmware ≤300 lines and avoids a chicken-and-egg
     bootstrap.
- ✅ Switch latency is acceptable (no formal p50 captured; visually
     under 300ms in dev).
- ❌ Background-app onAlarm callbacks (criterion 6) deferred — see
     F-10 (pet's setAlarm replacement) in DECISIONS.md.

If you're an agent re-asking this question: read `desk-rt.py`'s
dock loop. If you're proposing the "dock-as-app" pattern from this
README, write a new experiment that justifies the added complexity.
