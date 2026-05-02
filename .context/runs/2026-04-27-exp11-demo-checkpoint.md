# 2026-04-27 — exp-11 demo checkpoint

## What just happened (the milestone)

The full desk platform stack ran end-to-end with the operator holding the M5
in his hand:

```
the operator presses A on M5
  → MicroPython runtime (desk-rt.py) sends HTTPS bearer-auth POST
    https://desk-fabric.workers.dev/run?app=counter&...
  → Cloudflare Worker (deployed on his personal account) receives
  → ArtifactsAppSource (module-scoped, isomorphic-git) reads
    apps/counter/manifest.md from his Artifacts repo
  → Worker Loader spins up an isolate from the manifest body
  → DO Facet holds the per-app SQLite state
  → returns frame { ops: [["clr",...], ["txt",...], ...] }
  → M5 renders ops to ST7789 LCD
the operator sees the counter increment.
```

Three apps installed in the live Artifacts repo:
- `counter` — works (D7-D9 verified live on edge)
- `hello` — works (text overflow fixed via git push of v0.1.1, hot-applied)
- `pet` — fails (F-10: setAlarm not supported in DO Facets)

## Live-update demo proven

Pushed `hello@0.1.1` to Artifacts via `git push` while the M5 was
running. Next time hello loads on the M5, it gets the new version.
**No Worker redeploy. No M5 reflash. No app-store CLI.**

## Numbers

- Cold first request (M5 → edge → Artifacts clone → Worker Loader): ~1.8s
- Warm (cached AppSource + cached Worker Loader id): ~450ms
- HTTPS handshake from M5: working but RAM-intensive (~25KB per request)
- M5 free RAM steady-state: ~85KB

## Findings raised

| F | What | Severity |
|---|---|---|
| F-10 | `setAlarm()` from inside a DO Facet doesn't work \u2014 breaks any app declaring background+onAlarm | spec-relevant, must address |
| F-11 | HTTPS-per-press is the source of "sluggish" feel; D1 (WebSocket) was the right answer all along | UX |
| F-12 | M5 button polling can miss presses during in-flight HTTP | UX, fixable client-side |
| F-13 | M5 WiFi 0x0101 firmware bug requires full USB unplug to recover; soft-reset insufficient | dev ergonomics |

## What this unblocks for the demo / repo / video

- README.md can now legitimately claim "git push to install an app on
  your edge" \u2014 we just demonstrated it live.
- Video can show: edit a markdown file \u2192 git push \u2192 5s later it's
  on the device. That IS the demo.
- The 7-min repo test now has a concrete shape:
   1. wrangler login \u2192 deploy fabric (~30s)
   2. dashboard: mint Artifacts:Edit + Workers:Edit token
   3. one-shot setup script: create namespace+repo, mint repo token,
      flash M5, populate secrets
   4. M5 boots, dock appears
   5. git push apps/foo/manifest.md \u2192 it's on your device

## What's NOT yet done

- exp-12 pairing ceremony (still hardcoded device token + wifi creds)
- WebSocket transport (D1 graduated, not implemented)
- The actual prompt\u2192app loop (exp-13b, future)
- A dock-as-an-app version (option A from the original A/B/Y/X choice)
- Rotation of the per-device JWT
- README.md actually written
- Video actually recorded
