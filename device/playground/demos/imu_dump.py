# imu_dump.py — print accelerometer values for 3 seconds.
# Move/tilt the device while running to see numbers shift.
from stick import imu, sleep_ms, ticks_ms, ticks_diff

start = ticks_ms()
while ticks_diff(ticks_ms(), start) < 3000:
    ax, ay, az = imu.accel()
    mag = imu.magnitude()
    print("ax={:+.2f}  ay={:+.2f}  az={:+.2f}   |a|={:.2f} g".format(ax, ay, az, mag))
    sleep_ms(150)
