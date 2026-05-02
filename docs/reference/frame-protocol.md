# Frame protocol

A *frame* is the unit of rendering desk apps emit. The fabric Worker
returns a frame in response to every `/run` call. Every desk client
(M5StickC firmware, browser viewer, future surfaces) executes the
same op vocabulary against the same coordinate system.

## Frame shape

```json
{
  "f": <number | string>,
  "ops": [ <op>, <op>, ... ]
}
```

| Field | Type | Notes |
|---|---|---|
| `f` | any JSON-serializable value | Frame id. Apps pick something monotonic-ish (timestamp, counter value) so clients can detect "same frame, no work". Not strictly enforced. |
| `ops` | array of op tuples | Drawn in order, top-down. |

Anything else returned alongside `frame` is metadata — clients ignore
unknown keys.

## Coordinate system

- Origin `(0, 0)` is **top-left**.
- Width: **135px**.
- Height: **240px**.
- Color is either a named string from the palette below or a
  `#rrggbb` hex literal.

Browser viewer renders at 2× CSS scale (270×480 displayed) with
`image-rendering: pixelated`; M5 renders 1:1 on its 135×240 ST7789
LCD.

## Color palette

| Name | Approx hex | Notes |
|---|---|---|
| `black` | `#000` | |
| `white` | `#fff` | |
| `red` | `#f00` | |
| `green` | `#0f4` | M5 uses pure RGB565 GREEN |
| `blue` | `#08f` | |
| `cyan` | `#0ff` | |
| `magenta` | `#f0f` | |
| `yellow` | `#ff0` | |
| `orange` | `#ff8c00` | desk's identity color |
| `gray` | `#787878` | |
| `dim` | `#3c3c3c` | |
| `#rrggbb` | (any) | passes through to both surfaces |

Custom hex colors are clamped to the device's RGB565 representation
on the M5; on browser they're exact.

## Ops

Each op is a JSON array. The first element is the op tag; the rest
are positional arguments.

### `["clr", color?]`

Fill the entire screen with `color` (default `"black"`).

### `["bnr", text, color?]`

Top-bar banner. Paints a `135×20` rect at `y=0` filled with `color`
(default `"orange"`), then centers `text` in `black` over it.

### `["txt", x, y, text, color?, big?]`

Draw `text` at `(x, y)` in `color` (default `"white"`).

If `big` is truthy, render at 2× scale (16px wide × 32px tall per
glyph instead of 8×16). Useful for headline numbers (counter value,
timer).

Glyph set: ASCII `0x20`–`0x7f`. Non-ASCII characters are silently
skipped on the M5 and rendered as missing on the browser.

### `["rect", x, y, w, h, color]`

Stroked (outline only) 1px rectangle.

### `["fill", x, y, w, h, color]`

Filled rectangle.

### `["bmp", x, y, w, h, color, hex]`

1-bit packed bitmap. `hex` is a hex-encoded string of `(w * h + 7) / 8`
bytes per row. Set bits draw `color`; cleared bits are transparent
(don't paint over what's underneath).

Use this for fixed-color icons. The DESK logo on the dock chrome is
drawn this way.

### `["spr", x, y, scale, rows, palette]`

Colored pixel-art sprite.

| Arg | Type | What |
|---|---|---|
| `x`, `y` | number | top-left position |
| `scale` | number 1..12 | each cell of `rows` becomes `scale × scale` pixels |
| `rows` | array of strings | one string per pixel row of the sprite |
| `palette` | object `{ char: color }` | maps `rows` characters to colors |

Characters in `rows` not present in `palette`, plus space, `.`, and
`0`, render as transparent.

The pet app's device creature is rendered this way.

### `["led", state, count?]`

Hardware LED control. Accepted `state` values:

- `"on"` / `"off"` — set LED state
- `"blink"` — blink `count` times (default `3`) at ~80ms cadence

The browser viewer ignores `led` ops.

### `["buz", freq_hz, ms]`

Single tone. `freq_hz` controls pitch; `ms` is duration. Volume is
controlled centrally by the device's volume setting (see
[How-to: control volume](../how-to/connect-an-agent.md#changing-volume)).

Browser viewer plays via Web Audio square-wave OscillatorNode.

### `["seq", notes, gap_ms?]`

Note sequence. `notes` is `[[freq, ms], [freq, ms, duty?], ...]`.

A `freq` of `0` is a rest. The optional `duty` (0..1023) is a per-note
volume hint that's clamped to the device's max for the current volume
level.

`gap_ms` (default `10`) inserts a short silence between notes to
keep them separable.

The whole sequence executes synchronously on the device — input is
not processed until the sequence completes. Plan song lengths
accordingly (the longest tune in the `tunes` app is ~5s).

## Op execution model

The renderer walks `ops` top-down and dispatches each op. A bad op
(unknown tag, malformed args) is logged and skipped — the frame
continues. There is no transactional rollback if an op midway through
the frame fails.

Audio ops (`buz`, `seq`) on the **browser** are dispatched in a
second pass that runs async, so they don't block the next frame's
render. On the **M5**, `seq` blocks until the song finishes (this is
the simplest correct implementation given MicroPython's PWM driver).

## See also

- [How to write an app](../how-to/write-an-app.md) — emit your first frame
- [Architecture](../explanation/architecture.md) — why frames look this way
- [Manifest schema](manifest-schema.md) — declare what your app does
