# Security

## Reporting a vulnerability

desk is a personal project that authorizes AI agents to drive a wrist
device the operator wears. A class of vulnerability that matters here
includes:

- Anything that lets a third party (a malicious MCP client, an agent
  with a stolen bearer token, an attacker on the operator's network)
  cause the wrist device to display content or take actions the
  operator did not consent to.
- Anything that exposes operator credentials (the device bearer token,
  Cloudflare deploy/Artifacts tokens) outside the operator's
  filesystem.
- Anything that lets an installed app (markdown manifest in the
  Artifacts repo) escape the Worker Loader sandbox or read state
  belonging to another app.

If you find something in any of those categories, please email the
maintainer privately rather than opening a public issue. Find an
address on the GitHub profile linked from the repo.

## What's in scope vs. out of scope

**In scope:**
- The fabric Worker source code (`experiments/exp-13-artifacts-app-source/`)
- The device runtime (`device/desk-rt.py`, `device/playground/lib/stick.py`)
- The frame protocol and manifest schema
- Demo apps shipped in the repo

**Out of scope:**
- The operator's choice of MCP clients (you control which agents you
  give the bearer to)
- Cloudflare's own security boundaries (Workers, Worker Loader, DO,
  Artifacts) — report those upstream
- The M5StickC hardware itself

## Threat model assumptions

- The bearer token (`DESK_DEVICE_TOKEN`) is treated as a high-trust
  secret. An attacker who obtains it can drive every desk MCP tool
  and can phish the operator via `desk.ask`.
- The Cloudflare Artifacts repo is an authoritative source of app
  source code. An attacker who can push to it can install arbitrary
  apps. This is no different from the operator's GitHub account
  being compromised.
- The M5 trusts whatever the fabric Worker tells it to render. If
  the fabric is compromised, the M5 is compromised.

## What's NOT a vulnerability

- Anything an agent given the bearer token does using documented
  MCP tools — that's the design.
- The fact that `desk.ask` interrupts whatever is on the wrist —
  it's the entire point.
- The dock auto-refresh polling endpoints with the bearer (this is
  how the device works).
