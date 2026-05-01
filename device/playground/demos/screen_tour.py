# screen_tour.py — A 6-scene tour of what the LCD can do.
# Press Button A to skip to the next scene, or wait it out.
from stick import (screen, tft, btn_a, led, buz, imu, splash,
                   BLACK, WHITE, RED, GREEN, BLUE, CYAN, MAGENTA, YELLOW,
                   ORANGE, GRAY, DIM, rgb,
                   sleep_ms, ticks_ms, ticks_diff)

def wait_or_skip(ms):
    end = ticks_ms() + ms
    while ticks_diff(end, ticks_ms()) > 0:
        if btn_a.pressed():
            while btn_a.pressed(): sleep_ms(10)
            return
        sleep_ms(20)

# ─────────── Scene 1: title card
screen.clear()
screen.banner('AGENT TETHER', ORANGE)
screen.center('hardware', 60, WHITE, big=True)
screen.center('in the', 100, WHITE, big=True)
screen.center('machine', 140, ORANGE, big=True)
screen.center('press A to skip', 220, GRAY)
buz.beep(1, freq=2400, ms=80)
wait_or_skip(2500)

# ─────────── Scene 2: color swatches
screen.clear()
screen.banner('COLORS', CYAN)
colors = [('RED',RED),('ORANGE',ORANGE),('YELLOW',YELLOW),
          ('GREEN',GREEN),('CYAN',CYAN),('BLUE',BLUE),('MAGENTA',MAGENTA)]
y = 28
for name, c in colors:
    screen.fill_rect(4, y, 30, 22, c)
    screen.text(name, 42, y+4, c)
    y += 26
wait_or_skip(2500)

# ─────────── Scene 3: live IMU bars (bubble level vibe)
screen.clear()
screen.banner('IMU LIVE', GREEN)
end = ticks_ms() + 4000
while ticks_diff(end, ticks_ms()) > 0:
    if btn_a.pressed():
        while btn_a.pressed(): sleep_ms(10); break
    ax, ay, az = imu.accel()
    # Map -1g..+1g to 0..130 px wide bar
    def bar(label, val, y):
        screen.text(label, 4, y, WHITE)
        screen.fill_rect(30, y, 100, 14, BLACK)  # clear track
        screen.rect(30, y, 100, 14, DIM)
        # center mark
        screen.vline(80, y, 14, GRAY)
        # value
        v = max(-1.0, min(1.0, val))
        w = int(abs(v) * 50)
        if v >= 0:
            screen.fill_rect(80, y+1, w, 12, GREEN)
        else:
            screen.fill_rect(80-w, y+1, w, 12, RED)
    bar('X', ax, 40)
    bar('Y', ay, 64)
    bar('Z', az-1.0, 88)  # subtract gravity
    mag = (ax*ax+ay*ay+az*az)**0.5
    screen.fill_rect(0, 120, 135, 20, BLACK)
    screen.center('|a| = {:.2f} g'.format(mag), 122, ORANGE)
    sleep_ms(60)

# ─────────── Scene 4: progress bar animation
screen.clear()
screen.banner('LIQUID FETCH', MAGENTA)
screen.center('downloading task', 40, GRAY)
screen.rect(10, 80, 115, 24, WHITE)
for pct in range(0, 101, 4):
    w = int(pct * 111 / 100)
    screen.fill_rect(12, 82, w, 20, MAGENTA)
    screen.fill_rect(45, 120, 60, 20, BLACK)
    screen.center('{:>3}%'.format(pct), 122, WHITE, big=True)
    if pct % 20 == 0: buz.tone(2000+pct*8, 20)
    sleep_ms(40)
screen.center('OK', 170, GREEN, big=True)
buz.beep(2, freq=2800, ms=60)
wait_or_skip(1500)

# ─────────── Scene 5: status room (the real target UI)
screen.clear()
screen.banner('AGENT TETHER', ORANGE)
screen.text('STATE:', 4, 30, GRAY)
screen.text('QUEUED', 4, 50, GREEN, big=True)
screen.text('TASK:', 4, 90, GRAY)
screen.text('summarize PR', 4, 110, CYAN)
screen.text('#4271', 4, 128, CYAN)
screen.text('HTTP: 202', 4, 170, YELLOW)
screen.text('rtt:  84ms', 4, 188, WHITE)
screen.text('age:  2s', 4, 206, WHITE)
screen.fill_rect(0, 230, 135, 10, BLACK)
screen.text('stick-01', 4, 226, GRAY)
led.blink(3, 80)
wait_or_skip(3000)

# ─────────── Scene 6: pixel doodle
screen.clear()
screen.banner('PIXELS', BLUE)
import math
cx, cy, R = 67, 130, 50
for i in range(0, 360, 4):
    a = i * 3.14159 / 180
    x = int(cx + R * math.cos(a))
    y = int(cy + R * math.sin(a))
    c = rgb(int(127+127*math.sin(a)), int(127+127*math.cos(a)), 200)
    screen.fill_rect(x-2, y-2, 4, 4, c)
    sleep_ms(8)
screen.center('fin.', 210, WHITE)
buz.beep(1, freq=1800, ms=200)
sleep_ms(1500)

# Leave a clean status screen
screen.clear()
screen.banner('AGENT TETHER', ORANGE)
screen.center('READY', 100, GREEN, big=True)
screen.center('A: action', 180, GRAY)
screen.center('B: menu', 200, GRAY)
print('tour done')
