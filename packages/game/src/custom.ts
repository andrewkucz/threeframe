import type { GameManifest, ManifestIssue, SceneManifest } from "./manifest";

/**
 * Kinds of value a custom scene setting holds. Editors build forms from them: `character`,
 * `backdrop`, `variable` and `scene` are ids picked from the manifest.
 */
export type ScenePropType =
  | "number"
  | "boolean"
  | "string"
  | "select"
  | "character"
  | "backdrop"
  | "variable"
  | "scene";

/** One setting of a custom scene component, as authors see it in the manifest's `props`. */
export interface ScenePropSchema {
  type: ScenePropType;
  default?: unknown;
  label?: string;
  description?: string;
  /** Numbers are clamped into `[min, max]`. */
  min?: number;
  max?: number;
  step?: number;
  /** Values a `select` allows. */
  options?: readonly string[];
  /** Settings without a default are required unless optional. */
  optional?: boolean;
}

/**
 * The headless description of a custom scene component: everything a session and an editor need
 * without rendering it. Renderers extend it with their components (see `defineCustomScene` in
 * `@threeframe/engine`) and register the result with the session's `customScenes` option.
 */
export interface CustomSceneType {
  /** Referenced by `component` in the manifest. */
  id: string;
  /** Display name for tools. */
  name?: string;
  description?: string;
  /** The component's settings. Manifest `props` are checked against them and get their defaults. */
  props?: Readonly<Record<string, ScenePropSchema>>;
  /** Outcomes the scene can end with, for wiring them to the next scene in the manifest. */
  outcomes?: readonly string[];
  /**
   * Ink functions the component provides to its scene script, as signatures such as
   * `reveal_pin()` or `pins_left()`. They are declared for raw `.ink` scripts automatically.
   */
  externals?: readonly string[];
  /** Knots the component plays from its scene script, so editors can report missing ones. */
  knots?: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A scene's manifest `props` over the type's defaults, with numbers clamped into range. */
export function resolveSceneProps(
  type: CustomSceneType | undefined,
  props: SceneManifest["props"] = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(type?.props ?? {})) {
    if (schema.default !== undefined) result[name] = schema.default;
  }
  for (const [name, value] of Object.entries(props)) {
    const schema = type?.props?.[name];
    let next = value;
    if (schema?.type === "number" && typeof value === "number") {
      let clamped = value;
      if (schema.min !== undefined) clamped = Math.max(schema.min, clamped);
      if (schema.max !== undefined) clamped = Math.min(schema.max, clamped);
      next = clamped;
    }
    result[name] = next;
  }
  return result;
}

/** Names declared by external signatures such as `reveal_pin(index)`. */
export function externalNames(signatures: readonly string[] = []) {
  return signatures.map((signature) => signature.replace(/\(.*$/, "").trim()).filter(Boolean);
}

/**
 * Checks a custom scene's manifest entry against its registered type: the component exists, every
 * setting has the right type, required settings are present, and wired outcomes are ones the
 * component reports. Paths are relative to the scene (`props.pins`).
 */
export function checkCustomScene(
  scene: SceneManifest,
  type: CustomSceneType | undefined,
  manifest: GameManifest,
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const warn = (path: string, message: string) =>
    issues.push({ severity: "warning", path, message });
  if (scene.kind !== "custom") return issues;
  if (!type) {
    warn("component", `No custom scene component "${scene.component ?? ""}" is registered.`);
    return issues;
  }
  const props = isRecord(scene.props) ? scene.props : {};
  for (const [name, schema] of Object.entries(type.props ?? {})) {
    const value = props[name];
    const at = `props.${name}`;
    if (value === undefined) {
      if (schema.default === undefined && !schema.optional) warn(at, `${name} is required.`);
      continue;
    }
    const problem = propProblem(schema, value, manifest);
    if (problem) warn(at, problem);
  }
  for (const name of Object.keys(props))
    if (!type.props?.[name])
      warn(`props.${name}`, `${type.name ?? type.id} has no setting "${name}".`);
  if (type.outcomes)
    for (const name of Object.keys(scene.outcomes ?? {}))
      if (!type.outcomes.includes(name))
        warn(
          `outcomes.${name}`,
          `${type.name ?? type.id} never ends with "${name}" (it reports ${type.outcomes.join(", ")}).`,
        );
  return issues;
}

function propProblem(schema: ScenePropSchema, value: unknown, manifest: GameManifest) {
  switch (schema.type) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "Expected a number.";
      if (schema.min !== undefined && value < schema.min) return `At least ${schema.min}.`;
      if (schema.max !== undefined && value > schema.max) return `At most ${schema.max}.`;
      return null;
    case "boolean":
      return typeof value === "boolean" ? null : "Expected true or false.";
    case "string":
      return typeof value === "string" ? null : "Expected text.";
    case "select":
      return typeof value === "string" && (!schema.options || schema.options.includes(value))
        ? null
        : `Expected one of ${(schema.options ?? []).join(", ")}.`;
    case "character":
      return typeof value === "string" && manifest.characters?.[value]
        ? null
        : `Unknown character: ${String(value)}`;
    case "backdrop":
      return typeof value === "string" && manifest.backdrops?.[value]
        ? null
        : `Unknown backdrop: ${String(value)}`;
    case "variable":
      return typeof value === "string" && manifest.state?.variables?.[value]
        ? null
        : `Unknown variable: ${String(value)}`;
    case "scene":
      return typeof value === "string" &&
        manifest.levels.some((level) => level.scenes.some((scene) => scene.id === value))
        ? null
        : `Unknown scene: ${String(value)}`;
    default:
      return null;
  }
}

/**
 * A compiled Ink story that shows lines of text, for dialogue that doesn't come from a script.
 * Each line may name a speaker (shown on the nameplate, as with `# speaker:id`).
 */
export function lineStory(lines: readonly { speaker?: string | null; text: string }[]) {
  const content: unknown[] = [];
  for (const line of lines) {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    content.push(`^${text}`);
    if (line.speaker) content.push("#", `^speaker:${line.speaker}`, "/#");
    content.push("\n");
  }
  content.push(["done", { "#n": "g-0" }], null);
  return { inkVersion: 21, root: [content, "done", null], listDefs: {} };
}
