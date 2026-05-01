---
spec: desk.app.v0
id: bad-bg
name: Bad
version: 0.1.0
permissions: { screen: write }
budget: { cpu_ms_per_input: 10, ram_mb_steady: 4, inputs_per_sec: 5, alarm_min_interval_ms: 1000 }
entrypoints: [init, onInput]
dock: { icon: "x", background: true, default_alarm_ms: 60000 }
custom_bindings: []
---
import { DurableObject } from "cloudflare:workers";
export class App extends DurableObject { init() { return {f:0,ops:[]}; } }
