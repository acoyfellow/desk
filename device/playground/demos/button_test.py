# button_test.py — Live test of both buttons.
# A (front, big) → high beep + LED flash
# B (right side, top) → low buzz + LED flash
# Runs for 20 seconds. Press both, separately, together — anything goes.
from stick import btn_a, btn_b, led, buz, sleep_ms, ticks_ms, ticks_diff

print("== BUTTON TEST ==")
print("A = front (GPIO 37)  |  B = right side top (GPIO 39)")
print("Press them however you like. 20 seconds.")

end = ticks_ms() + 20_000
last_a, last_b = 1, 1
count_a = count_b = 0

while ticks_diff(end, ticks_ms()) > 0:
    a, b = (1 if not btn_a.pressed() else 0), (1 if not btn_b.pressed() else 0)

    if last_a == 1 and a == 0:
        count_a += 1
        led.on(); buz.tone(2800, 60); led.off()
        print("A #{}".format(count_a))
    if last_b == 1 and b == 0:
        count_b += 1
        led.on(); buz.tone(600, 80); led.off()
        print("B #{}".format(count_b))

    last_a, last_b = a, b
    sleep_ms(15)

print("totals — A: {}   B: {}".format(count_a, count_b))
