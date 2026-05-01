# desk-rt.py — minimal device runtime for desk.
#
# Boot order (matters!):
#   1. PMIC power-hold via raw Pin (no stick.py yet)
#   2. WiFi up + DNS settle (only `network` + `socket` imported)
#   3. THEN heavy imports (stick = ST7789 + fonts + IMU)
#   4. Render dock + main loop
#
# Why: stick.py runs I2C writes during import (MPU6886, AXP192). I2C
# bus activity at the moment WiFi associates seems to upset the radio
# timing on this ESP32-PICO build, causing connect to spin forever.

import gc, time
gc.collect()

# Diagnostic prints land on UART so we can debug from `mpremote`.
print("[desk-rt] phase 1: PMIC + WiFi (no stick.py yet)")

from machine import Pin
Pin(4, Pin.OUT, value=1)  # AXP192 power-hold
_led = Pin(10, Pin.OUT, value=0)  # ON during boot
_WDT = None
try:
    from machine import WDT
    _WDT = WDT(timeout=30000)
    print("[desk-rt] watchdog armed: 30s")
except Exception as e:
    print("[desk-rt] watchdog unavailable:", e)

def feed_wdt():
    try:
        if _WDT: _WDT.feed()
    except Exception:
        pass
try:
    import socket
    socket.setdefaulttimeout(8)
except Exception:
    pass

import secrets as _secrets
_NETWORKS = []
for n in range(1, 6):
    suf = "" if n == 1 else "_" + str(n)
    s = getattr(_secrets, "WIFI_SSID" + suf, None)
    p = getattr(_secrets, "WIFI_PASS" + suf, None)
    if s and p: _NETWORKS.append((s, p))
FABRIC_BASE = getattr(_secrets, "FABRIC_BASE", "http://10.0.0.240:8913")
DEVICE_TOKEN = getattr(_secrets, "DEVICE_TOKEN", "")
WIFI_SSID = _NETWORKS[0][0] if _NETWORKS else "REPLACE_ME"
WIFI_PASS = _NETWORKS[0][1] if _NETWORKS else "REPLACE_ME"

print("[desk-rt] importing network...")
import network
wlan = network.WLAN(network.STA_IF)
wlan.active(True)

_ip = None
_connected_ssid = None

def connect_wifi():
    global _ip, _connected_ssid
    _ip = None
    _connected_ssid = None
    try:
        if not wlan.active(): wlan.active(True)
    except Exception: pass
    for net_idx, (_ssid, _pass) in enumerate(_NETWORKS):
        print("[desk-rt] [" + str(net_idx+1) + "/" + str(len(_NETWORKS)) + "] try " + repr(_ssid))
        try: wlan.disconnect()
        except Exception: pass
        time.sleep_ms(200)
        try: wlan.connect(_ssid, _pass)
        except Exception as e:
            print("[desk-rt]   connect threw:", e); continue
        waits = 20 if net_idx == 0 else 14
        for i in range(waits):
            feed_wdt()
            if wlan.isconnected():
                _ip = wlan.ifconfig()[0]; _connected_ssid = _ssid; break
            time.sleep_ms(500); _led.value(i % 2)
        if _ip: break
        print("[desk-rt]   timeout, status=", wlan.status())
    if _ip:
        print("[desk-rt] associated to", repr(_connected_ssid), "ip:", _ip)
    else:
        print("[desk-rt] all networks failed")
    return _ip is not None

connect_wifi()

# DNS settle (lwIP needs a beat). Resolve THE EXACT host we'll be hitting,
# not a generic one — lwIP's cache may not survive between phases.
import socket
_dns_ok = False
_fabric_host = FABRIC_BASE.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0]

def resolve_fabric():
    global _dns_ok
    _dns_ok = False
    if _ip:
        print("[desk-rt] resolving", _fabric_host)
        for i in range(12):
            feed_wdt()
            try:
                socket.getaddrinfo(_fabric_host, 443)
                _dns_ok = True
                break
            except OSError:
                time.sleep_ms(500)
                _led.value(i % 2)
        print("[desk-rt] DNS ready" if _dns_ok else "[desk-rt] DNS timeout")
    return _dns_ok

resolve_fabric()

