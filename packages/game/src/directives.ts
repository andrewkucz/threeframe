import type { GameManifest, StateValue } from "./manifest";
import {
  removeSkins,
  resolvePosition,
  stageCharacter,
  wearSkins,
  type Ease,
  type StageCharacter,
  type StageEdge,
  type StageState,
} from "./stage";

export type DirectiveValue = string | number | boolean;

/**
 * A parsed directive: `name arg1 arg2 key=value flag`. Directives come from Ink command lines
 * (`>>> show ada at=left`) and from tags (`# show ada at=left`, or the compact `# show:ada`).
 */
export interface Directive {
  name: string;
  /** Positional arguments, including bare flags such as `wait`. */
  args: readonly DirectiveValue[];
  /** `key=value` options. */
  options: Readonly<Record<string, DirectiveValue>>;
  /** The original text. */
  source: string;
}

const scalar = (text: string): DirectiveValue => {
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return Number(text);
  return text;
};

/** Splits on whitespace, keeping quoted runs (`"a b"` or `'a b'`) together. */
function tokenize(text: string): { text: string; quoted: boolean }[] {
  const tokens: { text: string; quoted: boolean }[] = [];
  const pattern = /(\S*?)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')|\S+/g;
  for (const match of text.matchAll(pattern)) {
    const quoted = match[2] ?? match[3];
    if (quoted !== undefined)
      tokens.push({ text: match[1] + quoted.replace(/\\(.)/g, "$1"), quoted: true });
    else tokens.push({ text: match[0], quoted: false });
  }
  return tokens;
}

/**
 * Parses directive text. Returns `null` for empty text. The compact tag form `name:a:b` (no spaces
 * before the first colon) is accepted too, so `# show:ada` equals `# show ada`.
 */
export function parseDirective(text: string): Directive | null {
  const source = text.trim();
  if (!source) return null;
  const compact = /^([A-Za-z_][\w-]*):(\S.*)$/.exec(source);
  if (compact && !/\s/.test(compact[2].split(":")[0]) && !compact[2].includes("=")) {
    return {
      name: compact[1].toLowerCase(),
      args: compact[2].split(":").map((part) => scalar(part.trim())),
      options: {},
      source,
    };
  }
  const [head, ...rest] = tokenize(source);
  const args: DirectiveValue[] = [];
  const options: Record<string, DirectiveValue> = {};
  for (const token of rest) {
    const option = /^([A-Za-z_][\w-]*)=(.*)$/s.exec(token.text);
    if (option) options[option[1]] = token.quoted ? option[2] : scalar(option[2]);
    else args.push(token.quoted ? token.text : scalar(token.text));
  }
  return { name: head.text.toLowerCase(), args, options, source };
}

/**
 * Writes directive text from parts, quoting values that need it, so code can build directives
 * safely: `formatDirective("show", ["ada"], { at: "left", from: "right" })`.
 */
