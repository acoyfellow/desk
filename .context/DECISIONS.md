# desk — Decisions

Every entry links to the experiment that proved it.

## Graduated decisions

| # | Decision | Proven by | Date |
|---|---|---|---|
| D1 | **Transport** = WebSocket via Durable Object Hibernation API. State-on-connect; opt-in `since:` for replay. | [exp-01](../experiments/exp-01-can-ws-hibernation-survive-cell-handoff/RESULT.md) | 2026-04-27 |
| D2 | **Auth (v0)** = presence-bound device JWT (HS256), `jti` keyed in DO with `last_heartbeat`; 60s presence window; explicit revoke. | [exp-02](../experiments/exp-02-can-device-jwt-be-presence-bound/RESULT.md) | 2026-04-27 |
| D3 | **Crypto suite** = X25519 ECDH + AES-256-CTR + HMAC-SHA256 + SHA-256/HKDF. **ChaCha20-Poly1305 rejected** (not in MicroPython `cryptolib`). README may say "E2E" with footnote linking to exp-03. | [exp-03](../experiments/exp-03-can-e2e-crypto-fit-in-162kb/RESULT.md) | 2026-04-27 |
| D4 | **App format** = JSON manifest with handler bodies (candidate-B shape), executed in a **real isolate** (QuickJS-WASM or Workers for Platforms). Naive `new Function` host is **debug-only**. TS DO class is an escape hatch for power users. | [exp-04 partial](../experiments/exp-04-what-is-an-app/RESULT.md) | 2026-04-27 |
| D5 | **Lee-chat path for desk** = browser/pi/CLI clients ride `cloudflare-agent`'s existing `/api/ws` flow; M5 rides a small **desk-broker** Worker (read-only by policy, write elicitations redirected to Stratus). **Zero Lee-side changes.** | [exp-06](../experiments/exp-06-can-non-stratus-client-talk-to-lee/RESULT.md) | 2026-04-27 |
| D6 | **Wire protocol for desk LEE-chat clients** = whatever cloudflare-agent emits. desk does not invent a parallel protocol. The 146-line Bun CLI in exp-07 is the reference impl; M5/pi-TUI are reskins of its handshake + receive loop. | [exp-07 partial](../experiments/exp-07-lee-cli-client/RESULT.md) | 2026-04-27 |
| D7 | **App format** = markdown file. YAML frontmatter is the manifest (`spec: desk.app.v0`, id/version/permissions/budget/entrypoints/dock). Body is JS exporting a `class App extends DurableObject` with `init`/`onInput`/`onAlarm`. **Permissions are capability stubs** — missing key = no `WorkerEntrypoint` binding passed = no reference to call. Network and state isolation are runtime-enforced (Worker Loader `globalOutbound: null` + DO Facets). The naive `new Function` runtime from exp-04 is fully retired. | [exp-10](../experiments/exp-10-what-does-a-desk-app-manifest-declare/RESULT.md) | 2026-04-27 |
| D8 | **Runtime = Worker Loader (Dynamic Workers).** desk-fabric loads apps via `env.LOADER.get(id, callback)` where callback returns `{compatibilityDate, mainModule, modules, globalOutbound: null, env: <only-declared-permission-stubs>, limits: <from manifest budget>}`. DO Facets host per-app isolated SQLite. **Cold-start measured at 13ms locally.** exp-09 (QuickJS-WASM) parked — Worker Loader covers it strictly better. | [exp-08](../experiments/exp-08-can-worker-loader-host-our-apps-safely/RESULT.md) | 2026-04-27 |
| D9 | **AppSource = Cloudflare Artifacts via isomorphic-git.** Apps live in a per-user `desk/apps` Artifacts repo. `git push` installs, `git revert` rolls back, `git log` is the audit trail. `ArtifactsAppSource` reads via isomorphic-git+MemoryFS (will swap to public `env.ARTIFACTS.tree()/blob()` binding when shipped). `KvAppSource` available as no-Artifacts fallback (same interface). The fabric depends on the AppSource interface, not on Artifacts specifically. | [exp-13](../experiments/exp-13-artifacts-app-source/RESULT.md) | 2026-04-27 |
| D10 | **MCP server = `McpAgent.serve("/mcp")` mounted on desk-fabric.** Per-session state in the McpAgent DO. Tool handlers that need user input write a request into an AppRunner DO (app=`elicit`/`notify`/etc) and poll that DO's storage; the M5's existing `/run` polling handles rendering + answer collection. **No new transport, no new auth, no M5 runtime changes.** Any MCP-capable agent (Claude Desktop, Cursor, pi, opencode, hermes) can drive desk by hitting `/mcp` with the device token. | [exp-17](../experiments/exp-17-mcp-spike/RESULT.md) | 2026-04-27 |