# ───── Phase 2: heavy imports (only NOW that WiFi is settled) ─────
print("[desk-rt] phase 2: stick.py (graphics + I2C)")
gc.collect()
from stick import (screen, btn_a, btn_b, led, buz, imu,
                   BLACK, WHITE, RED, GREEN, BLUE, CYAN, MAGENTA, YELLOW,
                   ORANGE, GRAY, DIM, rgb,
                   sleep_ms, ticks_ms, ticks_diff)
import urequests, ujson
gc.collect()
print("[desk-rt] phase 2 complete, free:", gc.mem_free())

# Audio: volume is enforced centrally inside stick.py's _Buzzer (reads
# /desk_volume on flash, persists changes). 0=mute, 1=quiet, 2=loud.
# desk-rt.py just calls buz.tone() / buz.seq() and trusts the level.
# Hold-B on the local STATUS screen cycles 0→1→2→0; the worker can also
# nudge it via /list response volume_target to sync from MCP desk.set_volume.
try: buz.off()
except Exception: pass

led.off()
_AUTH = {"Authorization": "Bearer " + DEVICE_TOKEN} if DEVICE_TOKEN else {}

# ───── Surface boot result on screen ─────
def wifi_retry_loop(reason="wifi failed"):
    global _ip
    while True:
        screen.clear()
        screen.banner("WIFI", RED)
        screen.text(reason[:18], 4, 42, RED)
        y = 70
        for s, _ in _NETWORKS[:5]:
            screen.text("x " + s[:14], 4, y, WHITE)
            y += 16
        screen.text("status: " + str(wlan.status()), 4, 172, GRAY)
        screen.text("A: retry wifi", 4, 198, WHITE)
        screen.text("B: reboot", 4, 218, DIM)
        led.on()
        while True:
            if btn_a.pressed():
                led.off(); screen.clear(); screen.banner("WIFI", ORANGE); screen.center("retrying", 110, WHITE)
                while btn_a.pressed(): sleep_ms(30)
                if connect_wifi() and resolve_fabric():
                    led.off(); return
                reason = "still failed"
                break
            if btn_b.pressed():
                import machine
                machine.reset()
            sleep_ms(50)

if _ip is None:
    wifi_retry_loop("wifi failed")

if not _dns_ok:
    wifi_retry_loop("dns failed")

screen.clear()
screen.banner("DESK", ORANGE)
screen.center("connected", 100, GREEN)
screen.text(_ip[:16], 4, 222, DIM)
sleep_ms(300)


# ───── HTTP helpers ─────
def _ensure_dns():
    """Re-warm DNS for the fabric host. lwIP's cache loses entries
       between heavy operations (e.g. I2C / display ops)."""
    for i in range(10):
        feed_wdt()
        try:
            socket.getaddrinfo(_fabric_host, 443)
            return True
        except OSError:
            time.sleep_ms(500)
    return False

# Module-level place to stash the latest pending_elicit / pending_notify
# blobs from /list. (Avoids changing fetch_list's return type and rippling
# through callers.)
_PENDING_ELICIT = None
_PENDING_NOTIFY = None
# Last volume_target observed in a /list reply. The worker can request a
# volume change via desk.set_volume MCP tool; we apply it on next poll.
_VOL_TARGET_SEEN = None

def fetch_list(retry=True):
    feed_wdt()
    gc.collect()
    if not _ensure_dns():
        print("[desk-rt] /list: DNS not ready")
        return None
    try:
        r = urequests.get(FABRIC_BASE + "/list", headers=_AUTH, timeout=6)
        ok = r.status_code == 200
        if not ok: r.close(); return None
        d = r.json(); r.close(); gc.collect()
        global _PENDING_ELICIT, _PENDING_NOTIFY, _VOL_TARGET_SEEN
        _PENDING_ELICIT = d.get("pending_elicit")
        _PENDING_NOTIFY = d.get("pending_notify")
        # Apply remote volume changes idempotently: only re-set if the
        # target differs from what we last saw, so the worker can be
        # authoritative without spamming flash writes.
        vt = d.get("volume_target")
        if vt is not None and vt != _VOL_TARGET_SEEN:
            try:
                cur = buz.get_volume()
                if vt != cur:
                    buz.set_volume(vt)
                    print("[desk-rt] volume synced from worker:", cur, "->", vt)
                _VOL_TARGET_SEEN = vt
            except Exception as e:
                print("[desk-rt] volume sync failed:", e)
        return d.get("apps", [])
    except Exception as e:
        print("[desk-rt] /list failed:", e); gc.collect()
        if retry:
            time.sleep_ms(400)
            return fetch_list(retry=False)
        return None

