// desk-fabric-exp13 — exp-08's fabric, but reading apps from Artifacts via isomorphic-git.
//
// One change from exp-08: instead of POSTing the manifest body in the request,
// the request says only "load app id 'counter', version 'latest'", and the
// fabric pulls the file from the live `desk/apps` Artifacts repo.

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ArtifactsAppSource } from "./ArtifactsAppSource";
import type { AppFile } from "./AppSource";
// Inlined at build-time via wrangler's Text rule (see wrangler.jsonc).
// Served at GET /viewer; the operator can drive desk from any browser.
import VIEWER_HTML from "./viewer.html";

export interface Env {
  APP_RUNNER: DurableObjectNamespace<AppRunner>;
  MCP_OBJECT: DurableObjectNamespace<DeskMcp>;
  LOADER: any;
  DESK_APPS_REPO_REMOTE: string;
  DESK_APPS_REPO_TOKEN: string;
  /**
   * Shared secret. Every device-facing request must present this as
   * `Authorization: Bearer <token>`. Set via `wrangler secret put`.
   * Also used to gate MCP `/mcp` access — any agent given the token
   * can drive desk via MCP.
   */
  DESK_DEVICE_TOKEN: string;
}

/** Constant-time-ish bearer check. Catches the common public-internet probe. */
function authOk(req: Request, env: Env): boolean {
  const expected = env.DESK_DEVICE_TOKEN;
  if (!expected) return false;  // fail-closed if secret is missing
  const got = req.headers.get("Authorization") ?? "";
  if (!got.startsWith("Bearer ")) return false;
  const presented = got.slice(7);
  // Length-mismatch fast path; constant-time compare otherwise.
  if (presented.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  }
  return mismatch === 0;
}

const SIDE_EFFECTS: Record<string, any[]> = {};
function record(appId: string, ev: any) { (SIDE_EFFECTS[appId] ??= []).push(ev); }

// F-7 fix: module-scope, lazy-initialized AppSource.
// Workers keep module state across requests within an isolate, so the
// MemoryFS + cloned repo persist. First request clones (~900ms);
// subsequent requests do incremental fetch only.
let _source: ArtifactsAppSource | null = null;
function getSource(env: Env): ArtifactsAppSource {
  if (!_source) {
    _source = new ArtifactsAppSource({
      remote: env.DESK_APPS_REPO_REMOTE,
      tokenSecret: env.DESK_APPS_REPO_TOKEN.split("?expires=")[0],
    });
  }
  return _source;
}

export class ScreenCap extends WorkerEntrypoint<Env, { appId: string }> {
  async frame(payload: any) { record(this.ctx.props.appId, { cap: "screen", ...payload }); return { ok: true }; }
}
export class ButtonsCap extends WorkerEntrypoint<Env, { appId: string }> {
  async noop() { return true; }
}
export class BuzzerCap extends WorkerEntrypoint<Env, { appId: string }> {
  async tone(freq: number, ms: number) { record(this.ctx.props.appId, { cap: "buzzer", freq, ms }); }
}
export class LedCap extends WorkerEntrypoint<Env, { appId: string }> {
  async set(on: boolean) { record(this.ctx.props.appId, { cap: "led", on }); }
}

// ============================================================
// Text wrapping helper — used by elicit + answered screens.
// Splits a string on word boundaries into lines of <= width chars.
// Single words longer than width get hard-broken.
function wrapToWidth(s: string, width: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!w) continue;
    // Hard-break a word that's longer than width
    let word = w;
    while (word.length > width) {
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!cur) { cur = word; continue; }
    if (cur.length + 1 + word.length <= width) cur += " " + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ============================================================
// Elicit takeover — cross-app concern handled at the supervisor level.
//
// When an MCP tool calls `desk.elicit(question, options)`, we write a
// pending entry into the AppRunner DO keyed by appId=`elicit`. The M5's
// dock-auto-refresh + per-/run path checks for pending elicit BEFORE
// dispatching to the requested app, and renders the elicit screen instead.
// Once the user presses A/B, we write the answer back and the MCP tool's
// poll loop picks it up.
// ============================================================

type ElicitRequest = {
  id: string;          // unique per call
  question: string;
  options: string[];   // 2-3 options; A picks options[0], B picks options[1], etc.
  expires_at: number;  // wall-clock ms
};

