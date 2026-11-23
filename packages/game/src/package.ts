import {
  memorySource,
  normalizePath,
  urlSource,
  type FileData,
  type FileSource,
  type MemorySource,
} from "@threeframe/core";
import { unzip, zip, type Unzipped, type Zippable } from "fflate";
import { MANIFEST_FILE, parseManifest, type GameManifest } from "./manifest";

/**
 * A loaded game: its manifest plus the files it references. Every manifest path is relative to the
 * package root, so the same package plays from a folder, a zip archive or memory.
 */
export interface GamePackage {
  manifest: GameManifest;
  source: FileSource;
}

/** Where a package can come from. */
export type GamePackageInput =
  /** A folder URL (ending in `/` or `game.json`) or an archive URL (`.zip` / `.tfgame`). */
  | string
  | URL
  /** Archive bytes. */
  | Blob
  | ArrayBuffer
  | Uint8Array
  /** Any file system with a `game.json` at its root. */
  | FileSource;

export interface LoadGamePackageOptions {
  signal?: AbortSignal;
  /** Check that every file the manifest references exists (for enumerable sources). Default true. */
  checkFiles?: boolean;
}

const isZip = (bytes: Uint8Array) =>
  bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;

/** File extensions treated as archives when loading from a URL. */
export const ARCHIVE_EXTENSIONS = [".zip", ".tfgame"];

/** Loads and validates a game package. */
export async function loadGamePackage(
  input: GamePackageInput,
  { signal, checkFiles = true }: LoadGamePackageOptions = {},
): Promise<GamePackage> {
  let source: FileSource;
  if (typeof input === "string" || input instanceof URL) {
    const url = String(input);
    const path = url.split(/[?#]/)[0].toLowerCase();
    if (ARCHIVE_EXTENSIONS.some((extension) => path.endsWith(extension))) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
      source = await unpackArchive(new Uint8Array(await response.arrayBuffer()), url);
    } else {
      const folder = path.endsWith(`/${MANIFEST_FILE}`)
        ? url.slice(0, url.lastIndexOf("/") + 1)
        : url;
      source = urlSource(folder);
    }
  } else if (input instanceof Blob) {
    source = await unpackArchive(new Uint8Array(await input.arrayBuffer()));
  } else if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    source = await unpackArchive(new Uint8Array(input));
  } else source = input;

  signal?.throwIfAborted();
  const response = await source.fetch(MANIFEST_FILE, signal);
  if (!response.ok) throw new Error(`This package has no ${MANIFEST_FILE} at its root.`);
  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new Error(`${MANIFEST_FILE} is not valid JSON.`, { cause });
  }
  const manifest = parseManifest(json, checkFiles ? source.list?.() : undefined);
  return { manifest, source };
}

/**
 * Unpacks a zip archive into memory. A single top-level folder holding `game.json` is treated as the
 * root, so archives made by zipping the folder itself work too.
 */
export async function unpackArchive(bytes: Uint8Array, id?: string): Promise<MemorySource> {
  if (!isZip(bytes)) throw new Error("This file is not a game package (expected a zip archive).");
  const entries = await new Promise<Unzipped>((resolve, reject) =>
    unzip(bytes, (error, result) => (error ? reject(error) : resolve(result))),
  );
  const paths = Object.keys(entries).filter(
    (path) =>
      !path.endsWith("/") && !path.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(path),
  );
  let prefix = "";
  if (!paths.includes(MANIFEST_FILE)) {
    const nested = paths.filter((path) => path.endsWith(`/${MANIFEST_FILE}`));
    const shallowest = nested.sort((a, b) => a.split("/").length - b.split("/").length)[0];
    if (shallowest) prefix = shallowest.slice(0, -MANIFEST_FILE.length);
  }
  return memorySource(
    paths
      .filter((path) => path.startsWith(prefix))
      .map((path) => [path.slice(prefix.length), entries[path]] as const),
    id ?? `archive:${hashBytes(bytes)}`,
  );
}

function hashBytes(bytes: Uint8Array) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 65536));
  for (let i = 0; i < bytes.length; i += step) hash = Math.imul(hash ^ bytes[i], 16777619);
  return `${(hash >>> 0).toString(36)}-${bytes.length}`;
}

/** Formats stored without compression, because they already are compressed. */
const STORED = /\.(png|jpe?g|webp|avif|gif|mp3|ogg|m4a|woff2?)$/i;

/**
 * Zips package files into a portable archive. `game.json` is written first. Accepts a memory source,
 * a map or a plain object of files.
 */
export async function createGameArchive(
  files: MemorySource | ReadonlyMap<string, FileData> | Readonly<Record<string, FileData>>,
): Promise<Uint8Array> {
  const entries: [string, FileData][] =
    "files" in files && files.files instanceof Map
      ? [...(files as MemorySource).files]
      : files instanceof Map
        ? [...files]
        : Object.entries(files as Record<string, FileData>);
  if (!entries.some(([path]) => normalizePath(path) === MANIFEST_FILE))
    throw new Error(`A game package needs a ${MANIFEST_FILE}.`);
  entries.sort(([a], [b]) =>
    a === MANIFEST_FILE ? -1 : b === MANIFEST_FILE ? 1 : a.localeCompare(b),
  );
  const zippable: Zippable = {};
  for (const [path, data] of entries) {
    const bytes =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : data instanceof Blob
          ? new Uint8Array(await data.arrayBuffer())
          : new Uint8Array(data);
    zippable[normalizePath(path)] = [bytes, { level: STORED.test(path) ? 0 : 6 }];
  }
  return new Promise((resolve, reject) =>
    zip(zippable, (error, result) => (error ? reject(error) : resolve(result))),
  );
}

/** Wraps archive bytes as a downloadable Blob. */
export const archiveBlob = (bytes: Uint8Array) =>
  new Blob([new Uint8Array(bytes)], { type: "application/zip" });

/** Builds a package from in-memory files, e.g. an editor's working copy. */
export function packageFromFiles(
  manifest: GameManifest,
  files: Iterable<readonly [string, FileData]> | Readonly<Record<string, FileData>> = {},
  id?: string,
): GamePackage & { source: MemorySource } {
  const source = memorySource(files, id);
  source.write(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  return { manifest: parseManifest(manifest), source };
}

/** Reads a package file as text. */
export async function readPackageText(pkg: GamePackage, path: string, signal?: AbortSignal) {
  const response = await pkg.source.fetch(path, signal);
  if (!response.ok) throw new Error(`Missing package file: ${path}`);
  return response.text();
}
