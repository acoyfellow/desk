// desk-fab-local — shared local fabric for exp-01, exp-02, exp-04C.
// Two DOs, one Worker. Runs entirely under `wrangler dev` — no deploy.
//
// Routes:
//   GET  /seq/:room                 → upgrade to WebSocket; DO emits seq counter every 1s
//   POST /auth/issue                → mint a presence-bound device JWT
//   POST /auth/heartbeat            → device pings to keep token alive
//   GET  /auth/check?token=...      → verifies token (presence + signature)
//   GET  /healthz                   → static probe

import { DurableObject } from "cloudflare:workers";

export interface Env {
  SEQ_DO:  DurableObjectNamespace<SeqRoom>;
  AUTH_DO: DurableObjectNamespace<AuthRoom>;
}

// ──────────────────── exp-01: WebSocket Hibernation seq counter ────────────────────
export class SeqRoom extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Hibernation: accept via ctx so workerd can hibernate this DO between messages
    this.ctx.acceptWebSocket(server);
    // Schedule the first emit
    const next = (await this.ctx.storage.get<number>("seq")) ?? 0;
    await this.ctx.storage.put("seq", next);
    await this.ctx.storage.setAlarm(Date.now() + 1000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    // Echo for debugging; real protocol would parse here.
    if (typeof msg === "string" && msg === "ping") ws.send("pong");
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Hibernation handles reconnects implicitly when the client reopens.
  }

  async alarm(): Promise<void> {
    const seq = ((await this.ctx.storage.get<number>("seq")) ?? 0) + 1;
    await this.ctx.storage.put("seq", seq);
    const payload = JSON.stringify({ seq, ts: Date.now() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload); } catch { /* peer gone, will reconnect */ }
    }
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
  }
}

// ──────────────────── exp-02: presence-bound device JWT ────────────────────
// Minimal HS256 JWT (no external deps). Production would use real JOSE.
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? enc.encode(b) : b;
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};
const fromB64u = (s: string) => {
  const pad = s + "=".repeat((4 - s.length % 4) % 4);
  const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return b64u(sig);
}

async function jwtSign(payload: object, secret: string): Promise<string> {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = await hmacSign(secret, `${head}.${body}`);
  return `${head}.${body}.${sig}`;
}

async function jwtVerify(token: string, secret: string): Promise<object | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = await hmacSign(secret, `${h}.${p}`);
  if (expected !== s) return null;
  try { return JSON.parse(dec.decode(fromB64u(p))); } catch { return null; }
}

export class AuthRoom extends DurableObject<Env> {
  static SECRET = "desk-fab-local-test-secret-not-for-prod";
  static PRESENCE_WINDOW_MS = 60_000;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/auth/, "");

    if (req.method === "POST" && path === "/issue") {
      const body = await req.json<{ deviceId: string }>().catch(() => ({ deviceId: "" }));
      if (!body.deviceId) return j({ error: "deviceId required" }, 400);
      const now = Date.now();
      const jti = crypto.randomUUID();
      await this.ctx.storage.put(`hb:${jti}`, now);
      const token = await jwtSign(
        { sub: body.deviceId, jti, iat: Math.floor(now/1000), exp: Math.floor(now/1000)+86400 },
        AuthRoom.SECRET,
      );
      return j({ token, jti, presence_window_ms: AuthRoom.PRESENCE_WINDOW_MS });
    }

    if (req.method === "POST" && path === "/heartbeat") {
      const body = await req.json<{ token: string }>().catch(() => ({ token: "" }));
      const claims = body.token ? await jwtVerify(body.token, AuthRoom.SECRET) : null;
      if (!claims) return j({ ok: false, reason: "bad_signature" }, 401);
      const jti = (claims as any).jti;
      const last = await this.ctx.storage.get<number>(`hb:${jti}`);
      if (last == null) return j({ ok: false, reason: "revoked" }, 401);
      // F-1 fix: reject heartbeats against tokens that have already passed
      // the presence window. Otherwise an attacker holding the token after
      // a 60s+ unplug could resurrect it. Once expired, the device must
      // re-issue via /auth/issue.
      const age = Date.now() - last;
      if (age > AuthRoom.PRESENCE_WINDOW_MS) {
        // Also revoke explicitly so subsequent /check's see 'revoked' not 'presence_expired'.
        await this.ctx.storage.delete(`hb:${jti}`);
        return j({ ok: false, reason: "presence_expired", age_ms: age }, 401);
      }
      await this.ctx.storage.put(`hb:${jti}`, Date.now());
      return j({ ok: true, jti });
    }

    if (req.method === "GET" && path === "/check") {
      const token = url.searchParams.get("token") ?? "";
      const claims = token ? await jwtVerify(token, AuthRoom.SECRET) : null;
      if (!claims) return j({ ok: false, reason: "bad_signature" }, 401);
      const jti = (claims as any).jti;
      const last = await this.ctx.storage.get<number>(`hb:${jti}`);
      if (last == null) return j({ ok: false, reason: "revoked" }, 401);
      const age = Date.now() - last;
      if (age > AuthRoom.PRESENCE_WINDOW_MS) {
        return j({ ok: false, reason: "presence_expired", age_ms: age }, 401);
      }
      return j({ ok: true, jti, age_ms: age, sub: (claims as any).sub });
    }

    if (req.method === "POST" && path === "/revoke") {
      const body = await req.json<{ jti: string }>().catch(() => ({ jti: "" }));
      if (!body.jti) return j({ error: "jti required" }, 400);
      await this.ctx.storage.delete(`hb:${body.jti}`);
      return j({ ok: true });
    }

    return new Response("not found", { status: 404 });
  }
}

// ──────────────────── Worker entry ────────────────────
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return new Response("ok\n");

    const seq = url.pathname.match(/^\/seq\/([a-z0-9-]+)$/i);
    if (seq) {
      const id = env.SEQ_DO.idFromName(seq[1]);
      return env.SEQ_DO.get(id).fetch(req);
    }

    if (url.pathname.startsWith("/auth/")) {
      const id = env.AUTH_DO.idFromName("singleton");
      return env.AUTH_DO.get(id).fetch(req);
    }

    return new Response("desk-fab-local: unknown route", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

const j = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" }});
