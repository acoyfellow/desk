// runtime.ts — runs a candidate-B JSON-manifest app inside an isolated function.
//
// Sandbox model: each handler runs as a `new Function('state','render', body)`.
// State is a plain object passed in — handlers mutate it. `render` is a
// closure over the sandbox.
//
// Threat note: `new Function` is NOT a real sandbox. Production candidate-B
// would use a real isolate (QuickJS-in-Worker, V8 isolate boundaries via
// Workers for Platforms, etc.). Here we just measure ergonomics.

import type { DeskApp, Frame, Input } from "../harness/protocol.ts";

export interface AppManifest {
  manifest: { id: string; name: string; version: string;
              permissions: string[]; buttons: Record<string, string> };
  state: Record<string, unknown>;
  handlers: Record<string, string>;
}

export function loadManifestApp(spec: AppManifest): DeskApp {
  const state = structuredClone(spec.state);
  const buttons = spec.manifest.buttons;

  // Compile each handler body into a function closing over `state` and the
  // shared `render` closure. Render itself is one of the handlers.
  const renderFn = new Function("state", spec.handlers.render);
  function render(s: typeof state): Frame { return renderFn(s) as Frame; }

  const compiled: Record<string, () => Frame> = {};
  for (const [name, body] of Object.entries(spec.handlers)) {
    if (name === "render") continue;
    const fn = new Function("state", "render", body);
    compiled[name] = () => fn(state, render) as Frame;
  }

  return {
    manifest: spec.manifest,
    init() { return compiled.init(); },
    onInput(input: Input): Frame {
      if (input.kind !== "btn" || input.phase !== "down") return render(state);
      const action = buttons[input.id];
      if (!action || !compiled[action]) return render(state);
      return compiled[action]();
    },
  };
}
