# button_morse.py — hold Button A: LED tracks, buzzer pitches by hold duration.
# Short press = high beep, long press = low buzz. 12 seconds.
from stick import btn_a, led, buz, sleep_ms, ticks_ms, ticks_diff

print("press Button A — short=beep, long=buzz")
end = ticks_ms() + 12_000

while ticks_diff(end, ticks_ms()) > 0:
    if btn_a.pressed():
        led.on()
        t0 = ticks_ms()
        while btn_a.pressed():
            sleep_ms(10)
        held = ticks_diff(ticks_ms(), t0)
        led.off()
        if held < 250:
            buz.tone(2800, 80)
            print("dot ({}ms)".format(held))
        else:
            buz.tone(400, min(held, 800))
            print("dash ({}ms)".format(held))
    sleep_ms(15)

print("done")