type ElicitAnswer = {
  id: string;
  choice: string;
  answered_at: number;
};

type Notification = {
  id: string;
  text: string;
  level: "info" | "warn" | "error";
  created_at: number;
  read: boolean;
};

type Observation = {
  title: string;
  body?: string;
  repo?: string;
  phase?: string;
  level: "info" | "warn" | "error";
  updated_at: number;
  expires_at: number;
};

type ConsoleProgram = {
  code: string;
  updated_at: number;
  status: "ready" | "error";
  last_error?: string;
};

export class AppRunner extends DurableObject<Env> {
  // Pending elicit (only one at a time — if a new one arrives, it replaces).
  // Lives in DO storage so it survives restarts.
  async putPendingElicit(req: ElicitRequest): Promise<void> {
    await this.ctx.storage.put("_elicit_pending", req);
    await this.ctx.storage.delete("_elicit_answer");
  }

  async getPendingElicit(): Promise<ElicitRequest | null> {
    const r = await this.ctx.storage.get<ElicitRequest>("_elicit_pending");
    if (!r) return null;
    if (Date.now() > r.expires_at) {
      await this.ctx.storage.delete("_elicit_pending");
      return null;
    }
    return r;
  }

  async getElicitAnswer(): Promise<ElicitAnswer | null> {
    return (await this.ctx.storage.get<ElicitAnswer>("_elicit_answer")) ?? null;
  }

  async resolveElicit(id: string, choice: string): Promise<void> {
    const pending = await this.getPendingElicit();
    if (!pending || pending.id !== id) return;
    await this.ctx.storage.put("_elicit_answer", {
      id, choice, answered_at: Date.now(),
    });
    await this.ctx.storage.delete("_elicit_pending");
  }

  // ── Notifications: lightweight queue. Newest first. Capped at 50.
  async pushNotification(text: string, level: "info" | "warn" | "error"): Promise<string> {
    const note: Notification = {
      id: crypto.randomUUID(),
      text: text.slice(0, 200),
      level,
      created_at: Date.now(),
      read: false,
    };
    const queue = ((await this.ctx.storage.get<Notification[]>("_notifications")) ?? []);
    queue.unshift(note);
    while (queue.length > 50) queue.pop();
    await this.ctx.storage.put("_notifications", queue);
    return note.id;
  }

  async getNotifications(): Promise<Notification[]> {
    return (await this.ctx.storage.get<Notification[]>("_notifications")) ?? [];
  }

  async unreadCount(): Promise<number> {
    const q = await this.getNotifications();
    return q.filter(n => !n.read).length;
  }

  async markAllRead(): Promise<void> {
    const q = await this.getNotifications();
    for (const n of q) n.read = true;
    await this.ctx.storage.put("_notifications", q);
  }

  async putObservation(obs: Omit<Observation, "updated_at" | "expires_at"> & { ttl_seconds: number }): Promise<Observation> {
    const now = Date.now();
    const cur: Observation = {
      title: obs.title.slice(0, 40),
      body: obs.body?.slice(0, 120),
      repo: obs.repo?.slice(0, 32),
      phase: obs.phase?.slice(0, 32),
      level: obs.level,
      updated_at: now,
      expires_at: now + Math.max(5, Math.min(3600, obs.ttl_seconds)) * 1000,
    };
    await this.ctx.storage.put("_observation", cur);
    return cur;
  }

  async getObservation(): Promise<Observation | null> {
    const obs = await this.ctx.storage.get<Observation>("_observation");
    if (!obs) return null;
    if (Date.now() > obs.expires_at) {
      await this.ctx.storage.delete("_observation");
      return null;
    }
    return obs;
  }

  async putConsoleCode(code: string): Promise<ConsoleProgram> {
    const program: ConsoleProgram = {
      code: code.slice(0, 12000),
      updated_at: Date.now(),
      status: "ready",
    };
    await this.ctx.storage.put("_console_program", program);
    return program;
  }

  async getConsoleCode(): Promise<ConsoleProgram | null> {
    return (await this.ctx.storage.get<ConsoleProgram>("_console_program")) ?? null;
  }

