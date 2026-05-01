// attack.ts — try to escape the sandbox in candidate-B and read host state.
//
// Premise: a malicious app author writes a JSON manifest. Can they:
//   1. Read other apps' state in the same process?
//   2. Read environment variables / file system?
//   3. Make outbound network calls?
//   4. Crash the host?
//
// We test against the SAME runtime.ts the harness uses. If the runtime
// fails any of these, candidate-B in its current form is unsafe.

import { loadManifestApp, type AppManifest } from "../candidate-B-manifest-sandbox/runtime.ts";

const HOST_SECRET = "if-you-can-read-this-the-sandbox-leaked";

// Simulate "another app already running with state" the attacker wants to steal.
const victim = loadManifestApp({
  manifest: { id: "victim", name: "Victim", version: "1", permissions: [], buttons: { a: "noop", b: "noop" } },
  state: { apiKey: "VICTIM_SECRET_42" },
  handlers: {
    init: "return render(state);",
    noop: "return render(state);",
    render: "return { f: 0, ops: [['txt',0,0,'victim','white']] };",
  },
});
victim.init();  // warm

const attacks: Record<string, AppManifest> = {
  "1-read-globals": {
    manifest: { id: "atk1", name: "atk1", version: "1", permissions: [], buttons: { a: "go", b: "noop" } },
    state: {},
    handlers: {
      init: "return render(state);",
      noop: "return render(state);",
      go: "var leaked = (typeof globalThis !== 'undefined') ? Object.keys(globalThis).length : -1; state.l = leaked; return render(state);",
      render: "return { f: 0, ops: [['txt',0,0,'globals=' + state.l, 'white']] };",
    },
  },
  "2-read-env": {
    manifest: { id: "atk2", name: "atk2", version: "1", permissions: [], buttons: { a: "go", b: "noop" } },
    state: {},
    handlers: {
      init: "return render(state);",
      noop: "return render(state);",
      go: "try { state.env = (typeof process !== 'undefined' && process.env) ? Object.keys(process.env).length : -1; } catch(e) { state.env = 'blocked:' + e.message; } return render(state);",
      render: "return { f: 0, ops: [['txt',0,0,'env=' + state.env, 'white']] };",
    },
  },
  "3-fetch": {
    manifest: { id: "atk3", name: "atk3", version: "1", permissions: [], buttons: { a: "go", b: "noop" } },
    state: {},
    handlers: {
      init: "return render(state);",
      noop: "return render(state);",
      go: "try { state.f = (typeof fetch === 'function') ? 'fetch-available' : 'no-fetch'; } catch(e) { state.f = 'blocked'; } return render(state);",
      render: "return { f: 0, ops: [['txt',0,0,'fetch=' + state.f, 'white']] };",
    },
  },
  "4-read-fs": {
    manifest: { id: "atk4", name: "atk4", version: "1", permissions: [], buttons: { a: "go", b: "noop" } },
    state: {},
    handlers: {
      init: "return render(state);",
      noop: "return render(state);",
      go: "try { var fs = require && require('node:fs'); state.fs = fs ? 'require-works' : 'no-require'; } catch(e) { state.fs = 'blocked:' + e.message.slice(0,40); } return render(state);",
      render: "return { f: 0, ops: [['txt',0,0,'fs=' + state.fs, 'white']] };",
    },
  },
  "5-crash-host": {
    manifest: { id: "atk5", name: "atk5", version: "1", permissions: [], buttons: { a: "go", b: "noop" } },
    state: {},
    handlers: {
      init: "return render(state);",
      noop: "return render(state);",
      go: "while(true){} return render(state);", // infinite loop
      render: "return { f: 0, ops: [['txt',0,0,'never','white']] };",
    },
  },
};

const results: Record<string, string> = {};
for (const [name, manifest] of Object.entries(attacks)) {
  if (name === "5-crash-host") {
    // Don't actually run it — note that there's no way to abort.
    results[name] = "NOT RUN (would hang process; runtime has no execution timeout)";
    continue;
  }
  try {
    const app = loadManifestApp(manifest);
    app.init();
    const f = app.onInput({ kind: "btn", id: "a", phase: "down" });
    // The render frame's text op contains the leaked value
    const leaked = (f.ops.find(o => o[0] === "txt") as any)?.[3] ?? "?";
    results[name] = `result: ${leaked}`;
  } catch (e: any) {
    results[name] = `threw: ${e.message.slice(0, 80)}`;
  }
}

// Final check: did victim's state leak across?
results["host-secret-readable"] = String(HOST_SECRET); // we can read it from outside, of course
console.log(JSON.stringify(results, null, 2));
