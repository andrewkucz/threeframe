import {
  dirname,
  fetchAsset,
  joinPath,
  sourceKey,
  type Asset,
  type FileSource,
} from "@threeframe/core";
import type { CompilerOptions } from "inkjs/compiler/CompilerOptions";
import type { CompiledStory } from "./controller";

export interface InkCompileOptions {
  /** inkjs compiler options. A `fileHandler` here wins over `includes`. */
  compiler?: CompilerOptions;
  /**
   * Contents of `INCLUDE`d files by path. As in ink, every include resolves relative to the main
   * file's folder, so `INCLUDE chapters/one.ink` in `story/main.ink` reads `story/chapters/one.ink`,
   * also when written inside another included file.
   */
  includes?: Readonly<Record<string, string>>;
  /** Path of the main file, for resolving relative `INCLUDE`s. Defaults to the root. */
  filename?: string;
}

/** Compiler loads only when raw .ink is used. Production can use compiled JSON. */
export async function compileInk(
  source: string,
  options?: CompilerOptions | InkCompileOptions,
): Promise<string> {
  const { Compiler, CompilerOptions: Options } = await import("inkjs/full");
  const resolved = toCompileOptions(options);
  let compilerOptions = resolved.compiler;
  if (resolved.includes && !compilerOptions?.fileHandler) {
    const files = resolved.includes;
    const base = dirname(resolved.filename ?? "");
    const handler = {
      ResolveInkFilename: (filename: string) => joinPath(base, filename),
      LoadInkFileContents: (filename: string) => {
        const contents = files[filename];
        if (contents === undefined) throw new Error(`Included Ink file not found: ${filename}`);
        return contents;
      },
    };
    const given = compilerOptions;
    compilerOptions = new Options(
      resolved.filename ?? given?.sourceFilename ?? null,
      given?.pluginNames ?? [],
      given?.countAllVisits ?? false,
      given?.errorHandler ?? null,
      handler,
    );
  }
  const compiler = new Compiler(source, compilerOptions);
  try {
    const story = compiler.Compile();
    if (compiler.errors.length) throw new Error(compiler.errors.join("\n"));
    return story.ToJson() as string;
  } catch (error) {
    throw new Error(
      compiler.errors.join("\n") || (error instanceof Error ? error.message : String(error)),
    );
  }
}

function toCompileOptions(options: CompilerOptions | InkCompileOptions | undefined) {
  if (!options) return {} as InkCompileOptions;
  return "compiler" in options || "includes" in options || "filename" in options
    ? (options as InkCompileOptions)
    : { compiler: options as CompilerOptions };
}

/** `INCLUDE` targets in a source, in order, as written. */
export function inkIncludes(source: string): string[] {
  return [...source.matchAll(/^[ \t]*INCLUDE[ \t]+(.+?)[ \t]*$/gm)].map((match) => match[1]);
}

/**
 * Reads every file an Ink source includes, transitively. Like ink, all includes resolve relative to
 * the main file's folder. The result feeds `compileInk`'s `includes`.
 */
export async function readInkIncludes(
  source: string,
  filename: string,
  read: (path: string) => Promise<string>,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const base = dirname(filename);
  const visit = async (text: string) => {
    await Promise.all(
      inkIncludes(text).map(async (include) => {
        const path = joinPath(base, include);
        if (path in files) return;
        files[path] = "";
        files[path] = await read(path);
        await visit(files[path]);
      }),
    );
  };
  await visit(source);
  return files;
}

export type InkValue = string | number | boolean;
export interface InkGlobals {
  /** Global variables with their initial values, declared as `VAR name = value`. */
  variables?: Readonly<Record<string, InkValue>>;
  /** External function signatures, declared as `EXTERNAL name(args)`, e.g. `"visited(id)"`. */
  externals?: readonly string[];
}
const inkLiteral = (value: InkValue) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

/**
 * Declares host-provided globals in an Ink source, skipping names it (or its includes, passed as
 * `alsoDeclaredIn`) already declares. Declarations are appended, so compiler line numbers for the
 * author's text are unchanged.
 */
export function declareInkGlobals(
  source: string,
  globals: InkGlobals,
  alsoDeclaredIn: readonly string[] = [],
): string {
  const texts = [source, ...alsoDeclaredIn];
  const declared = (pattern: RegExp) => texts.some((text) => pattern.test(text));
  const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines: string[] = [];
  for (const [name, value] of Object.entries(globals.variables ?? {})) {
    if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(`Invalid Ink variable name: ${name}`);
    if (!declared(new RegExp(`^[ \\t]*(VAR|CONST)[ \\t]+${escape(name)}\\b`, "m")))
      lines.push(`VAR ${name} = ${inkLiteral(value)}`);
  }
  for (const signature of globals.externals ?? []) {
    const name = signature.split("(")[0].trim();
    if (
      !declared(new RegExp(`^[ \\t]*EXTERNAL[ \\t]+${escape(name)}\\b`, "m")) &&
      !declared(new RegExp(`^[ \\t]*={2,}[ \\t]*function[ \\t]+${escape(name)}\\b`, "m"))
    )
      lines.push(`EXTERNAL ${signature}`);
  }
  return lines.length ? `${source}\n\n${lines.join("\n")}\n` : source;
}

export interface InkAssetOptions {
  format?: "ink" | "json";
  /** Where the story and its `INCLUDE`s are read from; plain URLs by default. */
  source?: FileSource;
  /** Host globals declared in raw Ink before compiling (ignored for JSON). */
  globals?: InkGlobals;
}

export function inkAsset(
  url: string,
  formatOrOptions: "ink" | "json" | InkAssetOptions = "ink",
): Asset<CompiledStory> {
  const options =
    typeof formatOrOptions === "string" ? { format: formatOrOptions } : formatOrOptions;
  const { format = "ink", source, globals } = options;
  return {
    key: `ink:${format}:${sourceKey(source)}${url}${globals ? `:${JSON.stringify(globals)}` : ""}`,
    async load(signal) {
      const read = async (path: string) => (await fetchAsset(path, signal, source)).text();
      const text = await read(url);
      if (format === "json") return text;
      const includes = await readInkIncludes(text, url, read);
      const main = globals ? declareInkGlobals(text, globals, Object.values(includes)) : text;
      return compileInk(main, { includes, filename: url });
    },
  };
}

export function inkSourceAsset(
  key: string,
  source: string,
  options?: CompilerOptions,
): Asset<CompiledStory> {
  return { key: `ink-source:${key}:${source}`, load: () => compileInk(source, options) };
}
