# desk/device

Hardware code for desk's first client: the M5StickC Plus 1.1.

## What lives here

- **`desk-rt.py`** — the protocol-speaking device runtime. Polls `/list`
  and `/run` on the fabric Worker, renders frames, forwards button +
  IMU events. This is what gets flashed to the device as `:main.py`.
- **`playground/`** — hardware demos and primitives. Useful when
  developing or debugging the M5 itself, or onboarding a new device.
- **`playground/lib/`** — shared MicroPython modules that live on the
  device: `boot.py` (PMIC config + power-hold), `stick.py` (LED, buttons,
  buzzer, IMU, screen primitives), `st7789py.py` (display driver), and
  the bitmap font.
- **`playground/demos/`** — bite-sized demo scripts. `./run.sh demos/X.py`
  uploads `lib/stick.py` automatically and runs the demo on-device.

## Quick reference

```bash
cd device/playground
./run.sh sync                  # upload lib/stick.py to device
./run.sh demos/hello.py        # run a demo
./run.sh repl                  # drop into REPL
./run.sh ls                    # list device files
```

## Hardware specs (M5StickC Plus 1.1)

| | |
|---|---|
| MCU | ESP32-PICO-D4 |
| Firmware | MicroPython **1.22.2** (vanilla, NOT 1.24.1 — see runs/2026-04-27-m5-stable-on-edge.md for the connectivity regression) |
| LED | GPIO 10 (inverted: 0 = on) |
| Buttons | A = GPIO 37 (front, big), B = GPIO 39 (right side, top) |
| Buzzer | GPIO 2, passive piezo (PWM: freq = pitch, duty = volume) |
| IMU | MPU6886 @ I2C 0x68 |
| Display | ST7789 135×240, backlight = GPIO 27, offset (52, 40) |
| PMIC | AXP192 @ I2C 0x34 — `boot.py` writes config registers (without this, the device drops power on a side-button press while on battery) |

## Volume model

The buzzer has three persisted levels stored at `:desk_volume` on device
flash:

- `0` = mute (no PWM output)
- `1` = quiet (duty ≈ 128)
- `2` = loud (duty ≈ 900)

Volume can be changed three ways:

1. The `desk.set_volume(level)` MCP tool (writes to fabric DO; device
   syncs on its next dock-refresh poll, ~10s).
2. Hold-B on the local STATUS screen (rescue mode) — cycles 0 → 1 → 2 → 0.
3. Direct flash: `mpremote ... fs cp <(echo 1) :desk_volume`.

## Why `desk-rt.py` lives separately from `playground/`

- **`device/playground/`** = hand-rolled demos and hardware primitives,
  imported by both `desk-rt.py` and standalone demos.
- **`device/desk-rt.py`** = the protocol-speaking runtime that ships
  on every desk M5. Stays focused on dock + frame rendering + safe boot.