## Open issues to fix before production

| Issue | Source | Fix | Status |
|---|---|---|---|
| F-1 | exp-02 Finding 2 | Heartbeat endpoint must reject updates to already-presence-expired tokens | ✅ **fixed 2026-04-27** |
| F-2 | exp-02 Finding 1 | Tamper test methodology (bash truncation) is unreliable; rewrite to flip a middle byte | ✅ **fixed 2026-04-27** |
| F-3 | exp-04 Candidate B | `new Function` is not a sandbox; production must use QuickJS-WASM or Workers-for-Platforms | ✅ **closed by D8** |
| F-4 | exp-04 Candidate B | No execution timeout; `while(true)` hangs the host | ⚠️ **partially closed** — `limits.cpuMs` documented; F-5 tracks the local-dev gap |
| F-5 | exp-08 | `wrangler dev` does not appear to enforce `limits.cpuMs`. Per docs, enforced in prod. | ⚠️ open — reproduce in deployed worker now that we have one |
| F-6 | exp-08 | Worker Loader caches by `${id}:${version}`. App install pipeline must change id when source changes. | ✅ **closed in exp-13** — loader id is `${id}:${ver}:${sha8}` |
| F-7 | exp-13 | `ArtifactsAppSource` per-request clones (~950ms). | ✅ **closed 2026-04-27** — module-scoped, warm 50ms |
| F-8 | exp-13 | MemoryFS needs `readlink`/`symlink` stubs for isomorphic-git's `bindFs`. | ✅ **closed in exp-13** |
| F-9 | exp-13 | MemoryFS errors must carry node-fs-style `err.code` so isomorphic-git's `exists()` helper detects them. | ✅ **closed in exp-13** |
| F-10 | exp-11 demo | App-side `this.ctx.storage.setAlarm()` throws inside DO Facets (Worker Loader). Pet app fails because of this. Need to either expose alarm API on facets, route alarms through the supervisor, or document v0 = no background apps. | ⚠️ open — spec-relevant |
| F-11 | exp-11 demo | HTTPS-per-press feels sluggish (~500ms p50 round-trip). Ship over WebSocket per D1; current HTTP polling is a stopgap. | ⚠️ open |
| F-12 | exp-11 demo | M5 buttons can be missed during in-flight HTTPS calls (loop blocks for ~500ms). Either yield to button polling or drive request via async. | ⚠️ open |
| F-13 | exp-11 demo | M5 boot.py + main.py imports + WiFi handshake heap pressure causes occasional 0x0101 / OSError -202 / -203. Worked around by importing WiFi-first; soft-reset doesn't recover, full USB unplug needed. | ⚠️ open — firmware-level |

## Drafts (still hypotheses)

- **Renderer portability** (exp-05a/b/c) — believed yes; not yet measured.
- **Candidate C (AI-generated frames)** — needs Workers AI binding; deferred until write-scoped CF token exists.
- **MCP write-elicitation filter** for the desk-broker — design exists, no experiment yet.
- **JWT handoff to desk-broker at pairing time** — design exists, no experiment yet.