def url_encode(s):
    out = []
    for ch in s:
        if ch in '{}":,': out.append("%" + ("%02X" % ord(ch)))
        elif ch == " ": out.append("+")
        else: out.append(ch)
    return "".join(out)

def _device_diag():
    try: ip = wlan.ifconfig()[0]
    except Exception: ip = _ip or "?"
    try: status = wlan.status()
    except Exception: status = "?"
    return {
        "ip": ip,
        "ssid": _connected_ssid or "?",
        "wifi_status": status,
        "fabric": FABRIC_BASE,
        "free_mem": gc.mem_free(),
        "uptime_ms": ticks_ms(),
        "dns_ok": _dns_ok,
    }

def run_app(app_id, action, input_obj=None, retry=True):
    feed_wdt()
    gc.collect()
    if not _ensure_dns():
        print("[desk-rt] /run: DNS not ready")
        return None
    try:
        url = FABRIC_BASE + "/run?app=" + app_id + "&action=" + action
        if input_obj is not None:
            url += "&input=" + url_encode(ujson.dumps(input_obj))
        headers = _AUTH
        if app_id == "diag":
            headers = dict(_AUTH)
            headers["X-Desk-Device"] = ujson.dumps(_device_diag())
        r = urequests.post(url, headers=headers, timeout=20)
        if r.status_code != 200:
            print("[desk-rt] /run", app_id, action, "->", r.status_code)
            r.close()
            return None
        d = r.json(); r.close(); gc.collect()
        if app_id == "diag" and d and "frame" in d and "diag" in d["frame"]:
            dg = d["frame"].get("diag") or {}
            dg["device"] = _device_diag()
            d["frame"] = _diag_frame(dg)
        return d
    except Exception as e:
        print("[desk-rt] /run failed:", e); gc.collect()
        if retry:
            time.sleep_ms(400)
            return run_app(app_id, action, input_obj, retry=False)
        return None


# ───── Frame renderer ─────
def _flatten_diag(prefix, obj, out):
    try:
        if isinstance(obj, dict):
            for k in sorted(obj.keys()):
                _flatten_diag((prefix + "." if prefix else "") + str(k), obj[k], out)
        elif isinstance(obj, list):
            out.append(prefix + "=[" + str(len(obj)) + "]")
        else:
            out.append(prefix + "=" + str(obj))
    except Exception as e:
        out.append(prefix + "=<" + str(e) + ">")

def _diag_frame(diag):
    lines = []
    _flatten_diag("", diag, lines)
    ops = [["clr", "black"], ["bnr", "DIAG", "cyan"]]
    y = 26
    for line in lines[:12]:
        ops.append(["txt", 2, y, line[:21], "white"])
        y += 16
    ops.append(["txt", 2, 218, "B: back", "gray"])
    return {"f": ticks_ms(), "ops": ops}

COLORS = {"black":BLACK,"white":WHITE,"red":RED,"green":GREEN,"blue":BLUE,
          "cyan":CYAN,"magenta":MAGENTA,"yellow":YELLOW,"orange":ORANGE,
          "gray":GRAY,"dim":DIM}

def color_of(c):
    if isinstance(c, str):
        if c.startswith("#") and len(c) == 7:
            return rgb(int(c[1:3],16), int(c[3:5],16), int(c[5:7],16))
        return COLORS.get(c, WHITE)
    return WHITE

def _draw_bmp1(x, y, w, h, color, hex_bits):
    try: bits = bytes.fromhex(hex_bits)
    except Exception: return
    bpr = (w + 7) // 8
    for row in range(h):
        run = -1
        for col in range(w):
            on = (bits[row*bpr + (col>>3)] & (1 << (7 - (col & 7)))) != 0
            if on and run < 0: run = col
            elif not on and run >= 0:
                screen.hline(x+run, y+row, col-run, color); run = -1
        if run >= 0: screen.hline(x+run, y+row, w-run, color)

