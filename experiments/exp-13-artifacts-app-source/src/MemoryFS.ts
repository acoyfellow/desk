// MemoryFS — vendored from the Cloudflare Artifacts isomorphic-git example
// (developers.cloudflare.com/artifacts/examples/isomorphic-git/).
// Provides the subset of node:fs's promises API that isomorphic-git uses
// against a Map<path, entry> in memory. Workers don't have local disk.

type Entry =
  | { kind: "dir"; children: Set<string>; mtimeMs: number }
  | { kind: "file"; data: Uint8Array; mtimeMs: number };

/** node:fs-style error: errors carry a `.code` like 'ENOENT'. isomorphic-git
    inspects err.code and silently treats some codes as 'file does not exist'. */
function fsError(code: string, path: string): Error {
  const e = new Error(`${code}: ${path}`);
  (e as any).code = code;
  (e as any).errno = -2;
  (e as any).path = path;
  return e;
}

class MemoryStats {
  constructor(public entry: Entry) {}
  get size() { return this.entry.kind === "file" ? this.entry.data.byteLength : 0; }
  get mtimeMs() { return this.entry.mtimeMs; }
  get ctimeMs() { return this.entry.mtimeMs; }
  get mode() { return this.entry.kind === "file" ? 0o100644 : 0o040000; }
  isFile() { return this.entry.kind === "file"; }
  isDirectory() { return this.entry.kind === "dir"; }
  isSymbolicLink() { return false; }
}

export class MemoryFS {
  encoder = new TextEncoder();
  decoder = new TextDecoder();
  entries = new Map<string, Entry>([
    ["/", { kind: "dir", children: new Set(), mtimeMs: Date.now() }],
  ]);

  promises = {
    readFile: this.readFile.bind(this),
    writeFile: this.writeFile.bind(this),
    unlink: this.unlink.bind(this),
    readdir: this.readdir.bind(this),
    mkdir: this.mkdir.bind(this),
    rmdir: this.rmdir.bind(this),
    stat: this.stat.bind(this),
    lstat: this.lstat.bind(this),
    // isomorphic-git enumerates these even if it doesn't always call them
    readlink: this.readlink.bind(this),
    symlink: this.symlink.bind(this),
  };

  async readlink(path: string): Promise<string> {
    throw fsError("EINVAL", path);
  }

  async symlink(_target: string, path: string): Promise<void> {
    throw fsError("ENOSYS", path);
  }

  normalize(input: string) {
    const segments: string[] = [];
    for (const part of input.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") { segments.pop(); continue; }
      segments.push(part);
    }
    return `/${segments.join("/")}` || "/";
  }

  parent(path: string) {
    const n = this.normalize(path);
    if (n === "/") return "/";
    const parts = n.split("/").filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
  }

  basename(path: string) {
    return this.normalize(path).split("/").filter(Boolean).pop() ?? "";
  }

  getEntry(path: string) { return this.entries.get(this.normalize(path)); }
  requireEntry(path: string) {
    const e = this.getEntry(path);
    if (!e) throw fsError("ENOENT", path);
    return e;
  }
  requireDir(path: string) {
    const e = this.requireEntry(path);
    if (e.kind !== "dir") throw fsError("ENOTDIR", path);
    return e;
  }

  async mkdir(path: string, options?: { recursive?: boolean } | number) {
    const target = this.normalize(path);
    if (target === "/") return;
    const recursive = typeof options === "object" && options !== null && options.recursive;
    const parent = this.parent(target);
    if (!this.entries.has(parent)) {
      if (!recursive) throw fsError("ENOENT", parent);
      await this.mkdir(parent, { recursive: true });
    }
    if (this.entries.has(target)) return;
    this.entries.set(target, { kind: "dir", children: new Set(), mtimeMs: Date.now() });
    this.requireDir(parent).children.add(this.basename(target));
  }

  async writeFile(path: string, data: string | Uint8Array | ArrayBuffer) {
    const target = this.normalize(path);
    await this.mkdir(this.parent(target), { recursive: true });
    const bytes = typeof data === "string" ? this.encoder.encode(data)
      : data instanceof Uint8Array ? data : new Uint8Array(data);
    this.entries.set(target, { kind: "file", data: bytes, mtimeMs: Date.now() });
    this.requireDir(this.parent(target)).children.add(this.basename(target));
  }

  async readFile(path: string, options?: string | { encoding?: string }) {
    const e = this.requireEntry(path);
    if (e.kind !== "file") throw fsError("EISDIR", path);
    const encoding = typeof options === "string" ? options : options?.encoding;
    return encoding ? this.decoder.decode(e.data) : e.data;
  }

  async readdir(path: string) {
    return [...this.requireDir(path).children].sort();
  }

  async unlink(path: string) {
    const target = this.normalize(path);
    const e = this.requireEntry(target);
    if (e.kind !== "file") throw fsError("EISDIR", path);
    this.entries.delete(target);
    this.requireDir(this.parent(target)).children.delete(this.basename(target));
  }

  async rmdir(path: string) {
    const target = this.normalize(path);
    const e = this.requireDir(target);
    if (e.children.size > 0) throw fsError("ENOTEMPTY", path);
    this.entries.delete(target);
    this.requireDir(this.parent(target)).children.delete(this.basename(target));
  }

  async stat(path: string) { return new MemoryStats(this.requireEntry(path)); }
  async lstat(path: string) { return this.stat(path); }
}
