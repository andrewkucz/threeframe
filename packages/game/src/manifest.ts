import type { Condition } from "./conditions";

/** File name of the manifest at a package's root. */
export const MANIFEST_FILE = "game.json";
export const MANIFEST_FORMAT = "threeframe.game";
export const MANIFEST_VERSION = 1;
const COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const isColor = (value: unknown) => typeof value === "string" && COLOR.test(value);

export type StateValue = number | boolean | string;

/** A game state variable such as `coins` or `lives`. Every scene's Ink script can read and set it. */
export interface VariableDefinition {
  type: "number" | "boolean" | "string";
  default: StateValue;
  label?: string;
  description?: string;
  /** Numbers are clamped into `[min, max]`. */
  min?: number;
  max?: number;
  /** Show the value in the player's heads-up display. */
  hud?: boolean;
  /** Short text or emoji shown before the value in the HUD. */
  icon?: string;
}

/** A Spine export inside the package. Paths are package-relative; atlas pages resolve beside it. */
export interface SpriteDefinition {
  skeleton: string;
  atlas: string;
  format?: "json" | "binary";
  /** Scale applied while reading the skeleton. */
  scale?: number;
  /**
   * Recolorable parts, by name (`hair`, `skin`, …): the slots each tints, its default color, named
   * presets, and optional gradient shading for grayscale art (see `@threeframe/spine`).
   */
  colorGroups?: Readonly<Record<string, SpriteColorGroup>>;
  /** Slots hidden while a skin, or any skin in a folder, is worn: `{ "accessories/gag": ["mouth"] }`. */
  hides?: Readonly<Record<string, readonly string[]>>;
  /**
   * Animations a track plays between two others, as `[from, to, [via, ...]]`, e.g. a pose to pass
   * through or a transition animation (see `@threeframe/spine`).
   */
  transitions?: readonly (readonly [from: string, to: string, via: readonly string[]])[];
}
export interface SpriteColorGroup {
  slots: readonly string[];
  default?: string;
  presets?: Readonly<Record<string, string>>;
  /** Grayscale art: the gray (0–1) the chosen color lands on, and the L* range from 0 to 1. */
  gradient?: { mid: number; range: number };
}

/**
 * A named look: a skin list, or skins plus colors (by color group) that the outfit sets when worn.
 * Colors it doesn't list keep their current value.
 */
export type OutfitDefinition =
  | readonly string[]
  | { skin: readonly string[]; colors?: Readonly<Record<string, string>> };

/** An outfit's skins and colors, whichever form it was written in. */
export function outfitLook(outfit: OutfitDefinition): {
  skin: readonly string[];
  colors: Readonly<Record<string, string>>;
} {
  return Array.isArray(outfit)
    ? { skin: outfit as readonly string[], colors: {} }
    : {
        skin: (outfit as { skin: readonly string[] }).skin,
        colors: (outfit as { colors?: Readonly<Record<string, string>> }).colors ?? {},
      };
}

export interface CharacterManifest {
  /** Display name, shown on the dialogue nameplate. */
  name: string;
  /** Nameplate accent color. */
  color?: string;
  /** The character's Spine sprite; characters without one only speak. */
  sprite?: SpriteDefinition;
  /** Starting skins, combined in order (one per editor folder for mix-and-match outfits). */
  skin?: readonly string[];
  /** Named looks for `>>> outfit <character> <name>`: skins, optionally with colors. */
  outfits?: Readonly<Record<string, OutfitDefinition>>;
  /** Slot attachment overrides; `null` hides a slot. */
  attachments?: Readonly<Record<string, string | null>>;
  /** Starting colors by the sprite's color group (or slot name), e.g. `{ hair: "#c1b01c" }`. */
  colors?: Readonly<Record<string, string>>;
  /** Looping idle animation. */
  animation?: string;
  /** On-stage scale. */
  scale?: number;
  /** Baseline Y in design units; defaults to the stage's `floor`. */
  y?: number;
  /** Mirror the sprite by default. */
  flip?: boolean;
}

interface BackdropBase {
  /** Display name for tools. */
  name?: string;
}
export type BackdropManifest =
  | (BackdropBase & {
      type: "image";
      /** Package-relative image path. */
      image: string;
      fit?: "cover" | "contain" | "stretch" | "none";
      /** Multiplies the image color. */
      tint?: string;
    })
  | (BackdropBase & { type: "color"; color: string })
  | (BackdropBase & {
      type: "gradient";
      /** Colors from top to bottom, evenly spaced. */
      colors: readonly string[];
    });

