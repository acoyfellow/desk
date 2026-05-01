# song_zelda.py — Zelda secret/treasure jingle on the piezo.
from stick import buz, NOTES as N, led

melody = [
    (N['G4'], 180), (N['F4'], 180), (N['D4'], 180), (N['A3' if 'A3' in N else 'A4'], 180),
    (N['A4'], 180), (N['E4'], 180), (N['G4'], 180), (N['F4'], 180),
    (N['D5'], 360),
]

print("♪ playing")
led.on()
buz.play(melody)
led.off()
print("♪ done")
