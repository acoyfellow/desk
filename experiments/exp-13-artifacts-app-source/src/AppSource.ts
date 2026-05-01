// AppSource.ts — the contract between desk-fabric and "where apps live."
//
// Implementations:
//   - KvAppSource         — KV namespace, key = `app:${id}:${version}`
//   - ArtifactsAppSource  — Cloudflare Artifacts repo via isomorphic-git
//   - LocalFsAppSource    — for dev/tests only (not in this experiment)
//
// The fabric's only contact with storage is through this interface. Swap
// the implementation, ship a different "where apps come from" story, no
// other code changes.

export interface AppRef {
  id: string;
  /**
   * "latest" means: pick the highest-semver version available.
   * A specific semver string locks the load to that version.
   * For Artifacts, this maps to a tag or branch name.
   */
  version: string | "latest";
}

export interface AppFile {
  manifest: unknown;       // parsed frontmatter; the consumer re-validates
  source: string;          // raw JS body
  resolvedVersion: string; // concrete version that was loaded
  contentHash: string;     // sha-256 hex of source — used for Worker Loader cache id
}

export interface AppListing {
  id: string;
  versions: string[];      // semver strings, newest first
}

export interface AppSource {
  /** Read a specific app + version. */
  get(ref: AppRef): Promise<AppFile>;

  /** List installed apps. */
  list(): Promise<AppListing[]>;

  /** Optional: push a new version. Used by the prompt→app loop. */
  push?(ref: AppRef, fileContent: string): Promise<{ version: string; hash: string }>;
}

export class AppNotFoundError extends Error {
  constructor(public ref: AppRef) {
    super(`app not found: ${ref.id}@${ref.version}`);
  }
}

/** sha-256 hex of a string, via SubtleCrypto. */
export async function hashSource(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Parse a desk app manifest file. Mirrors exp-10's parser, inlined.
    Lives here because both AppSource impls need to validate before returning. */
export function splitManifest(file: string): { fm: string; body: string } {
  if (!file.startsWith("---\n")) throw new Error("manifest: missing leading ---");
  const end = file.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("manifest: missing closing ---");
  return { fm: file.slice(4, end), body: file.slice(end + 5) };
}
