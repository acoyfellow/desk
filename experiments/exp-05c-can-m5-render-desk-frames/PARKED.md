# PARKED — but the WORK shipped

The question this experiment asked ("can the M5 render desk frames?")
was answered affirmatively, but not in this directory.

The actual frame-renderer code lives at `device/desk-rt.py` and
`device/playground/lib/stick.py`. The frame op vocabulary is
documented inline at `desk-rt.py` `render()`.

The `RESULT.md` for this question is effectively the running
production code. Treating that as evidence:

- ✅ M5 receives `{ f, ops: [...] }` JSON over HTTPS and renders it.
- ✅ Op vocabulary covers everything desk apps need (clr, bnr, txt,
     rect, fill, bmp, spr, led, buz, seq).
- ✅ Total firmware footprint (desk-rt.py + stick.py + st7789py.py +
     font) fits comfortably on the M5StickC Plus 1.1.

If you're an agent re-asking this question: read `device/desk-rt.py`,
not this directory.
