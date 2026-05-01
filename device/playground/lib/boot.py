# boot.py — runs on every cold boot, before main.py.
# StickC Plus 1.1 essential housekeeping. DO NOT REMOVE.

from machine import Pin, I2C

# CRITICAL: latch AXP192 power-hold so the rails stay up.
Pin(4, Pin.OUT, value=1)

# Configure the AXP192 PMIC. These registers are volatile — they reset
# on cold boot, so we re-apply them every time. Without this, the
# device will appear to be unable to power on from the side button
# when running on battery, because:
#   - 0x30 default has VBUS-IPSOUT path OFF (bit 7) → USB isn't usable
#   - 0x12 default leaves DCDC3 / LDO3 OFF → some rails undervolted
#   - 0x32 default trips off on transient undervoltage → side button
#     press cuts power before MicroPython can latch GPIO 4
#
# Values matched to M5Stack's stock firmware for Plus 1.1.
try:
    _i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
    _AXP = 0x34
    # VBUS-IPSOUT path: enabled, Vhold=4.0V, no current limit
    _i2c.writeto_mem(_AXP, 0x30, b'\xe0')
    # Rail enable: DCDC1 + DCDC3 + LDO2 + LDO3 + EXTEN
    _i2c.writeto_mem(_AXP, 0x12, b'\x4d')
    # Shutdown control: keep battery monitor on, disable shutdown-on-
    # transient-undervoltage so brief dips don't cut power.
    _i2c.writeto_mem(_AXP, 0x32, b'\x44')
    # ADC enables (for battery voltage / current readings)
    _i2c.writeto_mem(_AXP, 0x82, b'\xff')
    # LCD backlight rail (LDO2) target voltage: 3.0V
    _i2c.writeto_mem(_AXP, 0x28, b'\xcc')  # LDO2=3.0V, LDO3=3.0V
except Exception as _e:
    # Don't let PMIC config failures brick boot — at worst we fall back
    # to the previous (buggy) behavior, which is still better than no boot.
    print('[boot] PMIC config failed:', _e)

# LCD backlight on so the device shows life on cold boot
Pin(27, Pin.OUT, value=1)
# LED off (inverted: 1 = off)
Pin(10, Pin.OUT, value=1)

print('[boot] PMIC configured, power-hold latched')
