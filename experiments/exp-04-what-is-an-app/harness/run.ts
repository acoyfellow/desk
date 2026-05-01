// run.ts — drives both candidate-A and candidate-B through the same input
// script and measures: (a) frames match exactly, (b) p50/p99 input→frame
// latency, (c) lines-of-code, (d) bundle/spec size in bytes.
//
// Run with: bun run harness/run.ts

import { CounterApp } from "../candidate-A-do-class/counter.ts";
import { loadManifestApp, type AppManifest } from "../candidate-B-manifest-sandbox/runtime.ts";
import type { Frame, Input } from "./protocol.ts";
import counterJson from "../candidate-B-manifest-sandbox/counter.json" with { type: "json" };
import { readFileSync } from "node:fs";

const SCRIPT: Input[] = [
  { kind: "btn", id: "a", phase: "down" }, // 1
  { kind: "btn", id: "a", phase: "down" }, // 2
  { kind: "btn", id: "a", phase: "down" }, // 3
  { kind: "btn", id: "b", phase: "down" }, // 0
  { kind: "btn", id: "a", phase: "down" }, // 1
];

function bench(label: string, app: { init: () => Frame; onInput: (i: Input) => Frame }) {
  const samples: number[] = [];
  const frames: Frame[] = [app.init()];
  for (const inp of SCRIPT) {
    const t0 = performance.now();
    frames.push(app.onInput(inp));
    samples.push(performance.now() - t0);
  }
  // Warm + main run
  const N = 1000;
  for (let i = 0; i < N; i++) app.onInput({ kind: "btn", id: "a", phase: "down" });
  const hot: number[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    app.onInput({ kind: "btn", id: "a", phase: "down" });
    hot.push(performance.now() - t0);
  }
  hot.sort((a, b) => a - b);
  return {
    label,
    frames,
    cold_samples_ms: samples,
    p50_hot_us: hot[Math.floor(N * 0.5)] * 1000,
    p99_hot_us: hot[Math.floor(N * 0.99)] * 1000,
  };
}

const A = new CounterApp();
const B = loadManifestApp(counterJson as AppManifest);

const rA = bench("candidate-A (DO class)", A);
const rB = bench("candidate-B (manifest+sandbox)", B);

// Compare frames
let matches = 0;
for (let i = 0; i < rA.frames.length; i++) {
  if (JSON.stringify(rA.frames[i]) === JSON.stringify(rB.frames[i])) matches++;
}

// Sizes
const sizeA = readFileSync(new URL("../candidate-A-do-class/counter.ts", import.meta.url)).length;
const sizeB = readFileSync(new URL("../candidate-B-manifest-sandbox/counter.json", import.meta.url)).length;
const runtimeB = readFileSync(new URL("../candidate-B-manifest-sandbox/runtime.ts", import.meta.url)).length;

const out = {
  frame_match: `${matches}/${rA.frames.length}`,
  frames_identical: matches === rA.frames.length,
  candidate_A: {
    p50_hot_us: rA.p50_hot_us.toFixed(2),
    p99_hot_us: rA.p99_hot_us.toFixed(2),
    app_size_bytes: sizeA,
    app_lines: readFileSync(new URL("../candidate-A-do-class/counter.ts", import.meta.url), "utf8").split("\n").length,
  },
  candidate_B: {
    p50_hot_us: rB.p50_hot_us.toFixed(2),
    p99_hot_us: rB.p99_hot_us.toFixed(2),
    app_size_bytes: sizeB,
    app_lines: readFileSync(new URL("../candidate-B-manifest-sandbox/counter.json", import.meta.url), "utf8").split("\n").length,
    runtime_size_bytes: runtimeB,
  },
};

console.log(JSON.stringify(out, null, 2));