def _draw_sprite(x, y, scale, rows, palette):
    # Colored pixel-art sprite. rows are strings; each char maps through palette.
    # Missing / space / '.' / '0' are transparent. Drawn as scaled filled rects.
    try:
        s = int(scale)
        if s < 1: s = 1
        if s > 12: s = 12
        for yy, row in enumerate(rows):
            run_ch = None; run_x = 0
            row = str(row)
            for xx in range(len(row) + 1):
                ch = row[xx] if xx < len(row) else None
                visible = ch is not None and ch not in (" ", ".", "0") and ch in palette
                if visible:
                    if run_ch is None:
                        run_ch = ch; run_x = xx
                    elif ch != run_ch:
                        screen.fill_rect(x + run_x*s, y + yy*s, (xx-run_x)*s, s, color_of(palette[run_ch]))
                        run_ch = ch; run_x = xx
                elif run_ch is not None:
                    screen.fill_rect(x + run_x*s, y + yy*s, (xx-run_x)*s, s, color_of(palette[run_ch]))
                    run_ch = None
    except Exception as e:
        print("[sprite]", e)

def render(frame):
    if not frame or "ops" not in frame: return
    for op in frame["ops"]:
        # capture banner ops so we can repaint the status dot on top after
        pass
    for op in frame["ops"]:
        try:
            tag = op[0]
            if tag == "clr": screen.clear(color_of(op[1]) if len(op)>1 else BLACK)
            elif tag == "bnr": screen.banner(op[1], color_of(op[2]) if len(op)>2 else ORANGE)
            elif tag == "txt":
                screen.text(op[3], op[1], op[2], color_of(op[4]) if len(op)>4 else WHITE,
                            big=bool(op[5]) if len(op)>5 else False)
            elif tag == "rect": screen.rect(op[1],op[2],op[3],op[4], color_of(op[5]))
            elif tag == "fill": screen.fill_rect(op[1],op[2],op[3],op[4], color_of(op[5]))
            elif tag == "bmp": _draw_bmp1(op[1],op[2],op[3],op[4], color_of(op[5]), op[6])
            elif tag == "spr": _draw_sprite(op[1], op[2], op[3], op[4], op[5])
            elif tag == "led":
                if op[1] == "on": led.on()
                elif op[1] == "off": led.off()
                elif op[1] == "blink": led.blink(op[2] if len(op)>2 else 3, 80)
            elif tag == "buz": buz.tone(op[1], op[2])
            elif tag == "seq":
                # ["seq", [[freq,ms,duty?], ...], gap_ms?]
                # Plays a note sequence on-device — single op, no further
                # HTTPS calls. Volume still enforced by stick.py's buzzer.
                notes = op[1] if len(op) > 1 else []
                gap = op[2] if len(op) > 2 else 10
                try:
                    buz.seq(notes, gap_ms=gap, feed=feed_wdt)
                except Exception as ee:
                    print("[render][seq]", ee)
        except Exception as e:
            print("[render]", op, e)
    # After the app's ops paint, ensure the status dot is on top.
    status_dot(_last_status)


# ───── Dock ─────
_CF_HEX = ("000000000000ff000007ffe0001ffff8003ffffc00fffffe07ffffff"
           "3fffffff7fffffffffffffffffffffffffffffffffffffffffffffff")
CF_ORANGE = rgb(0xF3, 0x80, 0x20)
_chrome_drawn = False
_last_idx = -1
_ROW_Y = 38
_ROW_H = 18

# Status dot is at a fixed position in EVERY top bar (banner or dock-chrome).
# Center: x=124..130 (6px wide), y=7..13 (6px tall). The orange banner is
# 0..20 tall so y=7 vertically centers; the dock chrome's BLACK header is
# 0..24 so y=7 also reads as right-of-DESK.
_DOT_X, _DOT_Y, _DOT_SZ = 124, 7, 6
_last_status = "ok"

def status_dot(state):
    """state: 'ok' | 'wait' | 'fail' — paint the indicator at the canonical position."""
    global _last_status
    _last_status = state
    c = GREEN if state == "ok" else (YELLOW if state == "wait" else RED)
    screen.fill_rect(_DOT_X, _DOT_Y, _DOT_SZ, _DOT_SZ, c)

