# stick.py — M5StickC Plus 1.1 hardware boilerplate.
# Lives on the device. Demos do `from stick import *` and get clean primitives.
#
# Provides:
#   led            Pin(10) — call led.on() / led.off() (handles inversion)
#   btn_a          Pin(37) — pressed() returns True when held
#   buz            Buzzer object — buz.tone(freq, ms), buz.off(), buz.beep(n)
#   imu            MPU6886 — imu.accel() returns (ax, ay, az) in g
#   i2c            Shared I2C(0) bus
#   sleep_ms, ticks_ms, ticks_diff   re-exported from time

from machine import Pin, PWM, I2C, SPI
from time import sleep_ms, ticks_ms, ticks_diff
import st7789py as _st
import vga1_8x16 as font_sm    # 8x16 — fits 16 chars across
# Big font (vga2_bold_16x32) is heavy (~13KB). v1 ships without it; the
# screen.text(big=True) calls fall back to a 2x scaled small font drawn
# manually via fill_rect strokes. Saves ~30KB of resident heap during
# TLS handshake (which needs contiguous memory).
font_lg = None

# --- Power latch (Plus 1.1 quirk: side button can drop power without this) ---
_power_hold = Pin(4, Pin.OUT, value=1)


# --- LED on GPIO 10, inverted (0 = on) ---
class _LED:
    def __init__(self, pin=10):
        self._p = Pin(pin, Pin.OUT, value=1)
    def on(self):    self._p.value(0)
    def off(self):   self._p.value(1)
    def toggle(self): self._p.value(not self._p.value())
    def blink(self, n=3, ms=120):
        for _ in range(n):
            self.on();  sleep_ms(ms)
            self.off(); sleep_ms(ms)

led = _LED()


# --- Button A on GPIO 37, active low ---
class _Button:
    def __init__(self, pin=37):
        self._p = Pin(pin, Pin.IN, Pin.PULL_UP)
    def pressed(self):
        return self._p.value() == 0
    def wait(self, timeout_ms=None):
        """Block until pressed. Returns True, or False if timeout."""
        start = ticks_ms()
        while not self.pressed():
            if timeout_ms is not None and ticks_diff(ticks_ms(), start) > timeout_ms:
                return False
            sleep_ms(10)
        return True

btn_a = _Button(37)   # front, big M5 button
btn_b = _Button(39)   # right side, top


# --- Passive piezo buzzer on GPIO 2 (PWM: freq=pitch, duty=volume) ---
#
# Volume model:
#   0 = mute        (duty=0,    no PWM output at all — silent in office)
#   1 = quiet       (duty=128)
#   2 = loud        (duty=900,  ~max sane on this piezo)
#
# Persisted to /desk_volume on the device flash so it survives reboot.
# desk-rt.py and any app go through `buz.tone()` / `buz.seq()`; volume is
# applied *here*, centrally, instead of in a separate runtime shim. That way
# there's exactly one truthful place to set audio level and the
# render_local_status screen can report it honestly.

_VOL_PATH = "/desk_volume"
_VOL_DUTY = (0, 128, 900)  # mute, quiet, loud

def _read_volume():
    try:
        with open(_VOL_PATH, "r") as f:
            v = int(f.read().strip())
            if 0 <= v <= 2:
                return v
    except Exception:
        pass
    return 2  # default: loud (per Jordan, 2026-04-30)

def _write_volume(v):
    try:
        with open(_VOL_PATH, "w") as f:
            f.write(str(int(v)))
    except Exception as e:
        print("[buz] could not persist volume:", e)

