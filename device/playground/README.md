# Playground

A scratch space for poking the StickC. The shared `lib/stick.py` lives on
the device; demos in `demos/` import from it so we stop re-typing the same
20 lines of init.

## Workflow

```bash
./run.sh sync                  # upload lib/stick.py to device (first time + after edits)
./run.sh demos/hello.py        # run a demo
./run.sh repl                  # drop into REPL
./run.sh ls                    # list device files
./run.sh exec 'print(2+2)'     # one-shot
./run.sh wipe                  # remove uploaded files
```

## Available primitives (`from stick import ...`)

| Name | What |
|---|---|
| `led` | `.on() .off() .toggle() .blink(n, ms)` — handles GPIO 10 inversion |
| `btn_a` | `.pressed() .wait(timeout_ms)` — GPIO 37 active-low |
| `buz` | `.tone(f,ms) .beep(n) .buzz() .sweep() .play(notes)` — passive piezo |
| `imu` | `.accel() .gyro() .magnitude()` — MPU6886 over I2C |
| `i2c` | shared I2C(0) bus, SDA=21 SCL=22 |
| `NOTES` | dict of musical note → Hz, plus `'REST': 0` |
| `boot_chirp()` | quick alive-indicator |
| `sleep_ms / ticks_ms / ticks_diff` | re-exported from time |

## Demos

| File | What |
|---|---|
| `hello.py` | LED blink + beep — smoke test |
| `imu_dump.py` | Print accel values for 3s |
| `shake_alarm.py` | Shake → buzz + flash, counts shakes for 10s |
| `button_morse.py` | Press Button A: short=beep, long=buzz |
| `song_zelda.py` | Plays a Zelda jingle |

Add new demos by dropping a `.py` into `demos/`. They get `lib/stick.py`
auto-uploaded by `run.sh` before execution.