def _dock_chrome():
    screen.clear()
    screen.fill_rect(0, 0, 135, 24, BLACK)
    _draw_bmp1(8, 5, 32, 14, CF_ORANGE, _CF_HEX)
    screen.text("DESK", 50, 9, CF_ORANGE)
    screen.hline(0, 24, 135, CF_ORANGE)
    screen.text("A: open", 4, 200, DIM)
    screen.text("B: next", 4, 218, DIM)
    status_dot(_last_status)  # always paint dot last so it sits on top

def _dock_row(i, app, hi):
    y = _ROW_Y + i * _ROW_H
    screen.fill_rect(0, y, 135, _ROW_H, BLACK)
    pre = ">" if hi else " "
    screen.text(pre + " " + app["id"][:12], 4, y, ORANGE if hi else GRAY)

def render_dock(apps, idx, full=False):
    global _chrome_drawn, _last_idx
    if full or not _chrome_drawn:
        _dock_chrome(); _chrome_drawn = True; _last_idx = -1
    if not apps:
        screen.center("no apps", 80, GRAY); screen.center("git push", 110, WHITE); return
    if _last_idx == -1:
        for i, a in enumerate(apps): _dock_row(i, a, i == idx)
    else:
        if 0 <= _last_idx < len(apps): _dock_row(_last_idx, apps[_last_idx], False)
        if 0 <= idx < len(apps): _dock_row(idx, apps[idx], True)
    _last_idx = idx

def invalidate_dock():
    global _chrome_drawn, _last_idx
    _chrome_drawn = False; _last_idx = -1


# ───── Spinner: 8-segment ring drawn with rectangles. Advances 1 frame
# per call so the same draw point can be called from multiple spots and
# show motion across paint passes (e.g. before & after an HTTPS round-trip).
_SPIN_POS = [
    (0, -10), (7, -7), (10, 0), (7, 7), (0, 10), (-7, 7), (-10, 0), (-7, -7),
]
_spin_frame = 0

def draw_spinner(cx, cy):
    global _spin_frame
    _spin_frame = (_spin_frame + 1) % 8
    for i, (dx, dy) in enumerate(_SPIN_POS):
        d = (i - _spin_frame) % 8
        # head bright, tail dim
        if d == 0: c = ORANGE
        elif d == 1: c = WHITE
        elif d == 2: c = GRAY
        else: c = DIM
        screen.fill_rect(cx + dx - 2, cy + dy - 2, 4, 4, c)

def show_loading(title=None, subtitle=None):
    """Wordless loading screen — just the spinner. Args ignored for back-compat."""
    screen.clear()
    status_dot(_last_status)
    draw_spinner(67, 120)

# ───── Main ─────
def render_rescue(msg="fabric down"):
    screen.clear(); screen.banner("RESCUE", ORANGE)
    screen.text(msg[:18], 4, 42, RED)
    screen.text("wifi: " + (_ip or "?"), 4, 68, GRAY)
    screen.text("host:", 4, 94, DIM)
    screen.text(_fabric_host[:20], 4, 112, GRAY)
    screen.text("A: retry fabric", 4, 178, WHITE)
    screen.text("B: local status", 4, 198, WHITE)
    screen.text("hold B: reboot", 4, 218, DIM)

_VOL_LABEL = ("mute", "quiet", "loud")
_VOL_COLOR = (RED, YELLOW, GREEN)

def render_local_status():
    screen.clear(); screen.banner("STATUS", CYAN)
    screen.text("wifi: " + ("ok" if wlan.isconnected() else "down"), 4, 42, WHITE)
    try: ip = wlan.ifconfig()[0]
    except Exception: ip = "?"
    screen.text("ip: " + ip[:16], 4, 64, GRAY)
    screen.text("fabric:", 4, 90, DIM)
    screen.text(_fabric_host[:20], 4, 108, GRAY)
    try:
        v = buz.get_volume()
    except Exception:
        v = 0
    screen.text("sound: " + _VOL_LABEL[v], 4, 136, _VOL_COLOR[v])
    screen.text("hold B: cycle vol", 4, 156, DIM)
    screen.text("A: retry fabric", 4, 198, WHITE)
    screen.text("B: back", 4, 218, DIM)

