// protocol.ts — the desk frame protocol used by all exp-04 candidates.
// Tiny on purpose. JSON. Frames are delta-style; runtime maintains the screen.
//
// This file is the SHARED contract. All three candidates render to it.

export type Color =
  | "black" | "white" | "red" | "green" | "blue"
  | "cyan" | "magenta" | "yellow" | "orange" | "gray"
  | `#${string}`;

export type Op =
  | ["clr", Color]
  | ["bnr", string, Color]
  | ["txt", number, number, string, Color, boolean?]   // x, y, text, color, big?
  | ["rect", number, number, number, number, Color]
  | ["fill", number, number, number, number, Color]
  | ["led", "on" | "off" | "blink", number?]
  | ["buz", number, number];                            // freq, ms

export interface Frame {
  f: number;          // monotonic frame number from the app
  ops: Op[];          // render commands, in order
}

export type Input =
  | { kind: "btn"; id: "a" | "b"; phase: "down" | "up" | "hold" }
  | { kind: "shake"; g: number }
  | { kind: "tilt"; x: number; y: number; z: number };

// Every "app" must implement this:
export interface DeskApp {
  manifest: { id: string; name: string; version: string };
  init(): Frame | Promise<Frame>;
  onInput(input: Input): Frame | Promise<Frame>;
}
