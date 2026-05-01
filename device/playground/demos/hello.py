# hello.py — sanity check. Blink LED 3x, single beep.
from stick import led, buz, boot_chirp
print("hello from the stick")
boot_chirp()
led.blink(3, 100)
buz.beep(1, freq=2400, ms=150)
print("ok")
