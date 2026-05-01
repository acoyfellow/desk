// desk-fabric-exp08 — Worker Loader + DO Facets supervisor.
//
// Architecture:
//   Worker entry (default fetch) → AppRunner DO (per appId) → Facet (loaded
//   from manifest body via Worker Loader)
//
// The Worker Loader callback receives the manifest's permissions and
// constructs the WorkerCode accordingly: globalOutbound: null always,
// limits set from budget, env populated only with capability stubs the
// manifest declared.

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export interface Env {
  APP_RUNNER: DurableObjectNamespace<AppRunner>;
  LOADER: any; // Worker Loader binding — types not in @cloudflare/workers-types yet
}

// ─────────────── manifest parsing (mirrors exp-10/parse.ts, inlined) ───────────────

import * as YAML from "yaml";

interface Manifest {
  spec: "desk.app.v0";
  id: string;
  name: string;
  version: string;
  permissions: Record<string, unknown>;
  budget: {
    cpu_ms_per_input: number;
    ram_mb_steady: number;
    inputs_per_sec: number;
    alarm_min_interval_ms: number | null;
  };
  entrypoints: string[];
  dock: { icon: string; background: boolean; default_alarm_ms: number | null };
  custom_bindings: string[];
}

function parseManifest(file: string): { manifest: Manifest; source: string } {
  if (!file.startsWith("---\n")) throw new Error("manifest: missing leading ---");
  const end = file.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("manifest: missing closing ---");
  const fm = file.slice(4, end);
  const source = file.slice(end + 5);
  const m = YAML.parse(fm) as Manifest;
  if (m.spec !== "desk.app.v0") throw new Error(`manifest: bad spec ${m.spec}`);
  if (!source.includes("export class App")) throw new Error("manifest body: must export class App");
  return { manifest: m, source };
}

// ─────────────── capability bindings (one WorkerEntrypoint per permission) ───────────────
// These are what get passed to the dynamic Worker as `env`. An app that
// did NOT declare a permission gets NO reference to the corresponding
// stub — that's the entire enforcement mechanism.

interface DeskOps { ops: any[] }
interface InputEvent {
  kind: "btn" | "tilt" | "shake" | "synthetic";
  id?: "a" | "b";
  phase?: "down" | "up";
  [k: string]: any;
}

// In-memory transcript of side-effects per app, for tests to assert against.
const SIDE_EFFECTS: Record<string, any[]> = {};

function record(appId: string, ev: any) {
  (SIDE_EFFECTS[appId] ??= []).push(ev);
}

export class ScreenCap extends WorkerEntrypoint<Env, { appId: string }> {
  async frame(payload: DeskOps) {
    record(this.ctx.props.appId, { cap: "screen", ...payload });
    return { ok: true };
  }
}

export class ButtonsCap extends WorkerEntrypoint<Env, { appId: string }> {
  // Read-only — apps observe inputs via the framework, not by calling
  // this stub. It exists so the manifest's `permissions: { buttons: read }`
  // is reified as an actual binding the supervisor passes.
  async noop() { return true; }
}

export class BuzzerCap extends WorkerEntrypoint<Env, { appId: string }> {
  async tone(freq: number, ms: number) {
    record(this.ctx.props.appId, { cap: "buzzer", freq, ms });
  }
}

export class LedCap extends WorkerEntrypoint<Env, { appId: string }> {
  async set(on: boolean) {
    record(this.ctx.props.appId, { cap: "led", on });
  }
}

// ─────────────── AppRunner: the supervisor DO ───────────────

export class AppRunner extends DurableObject<Env> {
  private appId: string = "";

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "init";
    const appBody = await req.text(); // raw manifest file passed as the request body

    const { manifest, source } = parseManifest(appBody);
    this.appId = manifest.id;

    // Get a stub to the facet, loading the dynamic class if needed.
    const facet = this.ctx.facets.get("app", async () => {
      const code = this.#loadDynamicCode(manifest, source);
      const appClass = code.getDurableObjectClass("_DeskApp");
      return { class: appClass };
    });

    // For exp-08 we drive the facet via a synthetic input, then read its
    // response. The facet's class implements onInput / init by convention;
    // we surface them via fetch().
    const cmd = action === "init"
      ? { kind: "init" }
      : action === "input"
        ? { kind: "input", input: JSON.parse(url.searchParams.get("input") ?? "{}") }
        : action === "alarm"
          ? { kind: "alarm" }
          : null;
    if (!cmd) return new Response("bad action", { status: 400 });

