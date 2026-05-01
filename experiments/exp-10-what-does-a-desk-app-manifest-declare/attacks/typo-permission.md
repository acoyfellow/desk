---
spec: desk.app.v0
id: bad-perms
name: Bad
version: 0.1.0
permissions:
  screem: write
  butons: read
budget: { cpu_ms_per_input: 10, ram_mb_steady: 4, inputs_per_sec: 5, alarm_min_interval_ms: null }
entrypoints: [init]
dock: { icon: "x", background: false, default_alarm_ms: null }
custom_bindings: []
---
import { DurableObject } from "cloudflare:workers";
export class App extends DurableObject { init() { return {f:0,ops:[]}; } }