def rescue_loop(msg="fabric down"):
    render_rescue(msg)
    showing_status = False
    last_a = last_b = 1
    b_since = None
    vol_cycled_this_press = False  # avoid double-firing on long-then-release
    while True:
        feed_wdt()
        a = 0 if btn_a.pressed() else 1
        b = 0 if btn_b.pressed() else 1
        if last_a == 1 and a == 0:
            show_loading()
            apps2 = fetch_list()
            if apps2 is not None:
                return apps2
            showing_status = False
            render_rescue("still down")
        if last_b == 1 and b == 0:
            b_since = ticks_ms()
            vol_cycled_this_press = False
        # Hold-B on status screen → cycle volume (mute → quiet → loud → mute).
        # Reuses the existing "hold B 2.5s reboot" gesture by intercepting
        # at 800ms, which is shorter, so reboot still works if user holds.
        if (b == 0 and showing_status and b_since is not None
                and not vol_cycled_this_press
                and ticks_diff(ticks_ms(), b_since) > 800
                and ticks_diff(ticks_ms(), b_since) < 1400):
            try:
                v = (buz.get_volume() + 1) % 3
                buz.set_volume(v)
                # Audible feedback at the new level (mute will be silent).
                buz.tone(2400, 80)
                render_local_status()  # repaint with new label/color
                vol_cycled_this_press = True
            except Exception as e:
                print("[rescue] vol cycle failed:", e)
        if last_b == 0 and b == 1:
            if b_since is not None and ticks_diff(ticks_ms(), b_since) > 1500:
                # Don't reboot if we just cycled volume — that gesture is
                # short (< 1.4s) so a long-hold past 1500 still wins reboot.
                if not vol_cycled_this_press:
                    import machine
                    machine.reset()
            elif not vol_cycled_this_press:
                showing_status = not showing_status
                if showing_status: render_local_status()
                else: render_rescue(msg)
            b_since = None
        if b == 0 and b_since is not None and ticks_diff(ticks_ms(), b_since) > 2500:
            import machine
            machine.reset()
        last_a = a; last_b = b
        sleep_ms(50)

show_loading()
# Avoid getting stuck on the spinner forever if the first HTTPS call hangs.
# Try briefly, then show the rescue UI so the user has visible controls.
apps = fetch_list(retry=False)
if apps is None:
    apps = rescue_loop("fabric down")

idx = 0
in_app = None
invalidate_dock()
render_dock(apps, idx)
last_a = last_b = 1
b_held_since = None
a_held_since = None
last_dock_refresh = ticks_ms()
DOCK_REFRESH_MS = 10_000

