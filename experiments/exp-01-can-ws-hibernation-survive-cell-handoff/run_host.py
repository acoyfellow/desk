#!/usr/bin/env python3
# exp-01 host-side runner — opens a WebSocket to the local fab Worker,
# logs every seq message, and simulates network outages by closing+reopening
# the socket on a randomized schedule.
#
# This is the LOCAL-FIDELITY version of the cell-handoff test. The real
# hardware version would toggle ESP32 WLAN.active(False/True). For the
# protocol-level question, "abrupt socket close + reopen" is functionally
# equivalent: same DO state semantics, same hibernation behavior, same
# message-loss measurement. Documented as a compromise.

import asyncio, json, time, random, sys
try:
    import websockets
except ImportError:
    print("pip install --user websockets", file=sys.stderr); sys.exit(1)

URL = "ws://127.0.0.1:8911/seq/exp01"
DURATION_S = 60          # short run; can be extended
N_OUTAGES = 5            # deliberate disconnects during run
MIN_OUTAGE_MS = 800
MAX_OUTAGE_MS = 4000

received = []   # list of (seq, recv_ts_ms)
events = []     # connect/disconnect/error events
reconnects = []

async def runner():
    start = time.time()
    end = start + DURATION_S
    # schedule outages at 20%, 35%, 50%, 65%, 80% of the run (jittered)
    outage_times = sorted(
        start + DURATION_S * (0.2 + 0.6 * (i / max(1, N_OUTAGES-1))) + random.uniform(-1, 1)
        for i in range(N_OUTAGES)
    )
    next_outage = iter(outage_times)
    next_t = next(next_outage, None)
    attempts = 0
    while time.time() < end:
        attempts += 1
        t_connect_start = time.time()
        try:
            async with websockets.connect(URL, open_timeout=10) as ws:
                t_connected = time.time()
                if attempts > 1:
                    reconnects.append((t_connected - t_connect_start) * 1000)
                events.append((t_connected, "connected"))
                while time.time() < end:
                    # Decide if we should force an outage now
                    if next_t and time.time() >= next_t:
                        events.append((time.time(), "force_disconnect"))
                        await ws.close()
                        next_t = next(next_outage, None)
                        outage = random.uniform(MIN_OUTAGE_MS, MAX_OUTAGE_MS) / 1000
                        await asyncio.sleep(outage)
                        break
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        d = json.loads(msg)
                        received.append((d["seq"], time.time() * 1000))
                    except asyncio.TimeoutError:
                        continue
        except Exception as e:
            events.append((time.time(), f"error:{type(e).__name__}"))
            await asyncio.sleep(0.5)

asyncio.run(runner())

# Analysis
seqs = [s for s, _ in received]
gaps = []
if seqs:
    seqs_sorted = sorted(set(seqs))
    for a, b in zip(seqs_sorted, seqs_sorted[1:]):
        if b - a > 1:
            gaps.append((a, b, b - a - 1))

result = {
    "duration_s": DURATION_S,
    "deliberate_outages": N_OUTAGES,
    "messages_received": len(received),
    "unique_seqs": len(set(seqs)),
    "min_seq": min(seqs) if seqs else None,
    "max_seq": max(seqs) if seqs else None,
    "missing_seqs_total": sum(g[2] for g in gaps),
    "gaps": gaps[:20],
    "reconnect_attempts": len(reconnects),
    "reconnect_p50_ms": (sorted(reconnects)[len(reconnects)//2] if reconnects else None),
    "reconnect_p99_ms": (sorted(reconnects)[max(0,int(len(reconnects)*0.99)-1)] if reconnects else None),
    "reconnect_max_ms": (max(reconnects) if reconnects else None),
    "events": [(round(t,3), e) for t, e in events][:40],
}
print(json.dumps(result, indent=2))
