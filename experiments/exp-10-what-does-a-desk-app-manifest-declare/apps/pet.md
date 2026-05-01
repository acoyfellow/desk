---
spec: desk.app.v0
id: pet
name: Pet
version: 0.1.0
author: the operator@coey.dev
description: |
  Tamagotchi-flavored proof of background apps. The pet's happiness
  decays by 1 every alarm tick (default 1h). Press A to feed (resets
  happiness to 100). If happiness reaches 0, screen shows a sad face
  and the LED stops blinking.

permissions:
  screen: write
  buttons: read
  led: write
  storage: facet

budget:
  cpu_ms_per_input: 30
  ram_mb_steady: 4
  inputs_per_sec: 5
  alarm_min_interval_ms: 60000   # at most once a minute

entrypoints:
  - init
  - onInput
  - onAlarm

dock:
  icon: ":3"
  background: true               # keeps decaying even when dock is foregrounded
  default_alarm_ms: 3600000      # 1 hour between decay ticks

custom_bindings: []
---

import { DurableObject } from "cloudflare:workers";

const DECAY_MS = 3600000;

export class App extends DurableObject {
  init() {
    if (this.ctx.storage.kv.get("happy") == null) {
      this.ctx.storage.kv.put("happy", 100);
      this.ctx.storage.kv.put("born", Date.now());
    }
    this.ctx.storage.setAlarm(Date.now() + DECAY_MS);
    return this.render();
  }

  onInput(input) {
    if (input.kind === "btn" && input.phase === "down" && input.id === "a") {
      this.ctx.storage.kv.put("happy", 100);
    }
    return this.render();
  }

  async alarm() {
    let happy = this.ctx.storage.kv.get("happy") ?? 0;
    happy = Math.max(0, happy - 1);
    this.ctx.storage.kv.put("happy", happy);
    if (happy > 0) {
      this.ctx.storage.setAlarm(Date.now() + DECAY_MS);
    }
    return this.render();
  }

  render() {
    const happy = this.ctx.storage.kv.get("happy") ?? 0;
    const face = happy > 60 ? ":D" : happy > 20 ? ":|" : happy > 0 ? ":(" : "x_x";
    const color = happy > 60 ? "green" : happy > 20 ? "yellow" : "red";
    return {
      f: happy,
      ops: [
        ["clr", "black"],
        ["bnr", "PET", "magenta"],
        ["txt", 30, 70, face, color, true],
        ["txt", 4, 140, "happy: " + happy, "white"],
        ["txt", 4, 200, "A: feed", "gray"],
        ["led", happy > 0 ? "on" : "off", 0],
      ],
    };
  }
}