    const facetRes = await facet.fetch(new Request("http://app/", {
      method: "POST",
      body: JSON.stringify(cmd),
    }));
    const frame = await facetRes.json();
    return Response.json({
      frame,
      side_effects: SIDE_EFFECTS[manifest.id] ?? [],
    });
  }

  #loadDynamicCode(manifest: Manifest, source: string) {
    const codeId = `${manifest.id}:${manifest.version}`;
    const ctx = this.ctx;
    return this.env.LOADER.get(codeId, async () => {
      // Build env from declared permissions only. Missing key → missing stub.
      const env: Record<string, any> = {};
      const props = { appId: manifest.id };

      // ctx.exports lookups: WorkerEntrypoint loopback bindings
      const exp = (ctx as any).exports;
      if (manifest.permissions["screen"] === "write" && exp?.ScreenCap) {
        env.SCREEN = exp.ScreenCap({ props });
      }
      if (manifest.permissions["buttons"] === "read" && exp?.ButtonsCap) {
        env.BUTTONS = exp.ButtonsCap({ props });
      }
      if (manifest.permissions["buzzer"] === "write" && exp?.BuzzerCap) {
        env.BUZZER = exp.BuzzerCap({ props });
      }
      if (manifest.permissions["led"] === "write" && exp?.LedCap) {
        env.LED = exp.LedCap({ props });
      }
      // storage:facet is automatic via DO Facets — nothing to bind.
      // imu:read, mcp.*, custom_bindings — not yet implemented in v0.

      // Custom limits from budget.
      const limits = {
        cpuMs: manifest.budget.cpu_ms_per_input,
        // Subrequests not yet wired; future for net.fetch allowlist.
      };

      // Wrap the user's class to add a uniform fetch dispatcher.
      // The user's body must `export class App extends DurableObject` and
      // typically imports DurableObject itself; we strip that to avoid
      // duplicate identifier errors.
      const stripped = source.replace(
        /^\s*import\s+\{[^}]*DurableObject[^}]*\}\s+from\s+["']cloudflare:workers["'];?\s*$/m,
        "",
      );
      const wrapper = `
        import { DurableObject } from "cloudflare:workers";
        ${stripped}
        export class _DeskApp extends App {
          async fetch(req) {
            const cmd = await req.json();
            try {
              if (cmd.kind === "init") {
                const f = await this.init();
                return Response.json(f ?? null);
              }
              if (cmd.kind === "input") {
                const f = await this.onInput(cmd.input);
                return Response.json(f ?? null);
              }
              if (cmd.kind === "alarm") {
                const f = (typeof this.alarm === "function") ? await this.alarm() : null;
                return Response.json(f ?? null);
              }
            } catch (e) {
              return Response.json({ error: String(e), stack: e.stack }, { status: 500 });
            }
            return Response.json({ error: "unknown cmd" }, { status: 400 });
          }
        }
      `;

      // DEBUG: surface the wrapper source on parse failures.
      console.log(`[exp08] loading ${codeId}, wrapper bytes=${wrapper.length}`);
      return {
        compatibilityDate: "2026-04-27",
        mainModule: "app.js",
        modules: { "app.js": wrapper },
        globalOutbound: null,        // network isolated
        env,                         // only declared capabilities
        limits,                      // CPU cap
      };
    });
  }
}

// Override the DO's class export to reference _DeskApp instead of App.
// (Worker Loader's getDurableObjectClass takes the exported NAME of the
// class; we wrap user's `App` as `_DeskApp`.)

// We need to fix _loadDynamicCode to ask for "_DeskApp" not "App":
// see `getDurableObjectClass("_DeskApp")` — applied below in worker entry.

// ─────────────── Worker entry ───────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return new Response("ok\n");

    // POST /run?app=<id>&action=init|input|alarm  body=<manifest.md raw>
    if (req.method === "POST" && url.pathname === "/run") {
      const appId = url.searchParams.get("app") ?? "default";
      const id = env.APP_RUNNER.idFromName(appId);
      const stub = env.APP_RUNNER.get(id);
      return stub.fetch(req);
    }

    // GET /side-effects?app=<id> — reset side-effect log
    if (url.pathname === "/side-effects") {
      const appId = url.searchParams.get("app") ?? "default";
      const ev = SIDE_EFFECTS[appId] ?? [];
      if (url.searchParams.get("clear") === "1") delete SIDE_EFFECTS[appId];
      return Response.json(ev);
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