/** A stage position: a named mark (see `StageManifest.positions`) or an X coordinate. */
export type StagePosition = string | number;

/** A character on stage when a scene starts. */
export interface SceneCast {
  id: string;
  at?: StagePosition;
  /** Start hidden, for a later `>>> show`. */
  hidden?: boolean;
  animation?: string;
  skin?: readonly string[];
  flip?: boolean;
}

/**
 * Scene kinds. `ink` scenes play their script from start to end. `custom` scenes run a component
 * registered by the game's code (a minigame); their script is optional and holds knots the
 * component plays as dialogue.
 */
export type SceneKind = "ink" | "custom";
export const SCENE_KINDS: readonly SceneKind[] = ["ink", "custom"];

/**
 * What happens when a scene ends with a named outcome (`>>> end_scene won`, or a custom scene's
 * `complete("won")`). Variables change first, then play moves on.
 */
export interface SceneOutcome {
  /** Scene to play next, in any level. Defaults to the scene's usual successor. */
  next?: string;
  /** Variables to set. */
  set?: Readonly<Record<string, StateValue>>;
  /** Amounts to add to numeric variables (negative subtracts). */
  add?: Readonly<Record<string, number>>;
  /** End the level, end the game (rolling the credits) or lose, instead of moving to `next`. */
  flow?: "end-level" | "end-game" | "game-over";
  /** Ending id recorded with `flow: "end-game"`. */
  ending?: string;
}
export const OUTCOME_FLOWS = ["end-level", "end-game", "game-over"] as const;

export interface SceneManifest {
  id: string;
  title?: string;
  /** Defaults to `ink`. */
  kind?: SceneKind;
  /**
   * Package-relative `.ink` source or compiled `.json` story. Required for `ink` scenes; optional
   * for `custom` scenes, whose component plays its knots.
   */
  script?: string;
  /** `custom` scenes: id of the registered component that runs the scene. */
  component?: string;
  /** `custom` scenes: settings passed to the component, checked against its prop schema. */
  props?: Readonly<Record<string, unknown>>;
  /** Wiring for named outcomes. Unwired outcomes continue to the scene's usual successor. */
  outcomes?: Readonly<Record<string, SceneOutcome>>;
  /** Backdrop id when the scene starts. */
  backdrop?: string;
  /** Characters on stage when the scene starts. */
  cast?: readonly SceneCast[];
  /** Scene id (in the same level) to play next; defaults to the next scene in order. */
  next?: string;
  /** Package-relative music file that starts with the scene. */
  music?: string;
}

export interface LevelManifest {
  id: string;
  title?: string;
  description?: string;
  scenes: readonly SceneManifest[];
  /**
   * Ends the level early once true, checked after every scene. Without it (or if it never holds)
   * the level ends after its last scene.
   */
  completeWhen?: Condition;
  /** Show a level-complete card before the next level. Defaults to true. */
  interstitial?: boolean;
}

export interface StageManifest {
  /** Design size; the camera always fits it. Defaults to 1280 × 720. */
  width?: number;
  height?: number;
  /** Clear color behind backdrops. */
  background?: string;
  /** Default baseline Y for characters. Defaults to `-height / 2`. */
  floor?: number;
  /** Named X marks, merged over the defaults (`farLeft`, `left`, `center`, `right`, `farRight`). */
  positions?: Readonly<Record<string, number>>;
}

export interface CreditsManifest {
  title?: string;
  sections?: readonly { heading?: string; lines: readonly string[] }[];
}

export interface SaveManifest {
  /** Number of manual save slots. Defaults to 3; 0 disables manual saves. */
  slots?: number;
  /** Keep a single automatic save slot. Defaults to true. */
  autosave?: boolean;
}

