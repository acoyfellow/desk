// exp-17 — MCP spike to answer two unknowns:
//   E1: How long can a tool handler keep the SSE stream alive while waiting?
//   E2: Can a tool handler call into a *different* DO (cross-DO routing)?
//
// We expose an MCP server with three tools and run wrangler dev. We then
// drive it with @modelcontextprotocol/inspector or a hand-rolled MCP
// client.

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace<DeskMcpAgent>;
  STORE: DurableObjectNamespace<Store>;
}

// ───── Plain DO that another DO will call into (for E2) ─────
export class Store extends DurableObject<Env> {
  async put(key: string, value: string): Promise<void> {
    await this.ctx.storage.put(key, value);
  }
  async get(key: string): Promise<string | undefined> {
    return await this.ctx.storage.get<string>(key);
  }
  async info(): Promise<{ id: string; size: number }> {
    const all = await this.ctx.storage.list();
    return { id: this.ctx.id.toString(), size: all.size };
  }
}

// ───── MCP server, DO-backed via McpAgent ─────
export class DeskMcpAgent extends McpAgent<Env> {
  server = new McpServer({ name: "desk-spike", version: "0.0.1" });

  async init() {
    // Tool 1: echo — sanity check that the basic flow works
    this.server.tool(
      "echo",
      "Echo back the provided text. Sanity check.",
      { text: z.string().describe("Text to echo") },
      async ({ text }) => ({
        content: [{ type: "text", text: `you said: ${text}` }],
      }),
    );

    // Tool 2: cross_do — write to a different DO, read it back (E2)
    this.server.tool(
      "cross_do",
      "Write a key/value into a separate Store DO, then read it back. Verifies cross-DO routing.",
      {
        key: z.string(),
        value: z.string(),
      },
      async ({ key, value }) => {
        // Get a stub to a separate DO class. idFromName makes it deterministic.
        const id = this.env.STORE.idFromName("spike");
        const store = this.env.STORE.get(id);

        await store.put(key, value);
        const got = await store.get(key);
        const info = await store.info();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              wrote: { key, value },
              read_back: got,
              store_do_id: info.id,
              store_size: info.size,
              match: got === value,
            }, null, 2),
          }],
        };
      },
    );

    // Tool 3: long_wait — sleep N seconds inside the tool, see what dies (E1)
    this.server.tool(
      "long_wait",
      "Sleep for N seconds inside the tool handler. Tests how long an MCP tool can keep the connection alive.",
      {
        seconds: z.number().min(1).max(120).describe("How long to sleep"),
      },
      async ({ seconds }) => {
        const start = Date.now();
        // Don't busy-wait; use a real promise sleep
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        const elapsed = Date.now() - start;
        return {
          content: [{
            type: "text",
            text: `slept for ~${seconds}s (actual: ${elapsed}ms)`,
          }],
        };
      },
    );

    // Tool 4: poll_for — simulates the M5 elicit pattern: spin polling
    // a DO until a value appears, return it. This is what the real
    // desk.elicit will look like inside.
    this.server.tool(
      "poll_for",
      "Poll the Store DO for `key` until it has a value. Simulates desk's button-press wait pattern.",
      {
        key: z.string(),
        timeout_seconds: z.number().min(1).max(60).default(30),
      },
      async ({ key, timeout_seconds }) => {
        const id = this.env.STORE.idFromName("spike");
        const store = this.env.STORE.get(id);

        const deadline = Date.now() + timeout_seconds * 1000;
        let polls = 0;
        while (Date.now() < deadline) {
          polls++;
          const v = await store.get(key);
          if (v !== undefined && v !== "") {
            // Found it. Clear and return.
            await store.put(key, "");
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ value: v, polls, elapsed_ms: Date.now() - (deadline - timeout_seconds * 1000) }),
              }],
            };
          }
          await new Promise(r => setTimeout(r, 250));  // 4 polls/sec
        }
        return {
          isError: true,
          content: [{ type: "text", text: `timeout after ${timeout_seconds}s (${polls} polls)` }],
        };
      },
    );
  }
}

// ───── Worker entry: route /mcp/* into the McpAgent, plus a simple
//       /set endpoint to feed the poll_for tool from outside (curl).
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") return new Response("ok\n");

    // Push a value into the Store DO so poll_for can find it.
    // POST /set?key=foo&value=bar
    if (req.method === "POST" && url.pathname === "/set") {
      const key = url.searchParams.get("key") ?? "";
      const value = url.searchParams.get("value") ?? "";
      const id = env.STORE.idFromName("spike");
      const store = env.STORE.get(id);
      await store.put(key, value);
      return Response.json({ ok: true, key, value });
    }

    // Hand off everything under /mcp to the McpAgent
    if (url.pathname.startsWith("/mcp")) {
      const handler = DeskMcpAgent.serve("/mcp");
      return handler.fetch(req, env, ctx);
    }

    return new Response("desk-mcp-spike: unknown route", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
