# desk experiments

Every architectural claim about desk has a numbered experiment here that
proves or disproves it. Modeled exactly on
[`~/cloudflare/unsurf/experiments/`](../../unsurf/experiments/).

## Convention

```
experiments/exp-NN-question-shape/
├── README.md     ← the question + acceptance criteria
├── run.sh        ← reproducible, produces measurable output
└── RESULT.md     ← numbers + decision + date
```

The folder name **is the question**, in the form a human would ask.
Examples from unsurf: `exp-005-does-role-name-survive-react-rerenders`,
`exp-008-can-prompt-injection-poison-synthesized-tools`.

## Index

| # | Question | State | Decision |
|---|---|---|---|
| [01](./exp-01-can-ws-hibernation-survive-cell-handoff/) | Can WebSocket Hibernation survive a cell→hotspot handoff on ESP32? | 🟢 graduated (local-fidelity) | WS Hibernation is the transport |
| [02](./exp-02-can-device-jwt-be-presence-bound/) | Can a device JWT be presence-bound and revokable in ≤60s without polling? | 🟢 graduated w/ 2 fixes | Presence-bound JWT v0; resurrection bug to fix |
| [03](./exp-03-can-e2e-crypto-fit-in-162kb/) | Can X25519 + ChaCha20-Poly1305 fit in 162KB RAM in MicroPython? | 🟢 graduated w/ caveat | X25519 + AES-256-CTR + HMAC-SHA256 (no ChaCha) |
| [04](./exp-04-what-is-an-app/) | What is an "app" — TS DO class, JSON manifest+sandbox, or AI-generated frame stream? | 🟡 partial (A,B done; C deferred) | App = JSON manifest in real isolate; TS class as escape hatch |
| [05a](./exp-05a-can-pi-tui-render-desk-frames/) | Can pi render desk frames in a TUI pane? | 🔴 not started | — |
| [05b](./exp-05b-can-browser-render-desk-frames/) | Can a browser tab render desk frames? | 🔴 not started | — |
| [05c](./exp-05c-can-m5-render-desk-frames/) | Can the M5StickC render desk frames? | 🔴 not started | — |
| [06](./exp-06-can-non-stratus-client-talk-to-lee/) | Can a non-Stratus client connect to Lee's chat WS, with what auth? | 🟢 graduated | Direct path exists via `/api/ws` + API Gateway JWT; no Lee-side changes needed |
| [07](./exp-07-lee-cli-client/) | Can a ≤200 LOC CLI client speak the cloudflare-agent /api/ws protocol? | 🟡 partial — **PARKED** | 146-line Bun client passes local smoke. Parked: LEE is a future tenant of desk, not desk's foundation. |
| [08](./exp-08-can-worker-loader-host-our-apps-safely/) | Can **Worker Loader** host our apps safely? *(renamed from W4P after docs read)* | 🟢 graduated | 8/8 tests pass; cold-start 13ms; F-3, F-4 closed; F-5 (cpuMs prod-only), F-6 (cache-by-id+ver) raised |
| [09](./exp-09-can-quickjs-wasm-sandbox-desk-apps-cheaper/) | Can QuickJS-WASM sandbox desk apps with smaller ops cost? | 🔴 **parked** | Worker Loader (exp-08) covers this strictly better |
| [10](./exp-10-what-does-a-desk-app-manifest-declare/) | What does a desk app manifest declare? | 🟢 graduated | desk.app.v0 = markdown frontmatter + JS body; permissions = WorkerEntrypoint stubs |
| [11](./exp-11-can-m5-render-an-installed-apps-dock/) | Can the M5 render a "dock" — installed apps list, A=open, B=back? | 🔴 not started | Without it, the "platform" claim is false advertising |
| [12](./exp-12-how-does-an-unpaired-m5-join-a-desk/) | How does an unpaired M5 join a desk in one ceremony? | 🔴 not started | Onboarding; turns project into product |
| [13](./exp-13-artifacts-app-source/) | Can desk-fabric load apps from Cloudflare Artifacts via isomorphic-git? | 🟢 graduated | Live repo on the operator's account; git push installs; git revert rolls back; F-6 closed; F-7..9 raised |
| [17](./exp-17-mcp-spike/) | Can `McpAgent` host elicit-style tools where the handler blocks on cross-DO state until an external HTTP supplies the answer? | 🟢 graduated | All 5 unknowns resolved by SDK. 60s tool calls work clean. Cross-DO routing works. The elicit pattern is just `poll_for` with a button-press payload. |

States: 🔴 not started · 🟡 in progress · 🟢 graduated · ⛔ disproven (still useful!)

## Rules

1. The folder name is the question. If you can't phrase it as a question,
   it's not an experiment.
2. The experiment must produce **measurable** output. "It seems to work"
   is not a result.
3. RESULT.md must include a date and a decision (graduate, disprove, or
   re-run with refined question).
4. A graduated experiment unlocks the matching production code.
   No graduation, no production code.
5. A disproven experiment is **still useful** — it produces a documented
   "why we didn't do that" which is often more valuable than a yes.
