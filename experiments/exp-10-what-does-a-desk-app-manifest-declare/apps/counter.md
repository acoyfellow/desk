---
spec: desk.app.v0
id: counter
name: Counter
version: 0.1.0
author: the operator@coey.dev
description: |
  Minimal demo app. Press A to increment, B to reset. Value persists
  across device reboots via the facet's isolated SQLite.

permissions:
  screen: write
  buttons: read
  storage: facet

budget:
  cpu_ms_per_input: 20
  ram_mb_steady: 4
  inputs_per_sec: 10
  alarm_min_interval_ms: null

entrypoints:
  - init
  - onInput

dock:
  icon: "+"
  background: false
  default_alarm_ms: null

custom_bindings: []
---

import { DurableObject } from "cloudflare:workers";

export class App extends DurableObject {
  init() {
    const count = this.ctx.storage.kv.get("count") ?? 0;
    return this.render(count);
  }

  onInput(input) {
    let count = this.ctx.storage.kv.get("count") ?? 0;
    if (input.kind === "btn" && input.phase === "down") {
      if (input.id === "a") count += 1;
      if (input.id === "b") count = 0;
      this.ctx.storage.kv.put("count", count);
    }
    return this.render(count);
  }

  render(count) {
    return {
      f: count,
      ops: [
        ["clr", "black"],
        ["bnr", "COUNTER", "orange"],
        ["txt", 4, 30, "value:", "gray"],
        ["txt", 30, 80, String(count), "white", true],
        ["txt", 4, 200, "A: +1", "gray"],
        ["txt", 4, 220, "B: reset", "gray"],
      ],
    };
  }
}
