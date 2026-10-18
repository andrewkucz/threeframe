import { fetchAsset, type Asset } from "@threeframe/core";
import type { CompilerOptions } from "inkjs/compiler/CompilerOptions";
import type { CompiledStory } from "./controller";

/** Compiler loads only when raw .ink is used. Production can use compiled JSON. */
export async function compileInk(source: string, options?: CompilerOptions): Promise<string> {
  const { Compiler } = await import("inkjs/full");
  const compiler = new Compiler(source, options);
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

export function inkAsset(url: string, format: "ink" | "json" = "ink"): Asset<CompiledStory> {
  return {
    key: `ink:${format}:${url}`,
    async load(signal) {
      const text = await (await fetchAsset(url, signal)).text();
      return format === "ink" ? compileInk(text) : text;
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
