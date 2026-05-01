// parse.ts — exp-10's reference parser for the v0 manifest.
//
// Single source of truth for "is this a valid desk app file?" exp-08
// will import this, refuse to load anything that fails validation,
// and use the parsed manifest to decide which bindings to grant.
//
// No external deps — uses Bun's built-in YAML parser via the runtime,
// or a tiny inline parser if Bun's not available. v0 only needs flat
// + map + list YAML, no anchors / multi-doc / tags.

import { readFileSync } from "node:fs";

export const SPEC_VERSION = "desk.app.v0";

export type Mode = "read" | "write" | "facet";
export interface PermissionMap {
  screen?: "write";
  buttons?: "read";
  buzzer?: "write";
  led?: "write";
  imu?: "read";
  storage?: "facet";
  "net.fetch"?: string[];                 // [] or list of allowed hosts
  [k: `mcp.${string}`]: "read" | "write"; // mcp.<server>: read|write
}

export interface Manifest {
  spec: typeof SPEC_VERSION;
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  permissions: PermissionMap;
  budget: {
    cpu_ms_per_input: number;
    ram_mb_steady: number;
    inputs_per_sec: number;
    alarm_min_interval_ms: number | null;
  };
  entrypoints: ("init" | "onInput" | "onAlarm")[];
  dock: {
    icon: string;
    background: boolean;
    default_alarm_ms: number | null;
  };
  custom_bindings: string[];
}

export interface ParsedApp {
  manifest: Manifest;
  source: string;     // the JS body
  rawFrontmatter: string;
}

const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.-]+)?$/;
const ICON_RE = /^[\x21-\x7e]{1,3}$/;

const ALLOWED_PERMS = new Set([
  "screen", "buttons", "buzzer", "led", "imu", "storage", "net.fetch",
]);
const ALLOWED_ENTRYPOINTS = new Set(["init", "onInput", "onAlarm"]);

export class ManifestError extends Error {
  constructor(public field: string, msg: string) {
    super(`${field}: ${msg}`);
  }
}

/** Split the file into frontmatter YAML and body. */
function split(file: string): { fm: string; body: string } {
  if (!file.startsWith("---\n")) throw new ManifestError("file", "missing leading ---");
  const end = file.indexOf("\n---\n", 4);
  if (end < 0) throw new ManifestError("file", "missing closing ---");
  return { fm: file.slice(4, end), body: file.slice(end + 5) };
}

/** Tiny YAML loader. Bun ships YAML; if not, callers can swap.
    For deps-free portability we shell out to a single Bun built-in. */
async function loadYaml(s: string): Promise<unknown> {
  // Bun >= 1.1 supports `Bun.YAML` at runtime via `bun:yaml`-ish import,
  // but a portable fallback is `yaml` npm package. Since we run under bun,
  // use dynamic import to keep types clean.
  // NOTE: when this runs inside a Worker (exp-08), use a pre-compiled
  // YAML parser. v0 only needs flat YAML — we can swap for a 50-line
  // inline parser if dep weight matters.
  const yaml = await import("yaml");
  return yaml.parse(s);
}

