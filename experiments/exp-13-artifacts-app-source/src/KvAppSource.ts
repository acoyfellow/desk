// KvAppSource.ts — KV-backed AppSource. The default for desk v0.
//
// KV layout:
//   key: `app:${id}:${version}`        -> raw markdown file content
//   key: `app:${id}:_meta`             -> JSON: { latest: "0.1.2", versions: ["0.1.2","0.1.1",...] }
//   key: `_index`                      -> JSON: { apps: ["counter", "pet", ...] }
//
// Why this layout: per-version writes are atomic, listing is one read, and
// the prompt→app loop can push a new version + bump _meta in two writes.

import * as YAML from "yaml";
import {
  type AppSource, type AppRef, type AppFile, type AppListing,
  AppNotFoundError, hashSource, splitManifest,
} from "./AppSource";

export interface KvAppSourceEnv {
  APPS: KVNamespace;
}

export class KvAppSource implements AppSource {
  constructor(private env: KvAppSourceEnv) {}

  async get(ref: AppRef): Promise<AppFile> {
    let version = ref.version;
    if (version === "latest") {
      const meta = await this.env.APPS.get(`app:${ref.id}:_meta`, "json") as
        | { latest: string; versions: string[] } | null;
      if (!meta) throw new AppNotFoundError(ref);
      version = meta.latest;
    }
    const file = await this.env.APPS.get(`app:${ref.id}:${version}`);
    if (!file) throw new AppNotFoundError({ ...ref, version });
    const { fm, body } = splitManifest(file);
    return {
      manifest: YAML.parse(fm),
      source: body,
      resolvedVersion: version,
      contentHash: await hashSource(file),
    };
  }

  async list(): Promise<AppListing[]> {
    const idx = await this.env.APPS.get("_index", "json") as { apps: string[] } | null;
    if (!idx) return [];
    const out: AppListing[] = [];
    for (const id of idx.apps) {
      const meta = await this.env.APPS.get(`app:${id}:_meta`, "json") as
        | { latest: string; versions: string[] } | null;
      if (meta) out.push({ id, versions: meta.versions });
    }
    return out;
  }

  async push(ref: AppRef, fileContent: string): Promise<{ version: string; hash: string }> {
    const version = ref.version === "latest" ? "0.0.0" : ref.version;
    const hash = await hashSource(fileContent);

    // Write the version
    await this.env.APPS.put(`app:${ref.id}:${version}`, fileContent);

    // Update _meta
    const metaKey = `app:${ref.id}:_meta`;
    const cur = (await this.env.APPS.get(metaKey, "json") as
      | { latest: string; versions: string[] } | null) ?? { latest: version, versions: [] };
    if (!cur.versions.includes(version)) {
      cur.versions = [version, ...cur.versions];
    }
    // Latest = highest semver. Cheap comparator: parse 3 components.
    cur.latest = pickLatest(cur.versions);
    await this.env.APPS.put(metaKey, JSON.stringify(cur));

    // Update _index
    const idx = (await this.env.APPS.get("_index", "json") as { apps: string[] } | null) ?? { apps: [] };
    if (!idx.apps.includes(ref.id)) {
      idx.apps = [...idx.apps, ref.id];
      await this.env.APPS.put("_index", JSON.stringify(idx));
    }

    return { version, hash };
  }
}

function pickLatest(versions: string[]): string {
  const parsed = versions.map(v => {
    const [a, b, c] = v.split(".").map(n => parseInt(n, 10) || 0);
    return { v, n: a * 1e9 + b * 1e5 + c };
  });
  parsed.sort((a, b) => b.n - a.n);
  return parsed[0]?.v ?? "0.0.0";
}