  async putConsoleError(message: string): Promise<void> {
    const cur = await this.getConsoleCode();
    await this.ctx.storage.put("_console_program", {
      code: cur?.code ?? "",
      updated_at: Date.now(),
      status: "error",
      last_error: message.slice(0, 500),
    } satisfies ConsoleProgram);
  }

  // ── Volume target: 0=mute, 1=quiet, 2=loud. Stored in DO storage and
  //    surfaced on /list so the M5 picks it up on its next dock-refresh
  //    poll (~10s). The device persists volume locally too — this is the
  //    *requested* level from the worker; device side decides idempotency.
  async getVolumeTarget(): Promise<number | null> {
    const v = await this.ctx.storage.get<number>("_volume_target");
    return typeof v === "number" ? v : null;
  }

  async setVolumeTarget(level: number): Promise<number> {
    const v = Math.max(0, Math.min(2, Math.floor(level)));
    await this.ctx.storage.put("_volume_target", v);
    return v;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const diagHeader = req.headers.get("x-desk-diag");
    if (diagHeader) {
      try { await this.ctx.storage.put("_diag_last_request", JSON.parse(diagHeader)); }
      catch { await this.ctx.storage.put("_diag_last_request", { raw: diagHeader }); }
    }
    const appId = url.searchParams.get("app") ?? "";
    const version = url.searchParams.get("version") ?? "latest";
    const action = url.searchParams.get("action") ?? "init";

    if (!appId) return new Response("missing ?app=", { status: 400 });

    // ── INBOX TAKEOVER: blocking questions and unread notifications share
    //    one device surface. notify is non-blocking for agents; elicit waits.
    const pending = await this.getPendingElicit();
    const queue = await this.getNotifications();
    const unreadNotice = queue.find(n => !n.read);
    const observation = await this.getObservation();
    if (appId === "diag") {
      const diag = {
        now: new Date().toISOString(),
        app_runner: "singleton",
        request: (await this.ctx.storage.get("_diag_last_request")) ?? null,
      };
      return Response.json({ frame: { f: Date.now(), diag } });
    }
    if ((pending || unreadNotice) && appId !== "inbox" && action !== "alarm") {
      return Response.json({
        frame: pending ? this.#renderElicit(pending) : this.#renderNotice(unreadNotice!),
        meta: pending ? { takeover: "inbox", kind: "ask", elicit_id: pending.id } : { takeover: "inbox", kind: "notify", notify_id: unreadNotice!.id },
      });
    }

    // ── Special path: appId === "console" — MCP-fed code runner.
    // The code is JavaScript because Worker Loader already gives us the
    // real sandbox. If it throws, the device shows the error and B returns
    // to dock; the next MCP console_push replaces it.
    if (appId === "console") {
      if (action === "init" || action === "input") {
        const program = await this.getConsoleCode();
        if (!program?.code) {
          return Response.json({ frame: { f: 0, ops: [
            ["clr", "black"],
            ["bnr", "CONSOLE", "green"],
            ["txt", 4, 48, "waiting for", "gray"],
            ["txt", 4, 66, "MCP code...", "gray"],
            ["txt", 4, 202, "send via", "dim"],
            ["txt", 4, 218, "desk.console", "cyan"],
          ] } });
        }
        const appFile: AppFile = {
          source: program.code,
          contentHash: "console-" + program.updated_at,
          resolvedVersion: "mcp",
          manifest: {
            id: "console",
            version: String(program.updated_at),
            permissions: { screen: "write", buttons: "read", buzzer: "write", led: "write" },
            budget: { cpu_ms_per_input: 100 },
          },
        } as any;
        try {
          const facet = this.ctx.facets.get(`console-${program.updated_at}`, async () => {
            const code = this.#loadDynamicCode(appFile);
            const appClass = code.getDurableObjectClass("_DeskApp");
            return { class: appClass };
          });
          const cmd = action === "init" ? { kind: "init" }
            : { kind: "input", input: JSON.parse(url.searchParams.get("input") ?? "{}") };
          const facetRes = await facet.fetch(new Request("http://app/", {
            method: "POST",
            body: JSON.stringify(cmd),
          }));
          const text = await facetRes.text();
          let frame: any;
          try { frame = JSON.parse(text); } catch { frame = { error: "non-json: " + text.slice(0, 100) }; }
          if (!facetRes.ok || frame?.error) {
            const msg = frame?.error ? String(frame.error) : text.slice(0, 200);
            await this.putConsoleError(msg);
            return Response.json({ frame: this.#renderConsoleError(msg) });
          }
          return Response.json({ frame, meta: { system: "console", updated_at: program.updated_at } });
        } catch (err: any) {
          const msg = `${err?.name ?? "Error"}: ${err?.message ?? String(err)}`;
          await this.putConsoleError(msg);
          return Response.json({ frame: this.#renderConsoleError(msg) });
        }
      }
    }

    // ── Special path: appId === "inbox" — all human communication
    if (appId === "inbox") {
      if (action === "init") {
        if (!pending && unreadNotice) return Response.json({ frame: this.#renderNotice(unreadNotice) });
        if (!pending && observation) return Response.json({ frame: this.#renderObservation(observation) });
        if (!pending) return Response.json({ frame: this.#renderNotify(queue) });
        return Response.json({ frame: this.#renderElicit(pending) });
      }
      if (action === "input") {
        const input = JSON.parse(url.searchParams.get("input") ?? "{}");
        if (input.kind === "btn" && !pending) {
          await this.markAllRead();
          return Response.json({ done: true, frame: this.#renderNotify(await this.getNotifications()) });
        }
        if (input.kind === "btn" && pending) {
          // A = options[0], B = options[1], (long-A = options[2] if exists)
          let choice: string | null = null;
          if (input.id === "a" && input.phase === "down") choice = pending.options[0] ?? null;
          if (input.id === "a" && input.phase === "long") choice = pending.options[2] ?? pending.options[0] ?? null;
          // (B is back-to-dock at the runtime layer; never reaches here for elicit)
          if (choice !== null) {
            await this.resolveElicit(pending.id, choice);
            // Render the choice fitting the screen.
            // big font (2x) holds 8 chars across at x=4.
            // small font (1x) holds 16 chars; wrap to 2 lines if needed.
            const ops: any[] = [
              ["clr", "black"],
              ["bnr", "ANSWERED", "green"],
              ["txt", 4, 50, "chose:", "gray"],
            ];
            if (choice.length <= 8) {
              // fits in big font
              ops.push(["txt", 4, 80, choice, "white", true]);
            } else {
              // wrap to small font across up to 2 lines
              const lines = wrapToWidth(choice, 16).slice(0, 2);
              let y = 80;
              for (const line of lines) {
                ops.push(["txt", 4, y, line, "white"]);
                y += 18;
              }
            }
            ops.push(["txt", 4, 200, "B = back", "gray"]);
            ops.push(["buz", 2400, 60]);
            return Response.json({ frame: { f: 1, ops } });
          }
        }
        // Fallthrough: no pending elicit, or input wasn't a recognized choice.
        // Re-render whatever the right idle state is (placeholder if nothing pending).
        if (pending) {
          return Response.json({ frame: this.#renderElicit(pending) });
        }
        return Response.json({
          frame: { f: 0, ops: [
            ["clr", "black"],
            ["bnr", "INBOX", "orange"],
            ["txt", 4, 60, "all caught up", "gray"],
            ["txt", 4, 80, "no messages", "gray"],
            ["txt", 4, 200, "B = back to dock", "gray"],
          ]},
        });
      }
    }

    // ── Load app source from Artifacts (module-scoped, F-7) ──
    const source = getSource(this.env);

    let appFile: AppFile;
    const t0 = Date.now();
    try {
      appFile = await source.get({ id: appId, version });
    } catch (e: any) {
      return Response.json({ error: `AppSource.get: ${e.message}` }, { status: 404 });
    }
    const fetchMs = Date.now() - t0;

    const facet = this.ctx.facets.get(`app-${appFile.contentHash.slice(0, 8)}`, async () => {
      console.log(`[fabric] loading facet for ${appId}@${appFile.resolvedVersion} sha=${appFile.contentHash.slice(0,8)}`);
      const code = this.#loadDynamicCode(appFile);
      const appClass = code.getDurableObjectClass("_DeskApp");
      return { class: appClass };
    });

    const cmd = action === "init" ? { kind: "init" }
      : action === "input" ? { kind: "input", input: JSON.parse(url.searchParams.get("input") ?? "{}") }
      : action === "alarm" ? { kind: "alarm" }
      : null;
    if (!cmd) return new Response("bad action", { status: 400 });

    let frame: unknown;
    try {
      const facetRes = await facet.fetch(new Request("http://app/", {
        method: "POST",
        body: JSON.stringify(cmd),
      }));
      const text = await facetRes.text();
      console.log(`[fabric] facet returned status=${facetRes.status} body=${text.slice(0,200)}`);
      try { frame = JSON.parse(text); } catch { frame = { error: "non-json: " + text.slice(0,100) }; }
    } catch (err: any) {
      console.log(`[fabric] facet.fetch THREW: ${err?.name}: ${err?.message}\n${err?.stack?.slice(0,500)}`);
      return Response.json({ error: "facet_threw", name: err?.name, message: err?.message }, { status: 500 });
    }
    return Response.json({
      frame,
      side_effects: SIDE_EFFECTS[appId] ?? [],
      meta: {
        version: appFile.resolvedVersion,
        contentHash: appFile.contentHash,
        sourceFetchMs: fetchMs,
      },
    });
  }

  #renderNotice(n: Notification) {
    const color = n.level === "error" ? "red" : n.level === "warn" ? "yellow" : "white";
    const ops: any[] = [["clr", "black"], ["bnr", "INBOX", "cyan"]];
    let y = 42;
    for (const line of wrapToWidth(n.text, 16).slice(0, 7)) {
      ops.push(["txt", 4, y, line, color]);
      y += 18;
    }
    ops.push(["txt", 4, 200, "A: ok", "gray"]);
    ops.push(["txt", 4, 218, "B: back", "gray"]);
    return { f: n.created_at, ops };
  }

  #renderObservation(obs: Observation) {
    const color = obs.level === "error" ? "red" : obs.level === "warn" ? "yellow" : "white";
    const ops: any[] = [["clr", "black"], ["bnr", "OBSERVE", "magenta"]];
    let y = 38;
    ops.push(["txt", 4, y, obs.title, color]); y += 22;
    if (obs.repo) { ops.push(["txt", 4, y, obs.repo, "gray"]); y += 18; }
    if (obs.phase) { ops.push(["txt", 4, y, obs.phase, "cyan"]); y += 18; }
    if (obs.body) {
      for (const line of wrapToWidth(obs.body, 16).slice(0, 4)) {
        ops.push(["txt", 4, y, line, "white"]); y += 16;
      }
    }
    const age = Math.max(0, Math.floor((Date.now() - obs.updated_at) / 1000));
    ops.push(["txt", 4, 200, "updated " + age + "s ago", "dim"]);
    ops.push(["txt", 4, 218, "B: back", "gray"]);
    return { f: obs.updated_at, ops };
  }

  #renderConsoleError(message: string) {
    const ops: any[] = [["clr", "black"], ["bnr", "CONSOLE ERR", "red"]];
    let y = 42;
    for (const line of wrapToWidth(message, 16).slice(0, 7)) {
      ops.push(["txt", 4, y, line, "white"]);
      y += 18;
    }
    ops.push(["txt", 4, 202, "fix via MCP", "gray"]);
    ops.push(["txt", 4, 218, "B: back", "gray"]);
    ops.push(["buz", 220, 120]);
    return { f: Date.now(), ops };
  }

  #renderNotify(queue: Notification[]) {
    const ops: any[] = [
      ["clr", "black"],
      ["bnr", "INBOX", "cyan"],
    ];
    if (queue.length === 0) {
      ops.push(["txt", 4, 90, "all caught up", "gray"]);
      ops.push(["txt", 4, 110, "no messages", "gray"]);
      ops.push(["txt", 4, 218, "B: back", "gray"]);
      return { f: 0, ops };
    }
    if (!queue.some(n => !n.read)) {
      ops.push(["txt", 4, 90, "all caught up", "gray"]);
      ops.push(["txt", 4, 110, String(queue.length) + " read", "gray"]);
      ops.push(["txt", 4, 218, "B: back", "gray"]);
      return { f: queue.length, ops };
    }
    let y = 32;
    for (const n of queue.slice(0, 8)) {
      const color = n.read ? "gray" : (n.level === "error" ? "red" : n.level === "warn" ? "yellow" : "white");
      const lines = wrapToWidth(n.text, 16).slice(0, 1);
      const dot = n.read ? " " : "•";
      ops.push(["txt", 4, y, dot + " " + lines[0], color]);
      y += 18;
      if (y > 180) break;
    }
    ops.push(["txt", 4, 200, "A: mark read", "gray"]);
    ops.push(["txt", 4, 218, "B: back", "gray"]);
    return { f: queue.length, ops };
  }

  #loadDynamicCode(appFile: AppFile) {
    const m = appFile.manifest as any;
    const codeId = `${m.id}:${m.version}:${appFile.contentHash.slice(0, 8)}`;
    const ctx = this.ctx;

    return this.env.LOADER.get(codeId, async () => {
      const env: Record<string, any> = {};
      const props = { appId: m.id };
      const exp = (ctx as any).exports;

      if (m.permissions?.screen === "write" && exp?.ScreenCap) env.SCREEN = exp.ScreenCap({ props });
      if (m.permissions?.buttons === "read" && exp?.ButtonsCap) env.BUTTONS = exp.ButtonsCap({ props });
      if (m.permissions?.buzzer === "write" && exp?.BuzzerCap) env.BUZZER = exp.BuzzerCap({ props });
      if (m.permissions?.led === "write" && exp?.LedCap) env.LED = exp.LedCap({ props });

      const stripped = appFile.source.replace(
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
              if (cmd.kind === "init")  return Response.json((await this.init()) ?? null);
              if (cmd.kind === "input") return Response.json((await this.onInput(cmd.input)) ?? null);
              if (cmd.kind === "alarm" && typeof this.alarm === "function") {
                return Response.json((await this.alarm()) ?? null);
              }
            } catch (e) {
              return Response.json({ error: String(e), stack: e.stack }, { status: 500 });
            }
            return Response.json({ error: "unknown cmd" }, { status: 400 });
          }
        }
      `;

      return {
        compatibilityDate: "2026-04-27",
        mainModule: "app.js",
        modules: { "app.js": wrapper },
        globalOutbound: null,
        env,
        limits: { cpuMs: m.budget?.cpu_ms_per_input ?? 50 },
      };
    });
  }

  #renderElicit(req: ElicitRequest) {
    const ops: any[] = [
      ["clr", "black"],
      ["bnr", "INBOX", "orange"],
    ];
    let y = 32;
    for (const line of wrapToWidth(req.question, 16).slice(0, 6)) {
      ops.push(["txt", 4, y, line, "white"]);
      y += 14;
    }
    // Options at bottom. "A: xxx" prefix is 3 chars, leaving 13 for the option label.
    if (req.options[0]) ops.push(["txt", 4, 184, "A: " + req.options[0].slice(0, 13), "green"]);
    if (req.options[1]) ops.push(["txt", 4, 200, "   " + req.options[1].slice(0, 13), "gray"]);
    // "hold A: xxx" prefix is 8 chars, leaving 8 for the option label.
    if (req.options[2]) ops.push(["txt", 4, 218, "hold A: " + req.options[2].slice(0, 8), "yellow"]);
    ops.push(["buz", 2200, 80]);
    return { f: 0, ops };
  }
}

// ============================================================
// MCP server. Mounted at /mcp/*.
// Exposes desk.elicit — a human-in-the-loop tool that pushes a question
// to the M5 and returns the user's button choice.
// ============================================================

export class DeskMcp extends McpAgent<Env> {
  server = new McpServer({ name: "desk", version: "0.1.0" });

  async init() {
    this.server.tool(
      "ask",
      "Ask the human a question via their desk device inbox. Returns their chosen option. The user has up to 60 seconds to answer; otherwise returns timeout.",
      {
        question: z.string().describe("The question to display on the device screen. Keep under ~80 chars; longer text wraps."),
        options: z.array(z.string()).min(1).max(3).describe(
          "1-3 short options. options[0] = A button. options[1] (optional) = shown but unselectable (use only if you want a 'cancel' visible). options[2] (optional) = long-press A."
        ),
        timeout_seconds: z.number().min(1).max(120).default(60).describe("How long to wait for the user."),
      },
      async ({ question, options, timeout_seconds }) => {
        const elicitId = crypto.randomUUID();
        const pending: ElicitRequest = {
          id: elicitId,
          question,
          options,
          expires_at: Date.now() + timeout_seconds * 1000,
        };

        // Write the question into the AppRunner DO. We use idFromName("singleton")
        // because for now there's one M5 per fabric — elicit is global, not per-app.
        const runnerId = this.env.APP_RUNNER.idFromName("singleton");
        const runner = this.env.APP_RUNNER.get(runnerId);
        await runner.putPendingElicit(pending);

        // Poll for the answer. 250ms cadence — same as exp-17 spike that worked.
        const deadline = Date.now() + timeout_seconds * 1000;
        let polls = 0;
        while (Date.now() < deadline) {
          polls++;
          const ans = await runner.getElicitAnswer();
          if (ans && ans.id === elicitId) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  choice: ans.choice,
                  polls,
                  elapsed_ms: Date.now() - (deadline - timeout_seconds * 1000),
                }),
              }],
            };
          }
          await new Promise(r => setTimeout(r, 250));
        }
        return {
          isError: true,
          content: [{
            type: "text",
            text: `timeout after ${timeout_seconds}s; user did not answer`,
          }],
        };
      },
    );

    this.server.tool(
      "inbox",
      "Send a non-blocking notification to the user's device inbox. Use for status updates, completion announcements, errors. Keep text short (<200 chars).",
      {
        text: z.string().describe("The notification text. Wraps on the device."),
        level: z.enum(["info", "warn", "error"]).default("info").describe("Visual urgency."),
      },
      async ({ text, level }) => {
        const runner = this.env.APP_RUNNER.get(this.env.APP_RUNNER.idFromName("singleton"));
        const id = await runner.pushNotification(text, level);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ok: true, id, queued: text }),
          }],
        };
      },
    );

    this.server.tool(
      "observe",
      "Update the device with ambient agent activity. Non-blocking; use to show what an agent is doing without asking for input.",
      {
        title: z.string().min(1).max(40).describe("Short status title."),
        body: z.string().max(120).optional().describe("Optional detail text."),
        repo: z.string().max(32).optional().describe("Repo/project name."),
        phase: z.string().max(32).optional().describe("Current phase, e.g. reading, editing, testing."),
        level: z.enum(["info", "warn", "error"]).default("info"),
        ttl_seconds: z.number().min(5).max(3600).default(120),
      },
      async ({ title, body, repo, phase, level, ttl_seconds }) => {
        const runner = this.env.APP_RUNNER.get(this.env.APP_RUNNER.idFromName("singleton"));
        const obs = await runner.putObservation({ title, body, repo, phase, level, ttl_seconds });
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, observe: obs }) }] };
      },
    );

    this.server.tool(
      "console",
      "Replace the code for the on-device Console app. Open the Console app on the device to run it. Code is a desk app class body in JavaScript: export class App { async init() { return { f: 0, ops: [[\"bnr\",\"HI\"]] } } async onInput(input) { ... } }. If it fails, the device shows the error and returns to dock normally.",
      {
        code: z.string().min(1).max(12000).describe("JavaScript desk app source. Must export class App with init() and optional onInput(input). Return {f, ops} frames."),
      },
      async ({ code }) => {
        const runner = this.env.APP_RUNNER.get(this.env.APP_RUNNER.idFromName("singleton"));
        const program = await runner.putConsoleCode(code);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ok: true, app: "console", updated_at: program.updated_at, bytes: program.code.length, note: "open Console on the device to run" }),
          }],
        };
      },
    );

    this.server.tool(
      "set_volume",
      "Set the device buzzer volume. 0=mute (office mode), 1=quiet, 2=loud. Persists across reboots; the device picks up the change on its next dock-refresh poll (~10s).",
      {
        level: z.number().int().min(0).max(2).describe("0=mute, 1=quiet, 2=loud"),
      },
      async ({ level }) => {
        const runner = this.env.APP_RUNNER.get(this.env.APP_RUNNER.idFromName("singleton"));
        const v = await runner.setVolumeTarget(level);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: true,
              volume_target: v,
              label: ["mute", "quiet", "loud"][v],
              note: "device will sync on next /list poll (~10s)",
            }),
          }],
        };
      },
    );

    // Sanity tool — useful for verifying any agent connected correctly.
    this.server.tool(
      "echo",
      "Echo text back. Confirms the desk MCP server is reachable.",
      { text: z.string() },
      async ({ text }) => ({
        content: [{ type: "text", text: `desk says: ${text}` }],
      }),
    );
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Public, no-auth: liveness probe only.
    if (url.pathname === "/healthz") return new Response("ok\n");

    // Public, no-auth: viewer (browser desk client). The page itself is
    // fine to serve unauthenticated — it expects the operator to paste
    // a bearer token into the setup form (or arrive with one in the URL
    // hash, which never reaches the server). All actual data calls from
    // the viewer go through the same bearer-gated endpoints below.
    if (url.pathname === "/viewer" || url.pathname === "/viewer/") {
      return new Response(VIEWER_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Cheap caching; bump v=N if the inlined viewer changes.
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Everything else requires the device token.
    if (!authOk(req, env)) {
      return new Response("unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      });
    }

    // ── MCP server: hand off to McpAgent.serve
    if (url.pathname.startsWith("/mcp")) {
      const handler = DeskMcp.serve("/mcp");
      return handler.fetch(req, env, ctx);
    }

    if (url.pathname === "/list") {
      const apps = await getSource(env).list();
      // Also surface any pending elicit OR unread notification so the M5 can
      // immediately yank to the takeover screen on its next dock-refresh poll
      // (every ~10s). Without pending_notify here, plain desk.notify calls
      // would silently queue and only render when the user manually opened
      // the Inbox app — defeating the point of a notification.
      const runnerId = env.APP_RUNNER.idFromName("singleton");
      const runner = env.APP_RUNNER.get(runnerId);
      const pending = await runner.getPendingElicit();
      const queue = await runner.getNotifications();
      const unreadNotice = queue.find(n => !n.read) ?? null;
      const volumeTarget = await runner.getVolumeTarget();
      const filtered = apps.filter((a: any) => a.id !== "elicit" && a.id !== "notify");
      const hasInbox = filtered.some((a: any) => a.id === "inbox");
      const hasConsole = filtered.some((a: any) => a.id === "console");
      const inbox = { id: "inbox", versions: ["0.1.0"] };
      const consoleApp = { id: "console", versions: ["0.1.0"] };
      const listed = [
        ...(hasInbox ? [] : [inbox]),
        ...(hasConsole ? [] : [consoleApp]),
        ...filtered,
      ];
      console.log(`[fabric] /list returned ${listed.length} apps; pending_elicit=${pending ? pending.id : "none"}; pending_notify=${unreadNotice ? unreadNotice.id : "none"}; volume_target=${volumeTarget ?? "none"}`);
      return Response.json({
        apps: listed,
        pending_elicit: pending
          ? { id: pending.id, question: pending.question, options: pending.options }
          : null,
        pending_notify: unreadNotice
          ? { id: unreadNotice.id, text: unreadNotice.text, level: unreadNotice.level }
          : null,
        // null = no opinion; device keeps whatever it has locally.
        volume_target: volumeTarget,
      });
    }

    if (req.method === "POST" && url.pathname === "/run") {
      // ALL run requests go through the singleton AppRunner so it can
      // enforce elicit takeover regardless of which app was requested.
      const id = env.APP_RUNNER.idFromName("singleton");
      const stub = env.APP_RUNNER.get(id);
      const forwarded = new Request(req.url, req);
      const h: Record<string, string> = {};
      for (const [k, v] of req.headers) {
        const lk = k.toLowerCase();
        if (lk === "authorization" || lk === "cookie") continue;
        h[lk] = v.slice(0, 160);
      }
      forwarded.headers.set("x-desk-diag", JSON.stringify({
        now: new Date().toISOString(),
        url: { pathname: url.pathname, search: url.search },
        cf: req.cf ?? null,
        headers: h,
      }).slice(0, 3500));
      return stub.fetch(forwarded);
    }

    if (url.pathname === "/side-effects") {
      const appId = url.searchParams.get("app") ?? "default";
      const ev = SIDE_EFFECTS[appId] ?? [];
      if (url.searchParams.get("clear") === "1") delete SIDE_EFFECTS[appId];
      return Response.json(ev);
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