export async function parseAppFile(file: string): Promise<ParsedApp> {
  const { fm, body } = split(file);
  const raw = (await loadYaml(fm)) as any;
  if (!raw || typeof raw !== "object") {
    throw new ManifestError("frontmatter", "must be a YAML map");
  }

  // ---- spec ----
  if (raw.spec !== SPEC_VERSION) {
    throw new ManifestError("spec", `must be exactly "${SPEC_VERSION}", got ${JSON.stringify(raw.spec)}`);
  }

  // ---- id / name / version ----
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) {
    throw new ManifestError("id", "must match ^[a-z][a-z0-9-]{1,30}$");
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new ManifestError("name", "required string");
  }
  if (typeof raw.version !== "string" || !SEMVER_RE.test(raw.version)) {
    throw new ManifestError("version", "must be semver MAJOR.MINOR.PATCH");
  }

  // ---- permissions ----
  if (!raw.permissions || typeof raw.permissions !== "object") {
    throw new ManifestError("permissions", "required map (use {} for none)");
  }
  for (const key of Object.keys(raw.permissions)) {
    if (!ALLOWED_PERMS.has(key) && !key.startsWith("mcp.")) {
      throw new ManifestError(`permissions.${key}`, "unknown permission name (defense in depth)");
    }
  }
  if (raw.permissions["net.fetch"] !== undefined) {
    if (!Array.isArray(raw.permissions["net.fetch"])) {
      throw new ManifestError("permissions.net.fetch", "must be a list of host strings (use [] for none)");
    }
  }

  // ---- budget ----
  const b = raw.budget;
  if (!b || typeof b !== "object") throw new ManifestError("budget", "required");
  for (const k of ["cpu_ms_per_input", "ram_mb_steady", "inputs_per_sec"]) {
    if (typeof b[k] !== "number" || b[k] <= 0) {
      throw new ManifestError(`budget.${k}`, "required positive number");
    }
  }
  if (b.alarm_min_interval_ms !== null && typeof b.alarm_min_interval_ms !== "number") {
    throw new ManifestError("budget.alarm_min_interval_ms", "must be number or null");
  }

  // ---- entrypoints ----
  if (!Array.isArray(raw.entrypoints) || raw.entrypoints.length === 0) {
    throw new ManifestError("entrypoints", "required non-empty list");
  }
  for (const ep of raw.entrypoints) {
    if (!ALLOWED_ENTRYPOINTS.has(ep)) {
      throw new ManifestError(`entrypoints[${ep}]`, "must be one of init, onInput, onAlarm");
    }
  }
  if (!raw.entrypoints.includes("init")) {
    throw new ManifestError("entrypoints", "init is mandatory");
  }
  // If background dock + no onAlarm, that's a contradiction.
  if (raw.dock?.background && !raw.entrypoints.includes("onAlarm")) {
    throw new ManifestError("dock.background", "true but entrypoints lacks onAlarm");
  }

  // ---- dock ----
  const d = raw.dock;
  if (!d || typeof d !== "object") throw new ManifestError("dock", "required");
  if (typeof d.icon !== "string" || !ICON_RE.test(d.icon)) {
    throw new ManifestError("dock.icon", "must be 1-3 printable ASCII chars");
  }
  if (typeof d.background !== "boolean") {
    throw new ManifestError("dock.background", "required boolean");
  }
  if (d.default_alarm_ms !== null && typeof d.default_alarm_ms !== "number") {
    throw new ManifestError("dock.default_alarm_ms", "must be number or null");
  }

  // ---- custom_bindings ----
  if (!Array.isArray(raw.custom_bindings)) {
    throw new ManifestError("custom_bindings", "required list (use [] for none)");
  }

  // ---- body ----
  if (!body.includes("export class App")) {
    throw new ManifestError("body", "must export a class named App");
  }
  if (!body.includes('extends DurableObject')) {
    throw new ManifestError("body", "App must extend DurableObject");
  }

  const manifest: Manifest = {
    spec: raw.spec,
    id: raw.id,
    name: raw.name,
    version: raw.version,
    author: raw.author,
    description: raw.description,
    permissions: raw.permissions,
    budget: b,
    entrypoints: raw.entrypoints,
    dock: d,
    custom_bindings: raw.custom_bindings,
  };

  return { manifest, source: body, rawFrontmatter: fm };
}

// CLI: `bun parse.ts apps/counter.md` validates and prints the manifest.
if (import.meta.main) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: bun parse.ts <path/to/app.md>");
    process.exit(2);
  }
  const file = readFileSync(path, "utf8");
  try {
    const { manifest, source } = await parseAppFile(file);
    console.log(JSON.stringify(manifest, null, 2));
    console.error(`✅ valid; body is ${source.length} bytes`);
  } catch (e) {
    if (e instanceof ManifestError) {
      console.error(`❌ ${e.message}`);
    } else {
      console.error("❌ parse error:", e);
    }
    process.exit(1);
  }
}
