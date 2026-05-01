// candidate-A-do-class — counter app as a TypeScript DurableObject.
// In production this would extend DurableObject; for the experiment we
// extract the pure logic so the harness can run it without a wrangler dev server.

import type { DeskApp, Frame, Input } from "../harness/protocol.ts";

export class CounterApp implements DeskApp {
  manifest = { id: "counter", name: "Counter", version: "0.1.0" };

  // In a real DO, this would be `this.ctx.storage`. For exp-04 we hold it in memory.
  private state = { count: 0 };

  private render(): Frame {
    const c = this.state.count;
    return {
      f: c,
      ops: [
        ["clr", "black"],
        ["bnr", "COUNTER", "orange"],
        ["txt", 4, 30, "value:", "gray"],
        ["txt", 30, 80, String(c), "white", true],
        ["txt", 4, 200, "A: +1", "gray"],
        ["txt", 4, 220, "B: reset", "gray"],
      ],
    };
  }

  init(): Frame {
    return this.render();
  }

  onInput(input: Input): Frame {
    if (input.kind === "btn" && input.phase === "down") {
      if (input.id === "a") this.state.count += 1;
      if (input.id === "b") this.state.count = 0;
    }
    return this.render();
  }
}