export function formatDirective(
  name: string,
  args: readonly (DirectiveValue | undefined)[] = [],
  options: Readonly<Record<string, DirectiveValue | undefined>> = {},
) {
  const quote = (value: DirectiveValue) => {
    const text = String(value);
    return text && !/[\s"'#=]/.test(text) ? text : `"${text.replace(/(["\\])/g, "\\$1")}"`;
  };
  return [
    name,
    ...args.filter((value) => value !== undefined).map(quote),
    ...Object.entries(options)
      .filter((entry): entry is [string, DirectiveValue] => entry[1] !== undefined)
      .map(([key, value]) => `${key}=${quote(value)}`),
  ].join(" ");
}

/** Typed access to a directive's arguments. */
export function directiveReader(directive: Directive) {
  const { args, options } = directive;
  return {
    /** Positional argument as a string. */
    arg: (index: number) => (args[index] === undefined ? undefined : String(args[index])),
    /** Every positional argument from `index`, excluding known flags. */
    rest: (index: number, flags: readonly string[] = []) =>
      args
        .slice(index)
        .map(String)
        .filter((value) => !flags.includes(value)),
    option: (name: string) => options[name],
    string: (name: string, fallback?: string) =>
      options[name] === undefined ? fallback : String(options[name]),
    number: (name: string, fallback: number) => {
      const value = options[name];
      if (value === undefined) return fallback;
      const number = Number(value);
      if (!Number.isFinite(number))
        throw new Error(`${name} must be a number: ${directive.source}`);
      return number;
    },
    /** A bare word (`wait`) or `name=true`. */
    flag: (name: string) =>
      options[name] === true || options[name] === "true" || args.slice(1).includes(name),
  };
}

export interface DirectiveContext {
  readonly manifest: GameManifest;
  readonly stage: StageState;
  updateStage(update: (stage: StageState) => StageState): void;
  /** Queues a one-shot effect (shake, flash, sound…) for renderers. */
  effect(type: string, params?: Record<string, DirectiveValue>): void;
  getVariable(name: string): StateValue;
  setVariable(name: string, value: StateValue): void;
  /** Resolves after `seconds` of unpaused play; immediately while skipping. */
  wait(seconds: number): Promise<void>;
  /** Flow control; see the `goto`, `end_level`, `game_over` and `end_game` directives. */
  flow(action: FlowAction): void;
  /** True when the directive runs from a command line (and may hold the story with `wait`). */
  readonly blocking: boolean;
}
export type FlowAction =
  | { type: "goto"; scene: string }
  /** Ends the scene, optionally with a named outcome wired in the scene's `outcomes`. */
  | { type: "end-scene"; outcome?: string; data?: unknown }
  | { type: "end-level" }
  | { type: "game-over" }
  | { type: "end-game"; ending?: string };

export interface DirectiveDefinition {
  name: string;
  aliases?: readonly string[];
  /** One-line syntax, e.g. `show <character> [at=<position>] [fade=<seconds>]`. */
  usage: string;
  description: string;
  category?: "stage" | "character" | "camera" | "effect" | "flow" | "state" | "audio";
  /** Applies the directive. A returned promise holds a command line until it settles. */
  run(directive: Directive, context: DirectiveContext): void | Promise<unknown>;
  /** Static problems for editors, such as unknown characters. Messages, or empty when fine. */
  check?(directive: Directive, manifest: GameManifest): string[];
}

/** Directives by name and alias. Later definitions replace earlier ones with the same name. */
export class DirectiveRegistry {
  private byName = new Map<string, DirectiveDefinition>();
  constructor(definitions: readonly DirectiveDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }
  register(definition: DirectiveDefinition) {
    for (const name of [definition.name, ...(definition.aliases ?? [])])
      this.byName.set(name.toLowerCase(), definition);
    return this;
  }
  get(name: string) {
    return this.byName.get(name.toLowerCase());
  }
  /** Unique definitions, in registration order. */
  list(): DirectiveDefinition[] {
    return [...new Set(this.byName.values())];
  }
  /** Names handled elsewhere and never reported as unknown (the Ink layer's `speaker`). */
  static readonly reserved = new Set(["speaker"]);
}

// Helpers -----------------------------------------------------------------------------------------

const EASES = new Set<Ease>(["linear", "in", "out", "inOut"]);
const EDGES = new Set<StageEdge>(["left", "right", "top", "bottom"]);
const ease = (value: string | undefined, fallback: Ease): Ease =>
  value && EASES.has(value as Ease) ? (value as Ease) : fallback;
const edge = (value: string | undefined) =>
  value && EDGES.has(value as StageEdge) ? (value as StageEdge) : undefined;
const list = (value: string | undefined) =>
  value
    ? value
        .split(/[+,]/)
        .map((part) => part.trim())
        .filter(Boolean)
    : undefined;

/**
 * Colors as CSS colors or bare hex. Ink reads `#` as the start of a tag, so scripts write `fff`,
 * `ffcc00`, a color name, or an escaped `\#fff`.
 */
export function directiveColor(value: DirectiveValue | undefined, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  const text = String(value).trim();
  return /^[0-9a-f]{3,4}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(text) ? `#${text}` : text;
}

const finish = (context: DirectiveContext, directive: Directive, seconds: number) =>
  context.blocking && directiveReader(directive).flag("wait") && seconds > 0
    ? context.wait(seconds)
    : undefined;

function requireCharacter(context: DirectiveContext, directive: Directive, index = 0) {
  const id = directiveReader(directive).arg(index);
  if (!id) throw new Error(`Missing character: ${directive.source}`);
  if (!context.manifest.characters?.[id]) throw new Error(`Unknown character: ${id}`);
  return id;
}
function updateCharacter(
  context: DirectiveContext,
  id: string,
  update: (character: StageCharacter) => Partial<StageCharacter>,
) {
  context.updateStage((stage) => {
    const current =
      stage.characters[id] ??
      stageCharacter(context.manifest, id, {
        visible: false,
        z: Object.keys(stage.characters).length,
      });
    return {
      ...stage,
      characters: { ...stage.characters, [id]: { ...current, ...update(current) } },
    };
  });
}
const checkCharacter = (directive: Directive, manifest: GameManifest, index = 0) => {
  const id = directive.args[index];
  if (id === undefined) return ["Missing character id."];
  return manifest.characters?.[String(id)] ? [] : [`Unknown character: ${String(id)}`];
};
const checkPosition = (manifest: GameManifest, at: DirectiveValue | undefined) => {
  if (at === undefined) return [];
  try {
    resolvePosition(manifest, at as string | number);
    return [];
  } catch (error) {
    return [(error as Error).message];
  }
};
const checkVariable = (directive: Directive, manifest: GameManifest) => {
  const name = directive.args[0];
  if (name === undefined) return ["Missing variable name."];
  return manifest.state?.variables?.[String(name)] ? [] : [`Unknown variable: ${String(name)}`];
};

// Built-ins ---------------------------------------------------------------------------------------

export const builtinDirectives: readonly DirectiveDefinition[] = [
  {
    name: "backdrop",
    aliases: ["bg"],
    category: "stage",
    usage: "backdrop <id|none> [duration=0.8] [wait]",
    description: "Cross-fades to another backdrop.",
    run(directive, context) {
      const read = directiveReader(directive);
      const id = read.arg(0);
      if (!id) throw new Error(`Missing backdrop: ${directive.source}`);
      if (id !== "none" && !context.manifest.backdrops?.[id])
        throw new Error(`Unknown backdrop: ${id}`);
      const duration = read.number("duration", 0.8);
      context.updateStage((stage) => ({
        ...stage,
        backdrop: { id: id === "none" ? null : id, duration },
      }));
      return finish(context, directive, duration);
    },
    check: (directive, manifest) => {
      const id = directive.args[0];
      if (id === undefined) return ["Missing backdrop id."];
      return id === "none" || manifest.backdrops?.[String(id)]
        ? []
        : [`Unknown backdrop: ${String(id)}`];
    },
  },
  {
    name: "show",
    aliases: ["enter"],
    category: "character",
    usage:
      "show <character> [at=<position>] [from=left|right|top|bottom] [fade=0.4] [anim=<name>] [outfit=<name>] [skin=a+b] [flip] [wait]",
    description: "Brings a character on stage, optionally sliding in from an edge.",
    run(directive, context) {
      const read = directiveReader(directive);
      const id = requireCharacter(context, directive);
      const duration = read.number("fade", read.number("duration", 0.4));
      const at = read.option("at") ?? read.arg(1);
      const outfit = read.string("outfit");
      const named = outfit ? context.manifest.characters?.[id]?.outfits?.[outfit] : undefined;
      if (outfit && !named) throw new Error(`Unknown outfit for ${id}: ${outfit}`);
      updateCharacter(context, id, (current) => ({
        visible: true,
        ...(at !== undefined && at !== "wait" && at !== "flip"
          ? { x: resolvePosition(context.manifest, at as string | number) }
          : {}),
        ...(read.option("y") !== undefined && { y: read.number("y", 0) }),
        ...(read.option("scale") !== undefined && { scale: read.number("scale", 1) }),
        ...(read.option("anim") !== undefined && { animation: read.string("anim"), loop: true }),
        ...(named && { skin: [...named] }),
        ...(read.string("skin") && { skin: list(read.string("skin")) }),
        ...(read.flag("flip") && { flip: !current.flip }),
        ...(read.option("z") !== undefined && { z: read.number("z", current.z) }),
        opacity: read.number("opacity", 1),
        motion: {
          duration,
          ease: ease(read.string("ease"), "out"),
          from: edge(read.string("from")),
        },
      }));
      return finish(context, directive, duration);
    },
    check: (directive, manifest) => [
      ...checkCharacter(directive, manifest),
      ...checkPosition(manifest, directive.options.at),
    ],
  },
  {
    name: "hide",
    aliases: ["exit"],
    category: "character",
    usage: "hide <character> [to=left|right|top|bottom] [fade=0.4] [wait]",
    description: "Takes a character off stage, optionally sliding out to an edge.",
    run(directive, context) {
      const read = directiveReader(directive);
      const id = requireCharacter(context, directive);
      const duration = read.number("fade", read.number("duration", 0.4));
      updateCharacter(context, id, () => ({
        visible: false,
        motion: { duration, ease: ease(read.string("ease"), "in"), to: edge(read.string("to")) },
      }));
      return finish(context, directive, duration);
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "move",
    category: "character",
    usage: "move <character> <position> [y=<y>] [duration=0.6] [ease=inOut] [wait]",
    description: "Moves a character to another stage position.",
    run(directive, context) {
      const read = directiveReader(directive);
      const id = requireCharacter(context, directive);
      const at = read.option("at") ?? read.arg(1);
      if (at === undefined) throw new Error(`Missing position: ${directive.source}`);
      const duration = read.number("duration", 0.6);
      updateCharacter(context, id, () => ({
        x: resolvePosition(context.manifest, at as string | number),
        ...(read.option("y") !== undefined && { y: read.number("y", 0) }),
        motion: { duration, ease: ease(read.string("ease"), "inOut") },
      }));
      return finish(context, directive, duration);
    },
    check: (directive, manifest) => [
      ...checkCharacter(directive, manifest),
      ...(directive.args[1] === undefined && directive.options.at === undefined
        ? ["Missing position."]
        : checkPosition(manifest, directive.options.at ?? directive.args[1])),
    ],
  },
  {
    name: "anim",
    aliases: ["animation", "play"],
    category: "character",
    usage: "anim <character> <animation> [loop=false] [then=<animation>]",
    description:
      "Plays an animation on a character. Non-looping animations return to `then` (alias `next`), or the idle.",
    run(directive, context) {
      const read = directiveReader(directive);
      const id = requireCharacter(context, directive);
      const animation = read.arg(1);
      if (!animation) throw new Error(`Missing animation: ${directive.source}`);
      const loop =
        read.option("loop") === undefined
          ? !(read.option("then") ?? read.option("next"))
          : read.flag("loop");
      updateCharacter(context, id, (current) => ({
        animation,
        loop,
        next: loop
          ? undefined
          : (read.string("then") ??
            read.string("next") ??
            context.manifest.characters?.[id]?.animation ??
            (current.loop ? current.animation : current.next)),
      }));
    },
    check: (directive, manifest) => [
      ...checkCharacter(directive, manifest),
      ...(directive.args[1] === undefined ? ["Missing animation name."] : []),
    ],
  },
  {
    name: "overlay",
    category: "character",
    usage: "overlay <character> <animation...|none>",
    description: "Blends looping animations above the base one (tracks 1, 2, …), e.g. a blink.",
    run(directive, context) {
      const id = requireCharacter(context, directive);
      const names = directiveReader(directive).rest(1);
      updateCharacter(context, id, () => ({
        overlays: names.length === 1 && names[0] === "none" ? [] : names,
      }));
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "wear",
    aliases: ["puton"],
    category: "character",
    usage: "wear <character> <skin...>",
    description:
      "Adds skins; each replaces whatever the character wears from the same skin folder.",
    run(directive, context) {
      const id = requireCharacter(context, directive);
      const skins = directiveReader(directive).rest(1);
      updateCharacter(context, id, (current) => ({ skin: wearSkins(current.skin, skins) }));
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "remove",
    aliases: ["takeoff"],
    category: "character",
    usage: "remove <character> <skin-or-folder...>",
    description: "Removes skins by name, or every skin in a folder (`remove ada clothes/top`).",
    run(directive, context) {
      const id = requireCharacter(context, directive);
      const skins = directiveReader(directive).rest(1);
      updateCharacter(context, id, (current) => ({ skin: removeSkins(current.skin, skins) }));
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "outfit",
    category: "character",
    usage: "outfit <character> <outfit-name | skin...>",
    description:
      "Replaces every skin with a named outfit from the character, or with the listed skins.",
    run(directive, context) {
      const id = requireCharacter(context, directive);
      const names = directiveReader(directive).rest(1);
      const named =
        names.length === 1 ? context.manifest.characters?.[id]?.outfits?.[names[0]] : undefined;
      updateCharacter(context, id, () => ({ skin: named ? [...named] : names }));
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "attach",
    category: "character",
    usage: "attach <character> <slot> <attachment|none|reset>",
    description:
      "Shows an attachment in a slot, hides the slot (`none`), or restores it (`reset`).",
    run(directive, context) {
      const read = directiveReader(directive);
      const id = requireCharacter(context, directive);
      const slot = read.arg(1);
      const name = read.arg(2);
      if (!slot || !name) throw new Error(`Expected a slot and attachment: ${directive.source}`);
      updateCharacter(context, id, (current) => {
        const attachments = { ...current.attachments };
        if (name === "reset") delete attachments[slot];
        else attachments[slot] = name === "none" ? null : name;
        return { attachments };
      });
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "face",
    category: "character",
    usage: "face <character> left|right|flip",
    description:
      "Turns a character. `left`/`right` assume the sprite faces right unflipped; `flip` mirrors.",
    run(directive, context) {
      const id = requireCharacter(context, directive);
      const way = directiveReader(directive).arg(1) ?? "flip";
      updateCharacter(context, id, (current) => ({
        flip: way === "flip" ? !current.flip : way === "left",
      }));
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "tint",
    category: "character",
    usage: "tint <character> <color> [duration=0.3]",
    description: "Multiplies a character's color, e.g. `666` to put them in shadow; `fff` resets.",
    run(directive, context) {
      const read = directiveReader(directive);
      const id = requireCharacter(context, directive);
      const duration = read.number("duration", 0.3);
      updateCharacter(context, id, (current) => ({
        tint: directiveColor(directive.args[1], "#ffffff"),
        motion: { ...current.motion, duration, from: undefined, to: undefined },
      }));
      return finish(context, directive, duration);
    },
    check: (directive, manifest) => checkCharacter(directive, manifest),
  },
  {
    name: "camera",
    category: "camera",
    usage:
      "camera [zoom=1] [x=0] [y=0] [focus=<character>] [duration=1] [ease=inOut] [wait] | camera reset",
    description: "Pans and zooms the view; `focus` centers a character.",
    run(directive, context) {
      const read = directiveReader(directive);
      const duration = read.number("duration", 1);
      const focus = read.string("focus");
      if (focus && !context.manifest.characters?.[focus])
        throw new Error(`Unknown character: ${focus}`);
      context.updateStage((stage) => {
        if (read.arg(0) === "reset")
          return { ...stage, camera: { zoom: 1, x: 0, y: 0, duration, ease: "inOut" } };
        const target = focus ? stage.characters[focus] : undefined;
        return {
          ...stage,
          camera: {
            zoom: read.number("zoom", stage.camera.zoom),
            x: read.number("x", target ? target.x : stage.camera.x),
            y: read.number("y", stage.camera.y),
            duration,
            ease: ease(read.string("ease"), "inOut"),
          },
        };
      });
      return finish(context, directive, duration);
    },
  },
  {
    name: "shake",
    category: "camera",
    usage: "shake [strength=12] [duration=0.45] [wait]",
    description: "Shakes the camera.",
    run(directive, context) {
      const read = directiveReader(directive);
      const duration = read.number("duration", 0.45);
      context.effect("shake", { strength: read.number("strength", 12), duration });
      return finish(context, directive, duration);
    },
  },
  {
    name: "flash",
    category: "effect",
    usage: "flash [color=ffffff] [duration=0.4]",
    description: "Flashes the screen with a color.",
    run(directive, context) {
      const read = directiveReader(directive);
      const duration = read.number("duration", 0.4);
      context.effect("flash", {
        color: directiveColor(read.option("color") ?? directive.args[0], "#ffffff"),
        duration,
      });
      return finish(context, directive, duration);
    },
  },
  {
    name: "fade",
    category: "effect",
    usage: "fade out|in [color=000000] [duration=1] [opacity=1] [wait]",
    description: "Fades the whole scene to a color (`out`) or back (`in`).",
    run(directive, context) {
      const read = directiveReader(directive);
      const direction = read.arg(0) ?? "out";
      if (direction !== "out" && direction !== "in")
        throw new Error(`Expected fade out or fade in: ${directive.source}`);
      const duration = read.number("duration", 1);
      context.updateStage((stage) => ({
        ...stage,
        overlay: {
          color: directiveColor(read.option("color"), stage.overlay.color),
          opacity: direction === "out" ? read.number("opacity", 1) : 0,
          duration,
        },
      }));
      return finish(context, directive, duration);
    },
  },
  {
    name: "vignette",
    category: "effect",
    usage: "vignette <strength 0–1> [duration=1]",
    description: "Darkens the edges of the screen.",
    run(directive, context) {
      const read = directiveReader(directive);
      const strength = Number(read.arg(0) ?? 0.6);
      const duration = read.number("duration", 1);
      context.updateStage((stage) => ({
        ...stage,
        vignette: { strength: Number.isFinite(strength) ? strength : 0.6, duration },
      }));
    },
  },
  {
    name: "weather",
    aliases: ["particles"],
    category: "effect",
    usage: "weather rain|snow|dust|petals|fireflies|none [intensity=1] [wind=0]",
    description: "Starts or stops ambient particles.",
    run(directive, context) {
      const read = directiveReader(directive);
      const type = read.arg(0) ?? "none";
      context.updateStage((stage) => ({
        ...stage,
        weather: {
          type: type === "none" || type === "off" ? null : type,
          intensity: read.number("intensity", 1),
          wind: read.number("wind", 0),
        },
      }));
    },
  },
  {
    name: "dialogue",
    category: "stage",
    usage: "dialogue hide|show",
    description: "Hides or shows the dialogue box, e.g. around a cinematic moment.",
    run(directive, context) {
      const visible = directiveReader(directive).arg(0) !== "hide";
      context.updateStage((stage) => ({ ...stage, dialogue: { visible } }));
    },
  },
  {
    name: "wait",
    aliases: ["pause"],
    category: "flow",
    usage: "wait <seconds>",
    description: "Holds the story (on a command line) for a number of seconds.",
    run(directive, context) {
      const seconds = Number(directive.args[0] ?? 1);
      return context.blocking && seconds > 0 ? context.wait(seconds) : undefined;
    },
  },
  {
    name: "set",
    category: "state",
    usage: "set <variable> <value>",
    description:
      "Sets a game state variable. Ink can also assign game variables directly: `~ coins = 5`.",
    run(directive, context) {
      const name = directiveReader(directive).arg(0);
      if (!name || directive.args[1] === undefined)
        throw new Error(`Expected a variable and value: ${directive.source}`);
      context.setVariable(name, directive.args[1]);
    },
    check: checkVariable,
  },
  {
    name: "add",
    category: "state",
    usage: "add <variable> <amount>",
    description: "Adds to a numeric game state variable (negative amounts subtract).",
    run(directive, context) {
      const name = directiveReader(directive).arg(0);
      const amount = Number(directive.args[1] ?? 1);
      if (!name || !Number.isFinite(amount))
        throw new Error(`Expected a variable and amount: ${directive.source}`);
      const current = context.getVariable(name);
      if (typeof current !== "number") throw new Error(`${name} is not a number.`);
      context.setVariable(name, current + amount);
    },
    check: checkVariable,
  },
  {
    name: "goto",
    category: "flow",
    usage: "goto <scene>",
    description: "Ends this scene and plays another scene of the same level.",
    run(directive, context) {
      const scene = directiveReader(directive).arg(0);
      if (!scene) throw new Error(`Missing scene: ${directive.source}`);
      context.flow({ type: "goto", scene });
    },
    check: (directive, manifest) => {
      const scene = directive.args[0];
      if (scene === undefined) return ["Missing scene id."];
      return manifest.levels.some((level) => level.scenes.some((entry) => entry.id === scene))
        ? []
        : [`Unknown scene: ${String(scene)}`];
    },
  },
  {
    name: "end_scene",
    category: "flow",
    usage: "end_scene [outcome]",
    description:
      "Ends this scene now, as if its story had reached END. An outcome follows the scene's wiring for it.",
    run: (directive, context) =>
      context.flow({ type: "end-scene", outcome: directiveReader(directive).arg(0) }),
  },
  {
    name: "end_level",
    category: "flow",
    usage: "end_level",
    description: "Completes the current level now.",
    run: (_, context) => context.flow({ type: "end-level" }),
  },
  {
    name: "game_over",
    category: "flow",
    usage: "game_over",
    description: "Ends the game as lost.",
    run: (_, context) => context.flow({ type: "game-over" }),
  },
  {
    name: "end_game",
    aliases: ["ending"],
    category: "flow",
    usage: "end_game [ending-id]",
    description: "Completes the game and rolls the credits, recording which ending was reached.",
    run: (directive, context) =>
      context.flow({ type: "end-game", ending: directiveReader(directive).arg(0) }),
  },
  {
    name: "music",
    category: "audio",
    usage: "music <file>|stop [volume=1] [fade=1]",
    description: "Plays looping background music from the package, or fades it out.",
    run(directive, context) {
      const read = directiveReader(directive);
      const path = read.arg(0);
      context.updateStage((stage) => ({
        ...stage,
        music: {
          path: !path || path === "stop" ? null : path,
          volume: read.number("volume", stage.music.volume),
          fade: read.number("fade", 1),
        },
      }));
    },
  },
  {
    name: "sound",
    aliases: ["sfx"],
    category: "audio",
    usage: "sound <file> [volume=1]",
    description: "Plays a sound effect from the package once.",
    run(directive, context) {
      const read = directiveReader(directive);
      const path = read.arg(0);
      if (!path) throw new Error(`Missing sound file: ${directive.source}`);
      context.effect("sound", { path, volume: read.number("volume", 1) });
    },
  },
];

export const createDirectiveRegistry = (extra: readonly DirectiveDefinition[] = []) =>
  new DirectiveRegistry([...builtinDirectives, ...extra]);
