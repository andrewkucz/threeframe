import { createDirectiveRegistry, parseDirective, DirectiveRegistry } from "./directives";
import type { GameManifest } from "./manifest";

export interface ScriptDiagnostic {
  /** 1-based line. */
  line: number;
  /** 1-based column where the directive starts. */
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface LintScriptOptions {
  manifest: GameManifest;
  directives?: DirectiveRegistry;
  /** Command-line prefix; defaults to `>>>`. */
  commandPrefix?: string;
}

/** Strips `//` comments outside strings, and tracks `/* … *\/` blocks across lines. */
function stripComments(line: string, state: { block: boolean }) {
  let result = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (state.block) {
      if (line.startsWith("*/", i)) {
        state.block = false;
        i++;
      }
      result += " ";
      continue;
    }
    const char = line[i];
    if (char === '"') quoted = !quoted;
    if (!quoted && line.startsWith("/*", i)) {
      state.block = true;
      result += " ";
      i++;
      continue;
    }
    if (!quoted && line.startsWith("//", i)) break;
    result += char;
  }
  return result;
}

/**
 * Checks the directives in an Ink script, on command lines and in tags, against a game: unknown
 * directives, characters, backdrops, scenes and variables. Ink syntax itself is the compiler's job.
 */
export function lintScript(
  source: string,
  { manifest, directives = createDirectiveRegistry(), commandPrefix = ">>>" }: LintScriptOptions,
): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];
  const comments = { block: false };
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = stripComments(raw, comments);
    const trimmed = line.trimStart();
    const check = (text: string, column: number, fromTag: boolean) => {
      const directive = parseDirective(text);
      if (!directive) return;
      const report = (severity: ScriptDiagnostic["severity"], message: string) =>
        diagnostics.push({ line: index + 1, column, severity, message });
      if (directive.name === "speaker") {
        const id = String(directive.args[0] ?? "");
        if (id && manifest.characters && !manifest.characters[id])
          report("info", `"${id}" is not a defined character; the nameplate shows the id.`);
        return;
      }
      if (DirectiveRegistry.reserved.has(directive.name)) return;
      const definition = directives.get(directive.name);
      if (!definition) {
        // Tags are also free-form metadata, so unknown tags are only informational.
        report(fromTag ? "info" : "warning", `Unknown directive: ${directive.name}`);
        return;
      }
      for (const message of definition.check?.(directive, manifest) ?? [])
        report("warning", message);
    };
    if (trimmed.startsWith(commandPrefix)) {
      const start = line.indexOf(commandPrefix) + commandPrefix.length;
      const body = line.slice(start);
      const hash = body.indexOf("#");
      const text = hash < 0 ? body : body.slice(0, hash);
      check(text, start + (text.length - text.trimStart().length) + 1, false);
      if (hash >= 0) {
        if (/=\s*$/.test(text) || /^#[0-9a-f]{3,8}\b/i.test(body.slice(hash)))
          diagnostics.push({
            line: index + 1,
            column: start + hash + 1,
            severity: "warning",
            message:
              "Ink starts a tag at #, so it isn't part of the command. Write colors without it (color=ffcc00) or escape it (\\#).",
          });
        checkTags(body.slice(hash), start + hash, check);
      }
      return;
    }
    // Tags inside inline logic (`{…#…}`) are rare; only top-level `#` starts tags.
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "{") depth++;
      else if (line[i] === "}") depth = Math.max(0, depth - 1);
      else if (line[i] === "#" && depth === 0) {
        checkTags(line.slice(i), i, check);
        break;
      }
    }
  });
  return diagnostics;
}

function checkTags(
  text: string,
  offset: number,
  check: (text: string, column: number, fromTag: boolean) => void,
) {
  let position = 0;
  for (const part of text.split("#")) {
    if (position > 0 || part) {
      const body = part.replace(/\]$/, "");
      const lead = body.length - body.trimStart().length;
      if (body.trim()) check(body, offset + position + lead + 1, true);
    }
    position += part.length + 1;
  }
}