while True:
    feed_wdt()
    a = 0 if btn_a.pressed() else 1

    # Dock auto-refresh: poll /list every 10s when on dock
    if in_app is None and ticks_diff(ticks_ms(), last_dock_refresh) > DOCK_REFRESH_MS:
        last_dock_refresh = ticks_ms()
        new_apps = fetch_list()
        if new_apps is not None:
            new_ids = [x["id"] for x in new_apps]
            old_ids = [x["id"] for x in apps]
            if new_ids != old_ids:
                apps = new_apps
                idx = min(idx, max(0, len(apps) - 1))
                buz.tone(2800, 30)
                invalidate_dock()
                render_dock(apps, idx)
            # If a pending elicit OR an unread notification just appeared,
            # take over by opening the inbox app. The supervisor will render
            # the right surface because it sees the same pending state.
            # Different chirps so the wrist's urgency is distinguishable:
            # double chirp for blocking elicit, single softer chirp for
            # non-blocking notification.
            if _PENDING_ELICIT is not None or _PENDING_NOTIFY is not None:
                if _PENDING_ELICIT is not None:
                    buz.tone(2400, 60); buz.tone(3000, 60)  # double = ask
                else:
                    buz.tone(2600, 80)                        # single = notify
                in_app = "inbox"
                show_loading()
                status_dot("wait")
                f = run_app("inbox", "init")
                if f and "frame" in f:
                    render(f["frame"])
                    status_dot("ok")
                else:
                    status_dot("fail")
                    in_app = None
                    invalidate_dock()
                    render_dock(apps, idx)
            else:
                # Successful refresh, healthy network — clear any stale red.
                if _last_status != "ok":
                    status_dot("ok")
    b = 0 if btn_b.pressed() else 1

    # ── A press edge — IMMEDIATE feedback
    if last_a == 1 and a == 0:
        a_held_since = ticks_ms()
        if in_app is None and apps:
            in_app = apps[idx]["id"]
            buz.tone(2400, 40)
            show_loading()
            status_dot("wait")
            f = run_app(in_app, "init")
            if f and "frame" in f:
                render(f["frame"])
                status_dot("ok")
                # Opening an app is triggered by an A press. Do not let that
                # same physical press turn into an in-app A release event —
                # otherwise apps like counter increment immediately on open.
                a_held_since = None
            else:
                screen.clear()
                screen.banner("APP ERR", RED)
                screen.text(in_app[:16], 4, 42, WHITE)
                screen.text("failed to load", 4, 68, RED)
                screen.text("server/app error", 4, 92, GRAY)
                screen.text("B: back", 4, 218, DIM)
                status_dot("fail")
                # Stay in-app so the error remains visible instead of
                # bouncing back into a confusing loader/dock loop. B exits.
                a_held_since = None
        elif in_app is not None:
            # In app: optimistic feedback. The actual request is deferred
            # to the release edge so we can disambiguate short vs long press,
            # but we click immediately so the user knows we registered it.
            buz.tone(2200, 25)
            led.on()

    # ── A release edge
    if last_a == 0 and a == 1 and in_app is not None and a_held_since is not None:
        held = ticks_diff(ticks_ms(), a_held_since)
        # Always forward the real press phase. Apps decide for themselves
        # whether long-A means something distinct (reset, next-song, third
        # option) or whether to ignore phase=="long" entirely. The earlier
        # "ban long for everyone but inbox" rule was a workaround for an
        # app-side bug (counter not handling long → silent miss) and broke
        # the 3-input promise for every other app. Convention: apps that
        # only want short presses write `if (input.phase === "down")` and
        # let long quietly no-op; apps that want short OR long both to fire
        # an action write `if (input.phase === "down" || phase === "long")`.
        phase = "long" if held > 800 else "down"
        # Tactile cue for the long-press path so the user *feels* it
        # registered, regardless of what the app does with it.
        if phase == "long":
            buz.tone(800, 80)
        # Visual: dim the screen briefly + show a thinking dot in the
        # bottom-right corner so the user sees something happen NOW.
        screen.fill_rect(120, 226, 12, 12, YELLOW)
        status_dot("wait")
        f = run_app(in_app, "input", {"kind":"btn","id":"a","phase":phase})
        led.off()
        if f and "frame" in f:
            render(f["frame"])
            status_dot("ok")
        else:
            screen.clear()
            screen.banner("APP ERR", RED)
            screen.text(in_app[:16], 4, 42, WHITE)
            screen.text("input failed", 4, 68, RED)
            screen.text("B: back", 4, 218, DIM)
            status_dot("fail")
        a_held_since = None

    # ── B press edge
    if last_b == 1 and b == 0:
        b_held_since = ticks_ms()
        if in_app is None:
            # In dock: B cycles selection
            idx = (idx + 1) % max(1, len(apps))
            buz.tone(1500, 40)
            render_dock(apps, idx)
        else:
            # In app: B is ALWAYS back to dock (runtime-owned, not delivered to app)
            in_app = None
            buz.tone(800, 100)
            show_loading()
            apps = fetch_list() or apps
            invalidate_dock()
            render_dock(apps, idx)

    # ── B release edge — just clear hold tracker
    if last_b == 0 and b == 1 and b_held_since is not None:
        b_held_since = None

    if btn_a.pressed() and btn_b.pressed():
        t0 = ticks_ms()
        while btn_a.pressed() and btn_b.pressed():
            feed_wdt()
            sleep_ms(50)
            if ticks_diff(ticks_ms(), t0) > 2500:
                import machine
                machine.reset()

    last_a, last_b = a, b
    sleep_ms(30)
