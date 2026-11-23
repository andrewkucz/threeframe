/**
 * A read-only file system that assets load from: a folder on a web server, an unpacked archive, or
 * files held in memory. Paths are POSIX-style and relative to the source's root.
 */
export interface FileSource {
  /** Stable identity, part of every asset key loaded through this source. */
  readonly id: string;
  /** Reads a file. Rejects (or returns a non-ok response) when it does not exist. */
  fetch(path: string, signal?: AbortSignal): Promise<Response>;
  /** Every file path, when the source can enumerate its contents. */
  list?(): readonly string[];
}

/** Plain `fetch` of absolute or page-relative URLs. The default source for every asset factory. */
export const httpSource: FileSource = {
  id: "http",
  fetch: (url, signal) => fetch(url, { signal }),
};

/** Collapses `.`/`..` segments and duplicate slashes. Leading `..` that would escape the root throws. */
export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error(`Path escapes its root: ${path}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/** The folder part of a path, without a trailing slash; `""` for files at the root. */
export function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

/** Resolves `relative` against the folder `base`. Paths starting with `/` resolve from the root. */
export function joinPath(base: string, relative: string): string {
  return normalizePath(relative.startsWith("/") ? relative : `${base}/${relative}`);
}

/** Files under a base URL, e.g. `urlSource("/games/demo/")` reads `/games/demo/<path>`. */
export function urlSource(base: string | URL, id = `url:${String(base)}`): FileSource {
  const root = String(base).endsWith("/") ? String(base) : `${String(base)}/`;
  const resolve = (path: string) =>
    new URL(normalizePath(path), new URL(root, globalThis.location?.href ?? "http://localhost/"))
      .href;
  return { id, fetch: (path, signal) => fetch(resolve(path), { signal }) };
}

export type FileData = Blob | ArrayBuffer | Uint8Array | string;

const contentTypes: Record<string, string> = {
  json: "application/json",
  ink: "text/plain",
  txt: "text/plain",
  md: "text/markdown",
  atlas: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};
/** A best-effort MIME type from a path's extension. */
export function contentType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return contentTypes[extension] ?? "application/octet-stream";
}

/** Normalizes file data to a typed Blob, so readers can use `text()`, `arrayBuffer()` or object URLs. */
export function toBlob(data: FileData, path = ""): Blob {
  if (data instanceof Blob) return data;
  const type = contentType(path);
  // Copy views so the Blob never aliases (or keeps alive) a larger shared buffer.
  return new Blob([typeof data === "string" ? data : new Uint8Array(data).slice()], { type });
}

/** A mutable in-memory source, for archives, editors and tests. */
export interface MemorySource extends FileSource {
  readonly files: ReadonlyMap<string, Blob>;
  write(path: string, data: FileData): void;
  remove(path: string): boolean;
  /** Reads a file as text, or `undefined` when it does not exist. */
  readText(path: string): Promise<string | undefined>;
}

let memoryIds = 0;
/**
 * Holds files in memory. The `id` must change whenever file contents change in ways cached assets
 * should notice; by default every source is unique.
 */
export function memorySource(
  files: Readonly<Record<string, FileData>> | Iterable<readonly [string, FileData]> = {},
  id = `memory:${++memoryIds}`,
): MemorySource {
  const map = new Map<string, Blob>();
  const entries = Symbol.iterator in files ? files : Object.entries(files);
  for (const [path, data] of entries as Iterable<readonly [string, FileData]>)
    map.set(normalizePath(path), toBlob(data, path));
  return {
    id,
    files: map,
    list: () => [...map.keys()],
    write(path, data) {
      map.set(normalizePath(path), toBlob(data, path));
    },
    remove: (path) => map.delete(normalizePath(path)),
    async readText(path) {
      return map.get(normalizePath(path))?.text();
    },
    async fetch(path, signal) {
      signal?.throwIfAborted();
      const blob = map.get(normalizePath(path));
      if (!blob) return new Response(null, { status: 404, statusText: `Not found: ${path}` });
      return new Response(blob, { headers: { "content-type": blob.type } });
    },
  };
}

/** Restricts a source to one of its folders, so paths resolve relative to that folder. */
export function subSource(source: FileSource, folder: string): FileSource {
  const prefix = normalizePath(folder);
  if (!prefix) return source;
  return {
    id: `${source.id}/${prefix}`,
    fetch: (path, signal) => source.fetch(joinPath(prefix, path), signal),
    list: source.list
      ? () =>
          (source.list?.() ?? [])
            .filter((path) => path.startsWith(`${prefix}/`))
            .map((path) => path.slice(prefix.length + 1))
      : undefined,
  };
}
