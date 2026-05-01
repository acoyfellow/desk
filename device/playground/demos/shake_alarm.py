# shake_alarm.py — shake the device, get a buzz + LED flash.
# Runs 10 seconds. Press Ctrl-C to abort early.
from stick import imu, led, buz, sleep_ms, ticks_ms, ticks_diff

THRESH = 2.2  # g; gravity baseline ~1.0
print("shake me for 10s (threshold {:.1f}g)".format(THRESH))

start = ticks_ms()
shakes = 0
while ticks_diff(ticks_ms(), start) < 10_000:
    if imu.magnitude() > THRESH:
        shakes += 1
        print("shake #{}".format(shakes))
        led.on(); buz.tone(1500, 200); led.off()
        sleep_ms(300)  # debounce
    sleep_ms(20)

print("total shakes:", shakes)
