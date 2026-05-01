# main_idle.py — the "boring usable state" main loop.
#
# This becomes :main.py on the device. Forever-runs, eats no real CPU
# at idle, does ONE thing: press A → run an animation, press B → cycle
# to the next animation kind. After any animation finishes (or you
# press a button during one), returns to the home screen.
#
# Goal: a clickable toy you can play with on your desk while we work
# on the desk platform. NOT the desk runtime; that's coming later.

from stick import (screen, btn_a, btn_b, led, buz, imu,
                   BLACK, WHITE, RED, GREEN, BLUE, CYAN, MAGENTA, YELLOW,
                   ORANGE, GRAY, DIM, rgb,
                   sleep_ms, ticks_ms, ticks_diff)
import math

W, H = 135, 240


def wait_release():
    """Block until both buttons are up, so a long press doesn't trigger 2 things."""
    while btn_a.pressed() or btn_b.pressed():
        sleep_ms(10)


def home(idx, names):
    """Idle screen — title + hint of which animation A would launch."""
    screen.clear()
    screen.banner("DESK :: IDLE", ORANGE)
    screen.center("press A to play", 70, GRAY)
    screen.center("press B for next", 90, GRAY)
    screen.center("---", 130, DIM)
    screen.center(names[idx], 150, CYAN, big=False)
    # tiny progress dots
    for i, _ in enumerate(names):
        c = ORANGE if i == idx else DIM
        screen.fill_rect(W // 2 - len(names) * 4 + i * 8, 175, 5, 5, c)
    screen.text("A: play", 4, 205, DIM)
    screen.text("B: next", 4, 222, DIM)


# ──────────────── animations ────────────────

def anim_starfield():
    """White-ish stars streaking outward."""
    screen.clear()
    cx, cy = W // 2, H // 2
    # pre-seed
    stars = []
    for i in range(36):
        a = (i * 47) % 360 * math.pi / 180
        r = (i * 7) % 60 + 5
        stars.append([a, r])
    end = ticks_ms() + 4000
    while ticks_diff(end, ticks_ms()) > 0:
        if btn_a.pressed() or btn_b.pressed():
            return
        for s in stars:
            # erase old
            x = int(cx + s[1] * math.cos(s[0]))
            y = int(cy + s[1] * math.sin(s[0]))
            if 0 <= x < W and 0 <= y < H:
                screen.pixel(x, y, BLACK)
            s[1] += 5
            if s[1] > 140:
                s[1] = 4
            # draw new
            x = int(cx + s[1] * math.cos(s[0]))
            y = int(cy + s[1] * math.sin(s[0]))
            if 0 <= x < W and 0 <= y < H:
                shade = min(255, 80 + s[1] * 2)
                screen.pixel(x, y, rgb(shade, shade, shade))
        sleep_ms(20)


def anim_bouncing_ball():
    """Ball with IMU tilt-as-gravity. Hold the device sideways!"""
    screen.clear()
    screen.banner("TILT ME", CYAN)
    x, y = W / 2, H / 2
    vx, vy = 0.0, 0.0
    end = ticks_ms() + 6000
    last_x, last_y = int(x), int(y)
    while ticks_diff(end, ticks_ms()) > 0:
        if btn_a.pressed() or btn_b.pressed():
            return
        ax, ay, _ = imu.accel()
        vx += -ay * 0.55
        vy += ax * 0.55
        vx *= 0.97
        vy *= 0.97
        x += vx
        y += vy
        # bounce
        bounced = False
        if x < 6:        x = 6;       vx = -vx * 0.7; bounced = True
        if x > W - 6:    x = W - 6;   vx = -vx * 0.7; bounced = True
        if y < 26:       y = 26;      vy = -vy * 0.7; bounced = True
        if y > H - 6:    y = H - 6;   vy = -vy * 0.7; bounced = True
        if bounced:
            buz.tone(2200, 12)
        ix, iy = int(x), int(y)
        # erase old, draw new
        screen.fill_rect(last_x - 5, last_y - 5, 11, 11, BLACK)
        screen.fill_rect(ix - 5, iy - 5, 11, 11, GREEN)
        last_x, last_y = ix, iy
        sleep_ms(25)


def anim_color_wave():
    """Vertical RGB wave sweeping the screen."""
    screen.clear()
    screen.banner("COLORS", MAGENTA)
    end = ticks_ms() + 5000
    t = 0
    while ticks_diff(end, ticks_ms()) > 0:
        if btn_a.pressed() or btn_b.pressed():
            return
        for x in range(0, W, 3):
            phase = (t + x * 8) % 360
            r = int(127 + 127 * math.sin(phase * math.pi / 180))
            g = int(127 + 127 * math.sin((phase + 120) * math.pi / 180))
            b = int(127 + 127 * math.sin((phase + 240) * math.pi / 180))
            screen.fill_rect(x, 25, 3, H - 25, rgb(r, g, b))
        t += 18
        sleep_ms(40)


def anim_shake_meter():
    """Shake the device, watch the bar fill. Plays a tone at peaks."""
    screen.clear()
    screen.banner("SHAKE!", RED)
    screen.text("magnitude", 4, 30, GRAY)
    end = ticks_ms() + 6000
    peak = 0.0
    last_h = 0
    while ticks_diff(end, ticks_ms()) > 0:
        if btn_a.pressed() or btn_b.pressed():
            return
        m = imu.magnitude()
        peak = max(peak * 0.92, m)
        # capped at 4g, bar is 180 px tall
        h = min(int(peak * 45), 180)
        # only redraw the changed area
        if h != last_h:
            # background
            screen.fill_rect(40, 60, 55, 180, BLACK)
            # bar
            color = GREEN if peak < 1.5 else (YELLOW if peak < 2.5 else RED)
            screen.fill_rect(40, 60 + (180 - h), 55, h, color)
            screen.rect(40, 60, 55, 180, GRAY)
            last_h = h
        if m > 2.0:
            buz.tone(1200 + int(m * 100), 20)
            led.on()
        else:
            led.off()
        sleep_ms(40)
    led.off()


def anim_breathing_led():
    """Just a calming breathing LED + matching screen pulse. Quiet, no buzzer."""
    screen.clear()
    screen.banner("BREATHE", BLUE)
    screen.center("inhale...", 100, GRAY)
    end = ticks_ms() + 8000
    t = 0
    while ticks_diff(end, ticks_ms()) > 0:
        if btn_a.pressed() or btn_b.pressed():
            return
        # full breath cycle ~4s
        v = (math.sin(t * math.pi / 40) + 1) / 2  # 0..1
        # LED inverted: 0 = on. We want LED bright at peak.
        # Skip rapid LED PWM (vanilla MP can't do it cleanly), pulse the bg color.
        c = rgb(int(20 * v), int(40 * v), int(80 + 100 * v))
        screen.fill_rect(0, 25, W, H - 25, c)
        # crossfade text
        if v > 0.7:
            screen.center("inhale...", 100, WHITE)
        elif v < 0.3:
            screen.center("exhale...", 100, WHITE)
        t += 1
        sleep_ms(80)


# ──────────────── main loop ────────────────

ANIMS = [
    ("starfield",     anim_starfield),
    ("bouncing ball", anim_bouncing_ball),
    ("color wave",    anim_color_wave),
    ("shake meter",   anim_shake_meter),
    ("breathing",     anim_breathing_led),
]

idx = 0
home(idx, [n for n, _ in ANIMS])

while True:
    if btn_a.pressed():
        wait_release()
        buz.tone(2400, 40)
        ANIMS[idx][1]()       # run the animation
        wait_release()
        home(idx, [n for n, _ in ANIMS])
    elif btn_b.pressed():
        wait_release()
        buz.tone(1500, 40)
        idx = (idx + 1) % len(ANIMS)
        home(idx, [n for n, _ in ANIMS])
    sleep_ms(20)