export interface GameManifest {
  format: typeof MANIFEST_FORMAT;
  formatVersion: typeof MANIFEST_VERSION;
  /** Stable identity; saves only load into the game with the same id. */
  id: string;
  title: string;
  /** The game's own version, recorded in saves. */
  version?: string;
  author?: string;
  description?: string;
  stage?: StageManifest;
  state?: { variables?: Readonly<Record<string, VariableDefinition>> };
  characters?: Readonly<Record<string, CharacterManifest>>;
  backdrops?: Readonly<Record<string, BackdropManifest>>;
  levels: readonly LevelManifest[];
  /** Ends the game as lost once true, checked whenever state changes. */
  gameOverWhen?: Condition;
  credits?: CreditsManifest;
  saves?: SaveManifest;
  /** Dialogue presentation (preset, theme, speed…) as plain JSON, applied by the player. */
  dialogue?: Readonly<Record<string, unknown>>;
  /** Free-form data for tools and custom code. */
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ManifestIssue {
  severity: "error" | "warning";
  /** Dotted location in the manifest, e.g. `levels.0.scenes.1.backdrop`. */
  path: string;
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const ID = /^[A-Za-z_][\w-]*$/;

/**
 * Checks a manifest's structure and references. Pass the package's file list to also report missing
 * files. Never throws; an empty list means the manifest is valid.
 */
export function validateManifest(value: unknown, files?: readonly string[]): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: "error", path, message });
  const warn = (path: string, message: string) =>
    issues.push({ severity: "warning", path, message });
  if (!isRecord(value)) {
    error("", "The manifest must be a JSON object.");
    return issues;
  }
  const fileSet = files ? new Set(files) : null;
  const file = (path: string, at: string) => {
    if (typeof path !== "string" || !path) error(at, "Expected a file path.");
    else if (fileSet && !fileSet.has(path.replace(/^\.?\//, "")))
      error(at, `File not found in package: ${path}`);
  };
  if (value.format !== MANIFEST_FORMAT)
    error("format", `Expected "${MANIFEST_FORMAT}"; is this a game manifest?`);
  if (value.formatVersion !== MANIFEST_VERSION)
    error("formatVersion", `Unsupported format version ${String(value.formatVersion)}.`);
  if (typeof value.id !== "string" || !value.id) error("id", "A game id is required.");
  if (typeof value.title !== "string") error("title", "A title is required.");

  const variables = isRecord(value.state) ? value.state.variables : undefined;
  if (variables !== undefined && !isRecord(variables))
    error("state.variables", "Expected an object.");
  for (const [name, definition] of Object.entries(isRecord(variables) ? variables : {})) {
    const at = `state.variables.${name}`;
    if (!/^[A-Za-z_]\w*$/.test(name))
      error(at, "Variable names must be valid Ink identifiers (letters, digits, underscores).");
    if (!isRecord(definition) || !["number", "boolean", "string"].includes(String(definition.type)))
      error(at, "Expected { type: number | boolean | string, default }.");
    else if (typeof definition.default !== definition.type)
      error(`${at}.default`, `Expected a ${String(definition.type)} default.`);
  }

  const characters = isRecord(value.characters) ? value.characters : {};
  for (const [id, character] of Object.entries(characters)) {
    const at = `characters.${id}`;
    if (!ID.test(id)) error(at, "Character ids must be identifiers (letters, digits, _ and -).");
    if (!isRecord(character)) {
      error(at, "Expected an object.");
      continue;
    }
    if (typeof character.name !== "string") error(`${at}.name`, "A display name is required.");
    if (character.sprite !== undefined) {
      if (!isRecord(character.sprite)) error(`${at}.sprite`, "Expected { skeleton, atlas }.");
      else {
        file(character.sprite.skeleton as string, `${at}.sprite.skeleton`);
        file(character.sprite.atlas as string, `${at}.sprite.atlas`);
        const hides = character.sprite.hides;
        if (
          hides !== undefined &&
          (!isRecord(hides) ||
            !Object.values(hides).every(
              (slots) => Array.isArray(slots) && slots.every((slot) => typeof slot === "string"),
            ))
        )
          error(`${at}.sprite.hides`, "Expected { skin-or-folder: [slot, ...] }.");
        const transitions = character.sprite.transitions;
        const isNames = (names: unknown) =>
          Array.isArray(names) && names.every((name) => typeof name === "string");
        if (
          transitions !== undefined &&
          (!Array.isArray(transitions) ||
            !transitions.every(
              (entry) =>
                Array.isArray(entry) &&
                entry.length === 3 &&
                typeof entry[0] === "string" &&
                typeof entry[1] === "string" &&
                isNames(entry[2]),
            ))
        )
          error(`${at}.sprite.transitions`, "Expected [[from, to, [via, ...]], ...].");
        const groups = character.sprite.colorGroups;
        if (groups !== undefined && !isRecord(groups))
          error(`${at}.sprite.colorGroups`, "Expected an object.");
        for (const [name, group] of Object.entries(isRecord(groups) ? groups : {})) {
          const gat = `${at}.sprite.colorGroups.${name}`;
          if (!isRecord(group) || !Array.isArray(group.slots))
            error(gat, "Expected { slots: [...] }.");
          else if (group.default !== undefined && !isColor(group.default))
            error(`${gat}.default`, "Expected a hex color.");
          else
            for (const [preset, color] of Object.entries(
              isRecord(group.presets) ? group.presets : {},
            ))
              if (!isColor(color)) error(`${gat}.presets.${preset}`, "Expected a hex color.");
        }
      }
    }
    for (const [name, outfit] of Object.entries(
      isRecord(character.outfits) ? character.outfits : {},
    )) {
      const look = isRecord(outfit) ? outfit : { skin: outfit };
      if (!Array.isArray(look.skin) || !look.skin.every((skin) => typeof skin === "string"))
        error(`${at}.outfits.${name}`, "Expected a skin list or { skin, colors }.");
      else if (
        look.colors !== undefined &&
        (!isRecord(look.colors) || !Object.values(look.colors).every(isColor))
      )
        error(`${at}.outfits.${name}.colors`, "Expected { group: hex color }.");
    }
    if (character.colors !== undefined) {
      if (!isRecord(character.colors)) error(`${at}.colors`, "Expected { group: color }.");
      else
        for (const [name, color] of Object.entries(character.colors))
          if (!isColor(color)) error(`${at}.colors.${name}`, "Expected a hex color.");
    }
  }

  const backdrops = isRecord(value.backdrops) ? value.backdrops : {};
  for (const [id, backdrop] of Object.entries(backdrops)) {
    const at = `backdrops.${id}`;
    if (!ID.test(id)) error(at, "Backdrop ids must be identifiers (letters, digits, _ and -).");
    if (!isRecord(backdrop)) error(at, "Expected an object.");
    else if (backdrop.type === "image") file(backdrop.image as string, `${at}.image`);
    else if (backdrop.type === "color") {
      if (typeof backdrop.color !== "string") error(`${at}.color`, "Expected a color.");
    } else if (backdrop.type === "gradient") {
      if (!Array.isArray(backdrop.colors) || backdrop.colors.length < 2)
        error(`${at}.colors`, "Expected at least two colors.");
    } else error(`${at}.type`, "Expected image, color or gradient.");
  }

  if (!Array.isArray(value.levels) || !value.levels.length)
    error("levels", "A game needs at least one level.");
  const levelIds = new Set<string>();
  const sceneIds = new Set<string>();
  const everyScene = new Set<string>();
  for (const level of Array.isArray(value.levels) ? value.levels : [])
    if (isRecord(level) && Array.isArray(level.scenes))
      for (const scene of level.scenes as unknown[])
        if (isRecord(scene) && typeof scene.id === "string") everyScene.add(scene.id);
  const declared = isRecord(variables) ? variables : {};
  (Array.isArray(value.levels) ? value.levels : []).forEach((level: unknown, li) => {
    const at = `levels.${li}`;
    if (!isRecord(level)) return error(at, "Expected an object.");
    if (typeof level.id !== "string" || !ID.test(level.id))
      error(`${at}.id`, "Level ids must be identifiers.");
    else if (levelIds.has(level.id)) error(`${at}.id`, `Duplicate level id: ${level.id}`);
    else levelIds.add(level.id);
    if (!Array.isArray(level.scenes) || !level.scenes.length)
      return error(`${at}.scenes`, "A level needs at least one scene.");
    const local = new Set<string>();
    for (const scene of level.scenes as unknown[])
      if (isRecord(scene) && typeof scene.id === "string") local.add(scene.id);
    (level.scenes as unknown[]).forEach((scene, si) => {
      const sat = `${at}.scenes.${si}`;
      if (!isRecord(scene)) return error(sat, "Expected an object.");
      if (typeof scene.id !== "string" || !ID.test(scene.id))
        error(`${sat}.id`, "Scene ids must be identifiers.");
      else if (sceneIds.has(scene.id))
        error(`${sat}.id`, `Duplicate scene id: ${scene.id} (scene ids are unique per game).`);
      else sceneIds.add(scene.id);
      const kind = scene.kind ?? "ink";
      if (!SCENE_KINDS.includes(kind as SceneKind))
        error(`${sat}.kind`, `Unsupported scene kind: ${JSON.stringify(scene.kind)}`);
      if (kind !== "custom" || scene.script !== undefined)
        file(scene.script as string, `${sat}.script`);
      if (kind === "custom") {
        if (typeof scene.component !== "string" || !ID.test(scene.component))
          error(`${sat}.component`, "Custom scenes need the id of a registered component.");
        if (scene.props !== undefined && !isRecord(scene.props))
          error(`${sat}.props`, "Expected an object.");
      }
      if (scene.outcomes !== undefined) {
        if (!isRecord(scene.outcomes)) error(`${sat}.outcomes`, "Expected an object.");
        else
          for (const [name, outcome] of Object.entries(scene.outcomes))
            checkOutcome(outcome, `${sat}.outcomes.${name}`, everyScene, declared, error);
      }
      if (typeof scene.backdrop === "string" && !(scene.backdrop in backdrops))
        error(`${sat}.backdrop`, `Unknown backdrop: ${scene.backdrop}`);
      if (typeof scene.next === "string" && !local.has(scene.next))
        error(`${sat}.next`, `No scene "${scene.next}" in this level.`);
      if (typeof scene.music === "string") file(scene.music, `${sat}.music`);
      (Array.isArray(scene.cast) ? scene.cast : []).forEach((member: unknown, ci) => {
        if (!isRecord(member) || typeof member.id !== "string")
          error(`${sat}.cast.${ci}`, "Expected { id }.");
        else if (!(member.id in characters))
          error(`${sat}.cast.${ci}.id`, `Unknown character: ${member.id}`);
        else if (!isRecord(characters[member.id]) || !(characters[member.id] as any).sprite)
          warn(`${sat}.cast.${ci}.id`, `${member.id} has no sprite, so it can't appear on stage.`);
      });
    });
  });
  if (isRecord(value.saves) && value.saves.slots !== undefined) {
    const slots = value.saves.slots;
    if (typeof slots !== "number" || !Number.isInteger(slots) || slots < 0 || slots > 99)
      error("saves.slots", "Expected a whole number from 0 to 99.");
  }
  return issues;
}

function checkOutcome(
  outcome: unknown,
  at: string,
  scenes: ReadonlySet<string>,
  variables: Record<string, unknown>,
  error: (path: string, message: string) => void,
) {
  if (!isRecord(outcome)) return error(at, "Expected { next, set, add, flow }.");
  if (outcome.next !== undefined && (typeof outcome.next !== "string" || !scenes.has(outcome.next)))
    error(`${at}.next`, `Unknown scene: ${JSON.stringify(outcome.next)}`);
  if (outcome.flow !== undefined && !OUTCOME_FLOWS.includes(outcome.flow as never))
    error(`${at}.flow`, `Expected one of ${OUTCOME_FLOWS.join(", ")}.`);
  for (const key of ["set", "add"] as const) {
    const changes = outcome[key];
    if (changes === undefined) continue;
    if (!isRecord(changes)) {
      error(`${at}.${key}`, "Expected { variable: value }.");
      continue;
    }
    for (const [name, change] of Object.entries(changes)) {
      const definition = variables[name];
      if (!isRecord(definition)) error(`${at}.${key}.${name}`, `Unknown variable: ${name}`);
      else if (
        key === "add"
          ? typeof change !== "number" || definition.type !== "number"
          : typeof change !== definition.type
      )
        error(
          `${at}.${key}.${name}`,
          key === "add"
            ? `${name} must be a number variable, added to by a number.`
            : `Expected a ${String(definition.type)}.`,
        );
    }
  }
}

/** Validates and returns a manifest, throwing every error at once. */
export function parseManifest(value: unknown, files?: readonly string[]): GameManifest {
  const json = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  const errors = validateManifest(json, files).filter((issue) => issue.severity === "error");
  if (errors.length)
    throw new Error(
      `Invalid game manifest:\n${errors.map((issue) => `  ${issue.path || "(root)"}: ${issue.message}`).join("\n")}`,
    );
  return json as GameManifest;
}

/** Every scene with its level, in play order. */
export function allScenes(manifest: GameManifest) {
  return manifest.levels.flatMap((level) => level.scenes.map((scene) => ({ level, scene })));
}

export function findScene(manifest: GameManifest, sceneId: string) {
  return allScenes(manifest).find((entry) => entry.scene.id === sceneId);
}

/** Initial values of every state variable. */
export function defaultVariables(manifest: GameManifest): Record<string, StateValue> {
  return Object.fromEntries(
    Object.entries(manifest.state?.variables ?? {}).map(([name, definition]) => [
      name,
      definition.default,
    ]),
  );
}

/** A minimal valid manifest to start from. */
export function createManifest(init: Partial<GameManifest> & { id: string; title: string }) {
  return {
    format: MANIFEST_FORMAT,
    formatVersion: MANIFEST_VERSION,
    levels: [],
    ...init,
  } as GameManifest;
}
