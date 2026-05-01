---
spec: desk.app.v0
id: not-do
name: Not
version: 0.1.0
permissions: { screen: write }
budget: { cpu_ms_per_input: 10, ram_mb_steady: 4, inputs_per_sec: 5, alarm_min_interval_ms: null }
entrypoints: [init]
dock: { icon: "x", background: false, default_alarm_ms: null }
custom_bindings: []
---
export const App = { hello() {} };
