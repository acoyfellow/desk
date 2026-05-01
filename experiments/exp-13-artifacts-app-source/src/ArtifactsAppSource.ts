// ArtifactsAppSource.ts — git-backed AppSource via isomorphic-git over
// Cloudflare Artifacts' standard Git smart-HTTP.
//
// Layout in the desk/apps repo:
//   /apps/<id>/manifest.md      -- the desk app file (frontmatter + JS body)
//   /apps/<id>/CHANGELOG.md     -- optional human-readable changelog
//
// Versioning:
//   The "version" field in the manifest frontmatter is the ground truth.
//   Git tags of the form `v<id>-<semver>` (e.g. `vcounter-0.1.0`) mark
//   versions; absent that, HEAD on `main` is treated as "latest".
//
// Pulling from inside a Worker:
//   We use isomorphic-git + http/web with a MemoryFS (per official example).
//   First call clones; subsequent calls fetch (incremental). Loaded blobs
//   are cached in-memory keyed by `${appId}:${version}` so repeat reads
//   are zero-rtt.

import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import * as YAML from "yaml";
import {
  type AppSource, type AppRef, type AppFile, type AppListing,
  AppNotFoundError, hashSource, splitManifest,
} from "./AppSource";
import { MemoryFS } from "./MemoryFS";

export interface ArtifactsAppSourceConfig {
  /** Full git remote, e.g. "https://<acct>.artifacts.cloudflare.net/git/desk/apps.git" */
  remote: string;
  /** Repo token secret (the part BEFORE "?expires="). Just the secret. */
  tokenSecret: string;
  /** Default branch to read from when version="latest". */
  defaultBranch?: string;
}

interface CacheEntry {
  file: AppFile;
  cachedAt: number;
}

export class ArtifactsAppSource implements AppSource {
  private fs = new MemoryFS();
  private dir = "/repo";
  private cloned = false;
  private cache = new Map<string, CacheEntry>();
  private cacheTtlMs = 5_000;

  constructor(private cfg: ArtifactsAppSourceConfig) {}

  private auth = () => ({ username: "x", password: this.cfg.tokenSecret });

  /** Ensure we have a working tree of the repo in memory. First call clones; subsequent calls fetch. */
  private async sync(): Promise<void> {
    if (!this.cloned) {
      await git.clone({
        fs: this.fs, http, dir: this.dir,
        url: this.cfg.remote,
        ref: this.cfg.defaultBranch ?? "main",
        singleBranch: true,
        depth: 50,           // 50 commits is plenty for app rollback history
        onAuth: this.auth,
      });
      this.cloned = true;
    } else {
      await git.fetch({
        fs: this.fs, http, dir: this.dir,
        ref: this.cfg.defaultBranch ?? "main",
        singleBranch: true,
        depth: 50,
        onAuth: this.auth,
      });
      // Fast-forward main to the fetched ref so reads see new files.
      await git.checkout({
        fs: this.fs, dir: this.dir,
        ref: this.cfg.defaultBranch ?? "main",
        force: true,
      });
    }
  }

  async get(ref: AppRef): Promise<AppFile> {
    const cacheKey = `${ref.id}:${ref.version}`;
    const hit = this.cache.get(cacheKey);
    // For latest, always sync first so git-pushed app updates become visible.
    if (ref.version !== "latest" && hit && Date.now() - hit.cachedAt < this.cacheTtlMs) return hit.file;

    await this.sync();

    // For now, version="latest" is "current state of main".
    // Specific versions: look for tag `v<id>-<version>` (TODO).
    const path = `${this.dir}/apps/${ref.id}/manifest.md`;
    let content: string;
    try {
      content = await this.fs.promises.readFile(path, "utf8") as string;
    } catch (e) {
      throw new AppNotFoundError(ref);
    }

    // Resolve the actual version from the manifest's `version:` field
    const { fm, body } = splitManifest(content);
    const parsed = YAML.parse(fm) as { version?: string };
    const resolvedVersion = parsed.version ?? "0.0.0";

    const file: AppFile = {
      manifest: parsed,
      source: body,
      resolvedVersion,
      contentHash: await hashSource(content),
    };
    this.cache.set(cacheKey, { file, cachedAt: Date.now() });
    return file;
  }

  async list(): Promise<AppListing[]> {
    await this.sync();
    const appsDir = `${this.dir}/apps`;
    let names: string[];
    try {
      names = await this.fs.promises.readdir(appsDir) as string[];
    } catch {
      return [];
    }
    const out: AppListing[] = [];
    for (const name of names) {
      try {
        const path = `${appsDir}/${name}/manifest.md`;
        const content = await this.fs.promises.readFile(path, "utf8") as string;
        const { fm } = splitManifest(content);
        const parsed = YAML.parse(fm) as { version?: string };
        out.push({ id: name, versions: [parsed.version ?? "0.0.0"] });
      } catch { /* skip non-app entries */ }
    }
    return out;
  }

  async push(ref: AppRef, fileContent: string): Promise<{ version: string; hash: string }> {
    await this.sync();
    const path = `${this.dir}/apps/${ref.id}/manifest.md`;
    await this.fs.promises.writeFile(path, fileContent);

    await git.add({ fs: this.fs, dir: this.dir, filepath: `apps/${ref.id}/manifest.md` });
    await git.commit({
      fs: this.fs, dir: this.dir,
      message: `desk: install ${ref.id}@${ref.version}`,
      author: { name: "desk-fabric", email: "fabric@desk.local" },
    });
    await git.push({
      fs: this.fs, http, dir: this.dir,
      url: this.cfg.remote,
      ref: this.cfg.defaultBranch ?? "main",
      onAuth: this.auth,
    });

    // Invalidate cache for this app
    for (const k of this.cache.keys()) {
      if (k.startsWith(`${ref.id}:`)) this.cache.delete(k);
    }

    const hash = await hashSource(fileContent);
    return {
      version: ref.version === "latest" ? "0.0.0" : ref.version,
      hash,
    };
  }
}