class _Buzzer:
    def __init__(self, pin=2):
        self._p = PWM(Pin(pin), freq=2000, duty=0)
        self._vol = _read_volume()

    # ── volume API ──
    def get_volume(self):
        return self._vol

    def set_volume(self, v):
        v = max(0, min(2, int(v)))
        self._vol = v
        _write_volume(v)
        # If we just muted mid-tone, kill output now.
        if v == 0:
            self._p.duty(0)

    def _duty_for(self, override=None):
        # Caller can pass `duty` to scale within the volume budget; we
        # interpret that as a hint and clamp to the max for the current
        # volume level. duty=None or 0 → use the level default.
        max_duty = _VOL_DUTY[self._vol]
        if max_duty == 0:
            return 0
        if override is None:
            return max_duty
        try:
            d = int(override)
        except Exception:
            return max_duty
        # Treat override as a 0..1023 hint, scaled into the level's budget.
        if d <= 0:
            return 0
        return min(max_duty, max(1, d * max_duty // 1023))

    # ── primitives ──
    def tone(self, freq, ms=150, duty=None):
        d = self._duty_for(duty)
        if d == 0:
            sleep_ms(ms)  # still respect timing so callers' rhythms stay correct
            return
        self._p.freq(max(1, int(freq)))
        self._p.duty(d)
        sleep_ms(ms)
        self._p.duty(0)

    def off(self):
        self._p.duty(0)

    def beep(self, n=1, freq=2200, ms=80, gap=80):
        for i in range(n):
            self.tone(freq, ms)
            if i < n - 1:
                sleep_ms(gap)

    def buzz(self, ms=400, freq=180):
        """Low-frequency rattle — closest to haptic on Plus 1.1."""
        self.tone(freq, ms)

    def sweep(self, f0=200, f1=4000, step=50, dwell=4):
        d = self._duty_for(None)
        if d == 0:
            # Compute the same wall-clock the audible path would take.
            n = max(1, abs((f1 - f0) // step))
            sleep_ms(n * dwell)
            return
        self._p.duty(d)
        f = f0
        while (f < f1) if f1 > f0 else (f > f1):
            self._p.freq(f); sleep_ms(dwell)
            f += step if f1 > f0 else -step
        self._p.duty(0)

    def play(self, notes, gap_ms=15):
        """notes: iterable of (freq_hz, duration_ms). 0 freq = rest."""
        for f, ms in notes:
            if f <= 0:
                self._p.duty(0); sleep_ms(ms)
            else:
                self.tone(f, ms)
            if gap_ms:
                sleep_ms(gap_ms)

    def seq(self, notes, gap_ms=10, feed=None):
        """Like play() but accepts (freq, ms) OR (freq, ms, duty_hint).
           `feed` is an optional callable invoked between notes — pass the
           watchdog feeder so longer songs don't trip the WDT."""
        for note in notes:
            if feed is not None:
                try: feed()
                except Exception: pass
            f = note[0]; ms = note[1]
            duty = note[2] if len(note) >= 3 else None
            if f <= 0:
                self._p.duty(0); sleep_ms(ms)
            else:
                self.tone(f, ms, duty)
            if gap_ms:
                sleep_ms(gap_ms)

buz = _Buzzer()


# --- I2C bus + MPU6886 IMU ---
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)

class _MPU6886:
    ADDR = 0x68
    def __init__(self):
        i2c.writeto_mem(self.ADDR, 0x6B, b'\x00')   # wake
        i2c.writeto_mem(self.ADDR, 0x1C, b'\x10')   # accel ±8g
        i2c.writeto_mem(self.ADDR, 0x1B, b'\x18')   # gyro ±2000 dps
    @staticmethod
    def _s16(hi, lo):
        v = (hi << 8) | lo
        return v - 65536 if v & 0x8000 else v
    def accel(self):
        r = i2c.readfrom_mem(self.ADDR, 0x3B, 6)
        return (self._s16(r[0], r[1]) / 4096.0,
                self._s16(r[2], r[3]) / 4096.0,
                self._s16(r[4], r[5]) / 4096.0)
    def gyro(self):
        r = i2c.readfrom_mem(self.ADDR, 0x43, 6)
        return (self._s16(r[0], r[1]) / 16.4,
                self._s16(r[2], r[3]) / 16.4,
                self._s16(r[4], r[5]) / 16.4)
    def magnitude(self):
        ax, ay, az = self.accel()
        return (ax*ax + ay*ay + az*az) ** 0.5

imu = _MPU6886()


# --- 5x7 chunky bitmap font ---
# Ported from living-artifact's hand-rolled font (firmware/main/main.c).
# Each glyph is 7 rows of 5 bits packed into the low 5 bits of a byte.
# Coverage: SPACE - > . 0-9 A-Z. Use uppercase for everything else
# (lookup falls back to space for unknown chars).
#
# Designed to be drawn via fill_rect at integer scale. At scale=2 the
# glyph is 10x14 px; at scale=3 it's 15x21. Looks great in dock chrome
# and big numeric headlines, on-brand chunky aesthetic.
_FONT5X7 = {
    " ": (0,0,0,0,0,0,0),  "-": (0,0,0,31,0,0,0),
    ">": (16,8,4,2,4,8,16), ".": (0,0,0,0,0,12,12),
    "0": (14,17,19,21,25,17,14), "1": (4,12,4,4,4,4,14),
    "2": (14,17,1,2,4,8,31), "3": (30,1,1,14,1,1,30),
    "4": (2,6,10,18,31,2,2), "5": (31,16,30,1,1,17,14),
    "6": (6,8,16,30,17,17,14), "7": (31,1,2,4,8,8,8),
    "8": (14,17,17,14,17,17,14), "9": (14,17,17,15,1,2,12),
    "A": (14,17,17,31,17,17,17), "B": (30,17,17,30,17,17,30),
    "C": (14,17,16,16,16,17,14), "D": (30,17,17,17,17,17,30),
    "E": (31,16,16,30,16,16,31), "F": (31,16,16,30,16,16,16),
    "G": (14,17,16,23,17,17,15), "H": (17,17,17,31,17,17,17),
    "I": (14,4,4,4,4,4,14),     "J": (7,2,2,2,18,18,12),
    "K": (17,18,20,24,20,18,17), "L": (16,16,16,16,16,16,31),
    "M": (17,27,21,21,17,17,17), "N": (17,25,21,19,17,17,17),
    "O": (14,17,17,17,17,17,14), "P": (30,17,17,30,16,16,16),
    "Q": (14,17,17,17,21,18,13), "R": (30,17,17,30,20,18,17),
    "S": (15,16,16,14,1,1,30),   "T": (31,4,4,4,4,4,4),
    "U": (17,17,17,17,17,17,14), "V": (17,17,17,17,17,10,4),
    "W": (17,17,17,21,21,21,10), "X": (17,17,10,4,10,17,17),
    "Y": (17,17,10,4,4,4,4),     "Z": (31,1,2,4,8,16,31),
}
_FONT5X7_W = 5
_FONT5X7_H = 7
# advance = glyph width + 1 px gap. At scale=N, advance = (5+1)*N.
_FONT5X7_ADV_BASE = 6


# --- Display: ST7789 135x240 over SPI2 (Plus 1.1 wiring) ---
_spi = SPI(2, baudrate=20_000_000, polarity=0, phase=0,
           sck=Pin(13), mosi=Pin(15))
tft = _st.ST7789(_spi, 135, 240,
                 reset=Pin(18, Pin.OUT),
                 cs=Pin(5, Pin.OUT),
                 dc=Pin(23, Pin.OUT),
                 backlight=Pin(27, Pin.OUT),
                 rotation=0)

# Color shortcuts (RGB565)
BLACK   = _st.BLACK
WHITE   = _st.WHITE
RED     = _st.RED
GREEN   = _st.GREEN
BLUE    = _st.BLUE
CYAN    = _st.CYAN
MAGENTA = _st.MAGENTA
YELLOW  = _st.YELLOW
ORANGE  = _st.color565(255, 140, 0)
GRAY    = _st.color565(120, 120, 120)
DIM     = _st.color565(60, 60, 60)
rgb     = _st.color565   # rgb(r, g, b) -> 16-bit color


class _Screen:
    """Convenience wrappers over the raw st7789py driver."""
    W = 135
    H = 240

    def clear(self, color=BLACK):
        tft.fill(color)

    def text(self, s, x, y, fg=WHITE, bg=None, big=False):
        """Draw text; clips automatically to screen width.
           bg=None (default) = transparent — only set pixels are painted.
           Pass an explicit bg color for a solid background fill."""
        f = font_sm  # only one font in v1
        scale = 2 if big else 1
        char_w = f.WIDTH * scale
        max_chars = (self.W - x) // char_w
        s = s[:max_chars]
        if scale == 1 and bg is not None:
            # Fast path: solid bg, native driver call.
            tft.text(f, s, x, y, fg, bg)
        else:
            # Transparent bg, or 2x scale — manual per-pixel blit.
            self._scaled_text(f, s, x, y, scale, fg, bg)

    def _scaled_text(self, f, s, x, y, scale, fg, bg):
        # Per-pixel blit. If bg is not None, paint the cell bg too so the
        # caller still gets a solid block. If bg is None, only set pixels
        # are painted — letting whatever's underneath show through.
        for ci, ch in enumerate(s):
            code = ord(ch)
            if code < f.FIRST or code > f.LAST:
                continue
            glyph_offset = (code - f.FIRST) * f.HEIGHT * ((f.WIDTH + 7) // 8)
            for row in range(f.HEIGHT):
                row_byte = f.FONT[glyph_offset + row]
                for col in range(f.WIDTH):
                    gx = x + ci * f.WIDTH * scale + col * scale
                    gy = y + row * scale
                    if row_byte & (1 << (7 - col)):
                        tft.fill_rect(gx, gy, scale, scale, fg)
                    elif bg is not None:
                        tft.fill_rect(gx, gy, scale, scale, bg)

    def center(self, s, y, fg=WHITE, bg=None, big=False):
        scale = 2 if big else 1
        w = len(s) * font_sm.WIDTH * scale
        x = max(0, (self.W - w) // 2)
        self.text(s, x, y, fg, bg, big=big)

    def hline(self, x, y, w, c=WHITE): tft.hline(x, y, w, c)
    def vline(self, x, y, h, c=WHITE): tft.vline(x, y, h, c)
    def rect(self, x, y, w, h, c=WHITE): tft.rect(x, y, w, h, c)
    def fill_rect(self, x, y, w, h, c=WHITE): tft.fill_rect(x, y, w, h, c)
    def pixel(self, x, y, c=WHITE): tft.pixel(x, y, c)

    def banner(self, title, color=ORANGE):
        """Top status bar — handy chrome for demos."""
        tft.fill_rect(0, 0, self.W, 20, color)
        self.center(title, 2, BLACK, color)

    # --- 5x7 chunky font ---
    def text5x7(self, s, x, y, fg=WHITE, scale=2):
        """Draw an UPPERCASE-only 5x7 bitmap string at integer scale.
           Unknown chars fall back to space. No anti-aliasing; pure rects."""
        if scale < 1: scale = 1
        s = s.upper()
        adv = _FONT5X7_ADV_BASE * scale
        for ch in s:
            rows = _FONT5X7.get(ch, _FONT5X7[" "])
            for ry, row in enumerate(rows):
                if not row: continue
                for cx in range(_FONT5X7_W):
                    if row & (1 << (_FONT5X7_W - 1 - cx)):
                        tft.fill_rect(x + cx*scale, y + ry*scale, scale, scale, fg)
            x += adv
            if x >= self.W: break

    def center5x7(self, s, y, fg=WHITE, scale=2):
        adv = _FONT5X7_ADV_BASE * scale
        # the last char doesn't need its trailing 1px gap
        w = max(0, len(s) * adv - scale)
        x = max(0, (self.W - w) // 2)
        self.text5x7(s, x, y, fg, scale)

screen = _Screen()


# --- Note frequencies for buzzer melodies ---
NOTES = {
    'C4': 262, 'D4': 294, 'E4': 330, 'F4': 349, 'G4': 392, 'A4': 440, 'B4': 494,
    'C5': 523, 'D5': 587, 'E5': 659, 'F5': 698, 'G5': 784, 'A5': 880, 'B5': 988,
    'C6': 1047, 'D6': 1175, 'E6': 1319, 'F6': 1397, 'G6': 1568, 'A6': 1760,
    'REST': 0,
}


def boot_chirp():
    """Quick 'I'm alive' indicator. Call at the top of demos."""
    led.blink(2, 60)
    buz.beep(1, freq=3000, ms=40)


def splash(title, subtitle=''):
    """Standard demo splash: clear, banner, subtitle."""
    screen.clear()
    screen.banner(title)
    if subtitle:
        screen.center(subtitle, 30, GRAY)
