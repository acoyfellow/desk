# How to flash the M5StickC Plus 1.1

This solves the problem of getting an M5StickC Plus 1.1 from
"out of the box" to "running desk firmware that talks to your
fabric."

> Hardware:
> [M5StickC Plus 1.1](https://shop.m5stack.com/products/m5stickc-plus-esp32-pico-mini-iot-development-kit)
> (~$30 from M5Stack). The Plus 2 has an ESP32-PICO-V3-02 and
> different pinout — desk targets the Plus **1.1**.

## Prerequisites

- An assembled, charged M5StickC Plus 1.1 with a USB-C cable
- The fabric Worker deployed (see
  [deploy-the-fabric.md](deploy-the-fabric.md))
- Python 3.9+ on your laptop
- `mpremote` installed: `pip install --user mpremote` (then ensure
  `~/Library/Python/3.9/bin` is on your `PATH`)

## 1. Flash vanilla MicroPython 1.22.2

> **Important:** desk uses MicroPython **1.22.2**. Versions 1.24.x
> have a regression in WiFi association timing on the
> ESP32-PICO-D4 build that breaks desk's boot sequence. See
> `.context/runs/2026-04-27-m5-stable-on-edge.md` for the
> investigation.

Download the firmware from the
[MicroPython downloads page](https://micropython.org/download/ESP32_GENERIC/)
— pick `v1.22.2.bin` for the **ESP32_GENERIC** board.

Erase and flash:

```bash
PORT="/dev/cu.usbserial-XXXXXXXXXX"   # ls /dev/cu.usbserial-* to find yours

# Erase first
esptool.py --chip esp32 --port $PORT erase_flash

# Flash
esptool.py --chip esp32 --port $PORT --baud 460800 \
  write_flash -z 0x1000 ESP32_GENERIC-20240222-v1.22.2.bin
```

If you don't have `esptool.py`: `pip install --user esptool`.

## 2. Identify your serial port

After flashing, plug in the M5 and:

```bash
ls /dev/cu.usbserial-*    # macOS
ls /dev/ttyUSB*           # Linux
```

Note the port. Set it as `PORT` for the rest of this guide.

## 3. Configure WiFi + token (`secrets.py`)

Create a local file (don't commit it):

```python
# secrets.py — local only
WIFI_SSID = "your-ssid"
WIFI_PASS = "your-pass"

# Optional fallbacks; up to WIFI_SSID_5
# WIFI_SSID_2 = "..."
# WIFI_PASS_2 = "..."

FABRIC_BASE = "https://<your-fabric>.workers.dev"
DEVICE_TOKEN = "<paste your DESK_DEVICE_TOKEN here>"
```

## 4. Push the runtime files to the device

```bash
cd /path/to/desk

mpremote connect $PORT cp secrets.py :secrets.py
mpremote connect $PORT cp device/playground/lib/stick.py :stick.py
mpremote connect $PORT cp device/playground/lib/st7789py.py :st7789py.py
mpremote connect $PORT cp device/playground/lib/vga1_8x16.py :vga1_8x16.py
mpremote connect $PORT cp device/playground/lib/boot.py :boot.py
mpremote connect $PORT cp device/desk-rt.py :main.py
```

Six files. Wait for each to finish before the next.

## 5. Reboot

```bash
mpremote connect $PORT soft-reset
```

Or unplug + replug. The screen should:

1. Show diagnostic prints over UART (cyan-on-black "phase 1: PMIC + WiFi")
2. Connect to your WiFi (1–10s)
3. Resolve DNS for your fabric host
4. Display the orange `DESK` banner with your dock apps below

If the dock shows up, you're done.

## 6. Verify end-to-end

On your laptop:

```bash
# This should make the M5 take over its screen and show a question
DESK_MCP_URL=https://<your-fabric>.workers.dev/mcp \
DESK_DEVICE_TOKEN=$(cat ~/.config/desk/device-token | tr -d '[:space:]') \
bun demos/agent-elicit.ts
```

The device should chirp, display "should I keep going?", and
wait for you to press A. The script returns the answer.

## Troubleshooting

### Boot loops / repeated red LED blink

The new `:main.py` is crashing during startup. Connect
serial:

```bash
mpremote connect $PORT
```

The crash traceback prints over UART. Common causes:

- `secrets.py` missing or malformed
- WiFi credentials wrong
- `FABRIC_BASE` not reachable (typo, deleted Worker, etc.)
- `stick.py` not on the device (one of the file copies was skipped)

### Stuck on "RESCUE — fabric down"

The device booted, connected to WiFi, but can't reach
`FABRIC_BASE`. Press `B` on the device for the local status
screen — it'll show your IP and the fabric host being
attempted.

Hold `B` for 2.5s to reboot.

### Volume settings

By default the buzzer ships **loud** (level 2). To change:

- Hardware: hold-B on the local STATUS screen (rescue mode) cycles 0→1→2→0
- Remote: an MCP agent can call `desk.set_volume(0|1|2)` (see [MCP tools](../reference/mcp-tools.md))

The setting persists at `:desk_volume` on flash.

### USB-serial driver missing on macOS

If `/dev/cu.usbserial-*` doesn't appear, install the
[CH9102 driver](https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/drivers/CH9102_Driver_v1.7_x64_macOS.zip)
(M5 ships with this chip on Plus 1.1) and reboot.

### Device powers off when on battery

The PMIC needs a power-hold register written at boot. This is
the first thing `boot.py` does. If you skipped copying
`boot.py`, the device will drop power within seconds when
unplugged.

## Re-flashing

For runtime updates, only `desk-rt.py` (as `:main.py`) usually
changes:

```bash
mpremote connect $PORT cp device/desk-rt.py :main.py
mpremote connect $PORT soft-reset
```

`stick.py` updates require copying it too. `boot.py` should
rarely change — if it does, flash carefully (a bad `boot.py`
bricks the device until you re-flash MicroPython entirely).

A fully-remote OTA path is proposed in
[exp-19](../../experiments/exp-19-can-firmware-be-OTA-from-artifacts/QUESTION.md)
but not yet shipped.

## See also

- [How to deploy the fabric](deploy-the-fabric.md)
- [How to write an app](write-an-app.md)
- [Environment variables](../reference/env-vars.md)
