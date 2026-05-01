# exp-19 — Can the M5 firmware be OTA-updated from the same Artifacts repo that hosts apps?

## The shape

Today, every change to `desk-rt.py` or `stick.py` requires a USB cable +
`mpremote` from the operator laptop. That breaks the agentic-development loop:
an agent who finds a firmware bug can't fix it without the operator in the loop
and physically tethered.

D9 (Artifacts AppSource) graduated the pattern of "code lives as files in
a Cloudflare Artifacts git repo; `git push` installs". The question for
exp-19 is whether that same pattern can host firmware, with an OTA
mechanism that is **safe** (a bad push must not brick the device).

## The forcing function

After exp-19 graduates, the operator should be able to:

1. Edit `desk-rt.py` on his laptop.
2. `git push` to `desk/apps.git`.
3. Walk away from the laptop.
4. Within ~30s, the M5 picks up the new firmware, reboots into it, and
   verifies it runs cleanly. If anything goes wrong, the device boots back
   into the prior known-good firmware automatically.

No cable. No `mpremote`. No "is the M5 plugged in?".

## What graduates this experiment

A measurable RESULT.md showing:

- A firmware change pushed to the Artifacts repo, downloaded by the
  device, applied, and verified by the device, **with the laptop closed**.
- A simulated bad firmware push that the device's safe-boot logic
  recognizes and rolls back from, automatically, within ≤ 1 minute.
- Mean over-the-air update latency, measured across ≥ 10 runs.
- A sketch of what "agentic firmware fix" looks like — i.e., an MCP tool
  `desk.flash_device(branch?)` that triggers a forced re-check on demand,
  used by an agent who just pushed a firmware patch.

## The architecture (proposed; experiment will challenge or confirm)

### Repo layout

`desk/apps.git` already hosts apps. Add a top-level `device/` directory:

```
desk/apps.git
├── apps/
│   ├── counter/manifest.md
│   ├── pet/manifest.md
│   └── tunes/manifest.md
└── device/
    ├── desk-rt.py        (current main.py target)
    ├── stick.py
    └── manifest.json     {"version": "0.5.0", "files": [...]}
```

### Worker endpoints (added to desk-fabric-exp13)

- `GET /firmware/manifest` — returns `device/manifest.json` + content
  hashes of each file. Cheap; called every dock-refresh.
- `GET /firmware/file?path=<path>` — returns one file's bytes.

### Device-side flow (desk-rt.py)

1. On every dock refresh (every 10s), GET `/firmware/manifest`.
2. Compare the returned `version` to the running version (stored in
   `/desk_firmware_version` on flash).
3. If they differ:
   1. Download all listed files into `:_pending_<name>`.
   2. Verify SHA-256 of each against the manifest.
   3. Write a **breadcrumb** file: `:_firmware_pending` containing the
      target version and the list of staged files.
   4. `machine.reset()`.
4. On boot (`boot.py`):
   1. If `:_firmware_pending` exists: rename `:_<name>` → `:<name>`,
      delete the breadcrumb, write a new breadcrumb `:_firmware_probe`
      containing the target version and a deadline (now + 60s).
   2. Continue normal boot.
5. `desk-rt.py`, on first successful `/list` after boot, deletes
   `:_firmware_probe` and writes the new version into
   `/desk_firmware_version`. **This is the "I lived" handshake.**
6. `boot.py` on the *next* boot, if it sees a stale `:_firmware_probe`
   whose deadline passed, restores from `:_safe_<name>` files and reboots.

### Safe-boot files

Before promoting `:_<name>` → `:<name>`, copy the *current* `:<name>` →
`:_safe_<name>`. Two-deep firmware version: current + safe. Total flash
overhead: 2x the firmware size (~60KB worst case on the Plus 1.1, fine).

### Failure modes (and how the design handles each)

| Failure | What happens |
|---|---|
| Network drops mid-download | `:_firmware_pending` not written; next poll retries. |
| Worker returns garbage | SHA-256 mismatch; download discarded. |
| New firmware imports cleanly but loops in main | WDT (30s) reboots; `:_firmware_probe` deadline expires; rollback. |
| New firmware crashes immediately at import | Same: WDT + probe deadline → rollback. |
| Power loss during file rename | Breadcrumb tells boot.py to retry the rename; idempotent. |
| Bad `boot.py` itself | This is the irrecoverable case. **Don't OTA boot.py.** Lock that to a manual flash via mpremote. |

### Trust / auth

The OTA endpoints are bearer-auth like everything else. `DESK_DEVICE_TOKEN`
gates them. If the token is compromised, an attacker could push code; but
the token is also the gate to all the device's state, so this is a wash —
an attacker with the token can already drive `desk.elicit` to phish.

For a future public-distribution version, signed firmware manifests
become necessary. v1 is single-user.

## Out of scope for v1

- OTAing `boot.py` (too risky; manual flash only).
- OTAing `secrets.py` (sensitive; keep it local).
- Multi-device targeting (today's singleton AppRunner means there's one
  device; per-device firmware versions wait for the multi-device
  experiment).
- Battery-aware deferral (don't push firmware when battery < 20%) —
  could be added once we have battery telemetry.

## Acceptance criteria

A graduated exp-19 produces a RESULT.md with:

- [ ] A successful round-trip OTA observed and timestamped.
- [ ] A deliberately-broken firmware push, observed to roll back, with
      total user-visible downtime measured.
- [ ] N≥10 OTA latency samples; median + tail.
- [ ] An MCP tool `desk.flash_device(version?)` that forces re-check.
- [ ] A note on whether `boot.py` should ever be OTAable (the operator call).

## Why this is worth doing

It closes the agentic loop on firmware. Without it, every device-side
bug discovered by an agent is gated on the operator laptop being plugged in.
With it, the agent can push a fix and verify it landed without human
involvement, for as long as the device retains a working `boot.py`.

This is the same forcing function as D9 (Artifacts AppSource) — apps
auto-install via `git push` — extended to the firmware itself. After
exp-19, the only thing that physically requires the cable is bricking
recovery.
