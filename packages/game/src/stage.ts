import type { GameManifest, SceneManifest, StagePosition } from "./manifest";

export type Ease = "linear" | "in" | "out" | "inOut";
/** Side of the screen a character enters from or exits to. */
export type StageEdge = "left" | "right" | "top" | "bottom";

/**
 * Presentation state is a *target*: renderers animate from what they currently show toward it over
 * each part's `duration`. That keeps the state serializable and lets restores jump straight to it.
 */
export interface StageCharacter {
  id: string;
  visible: boolean;
  /** Design-space X of the character's origin. */
  x: number;
  /** Baseline Y; omitted uses the character's or stage's default. */
  y?: number;
  scale?: number;
  flip: boolean;
  /** Named view of the sprite (see `SpriteDefinition.views`); omitted is the first. */
  view?: string;
  opacity: number;
  tint: string;
  /** Base animation on track 0. */
  animation?: string;
  loop: boolean;
  /** Animation queued after a non-looping `animation`. */
  next?: string;
  /** Overlay animations on tracks 1, 2, …, e.g. a blink. */
  overlays: readonly string[];
  skin: readonly string[];
  attachments: Readonly<Record<string, string | null>>;
  /** Colors by color group or slot name. */
  colors: Readonly<Record<string, string>>;
  /** Draw order; higher is in front. */
  z: number;
  /** How the latest change animates. */
  motion: {
    duration: number;
    ease: Ease;
    /** Where a character that just became visible slides in from. */
    from?: StageEdge;
    /** Where a character that just became hidden slides out to. */
    to?: StageEdge;
  };
}

export interface StageEffect {
  /** Increasing id; renderers play each effect once. */
  id: number;
  type: string;
  params: Readonly<Record<string, string | number | boolean>>;
}

export interface StageState {
  backdrop: { id: string | null; duration: number };
  characters: Readonly<Record<string, StageCharacter>>;
  camera: {
    zoom: number;
    /** Point at the center of the view. */
    x: number;
    y: number;
    duration: number;
    ease: Ease;
  };
  /** Full-screen color over the scene, for fades to black and similar. */
  overlay: { color: string; opacity: number; duration: number };
  vignette: { strength: number; duration: number };
  /** Ambient particles: `rain`, `snow`, `dust`, `petals`, `fireflies` or a custom type. */
  weather: { type: string | null; intensity: number; wind: number };
  dialogue: { visible: boolean };
  music: { path: string | null; volume: number; fade: number };
  /** One-shot effects such as `shake` and `flash`; never saved. */
  effects: readonly StageEffect[];
  /** Next effect id. */
  effectId: number;
}

export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 720;

export function stageSize(manifest: GameManifest) {
  return {
    width: manifest.stage?.width ?? DEFAULT_WIDTH,
    height: manifest.stage?.height ?? DEFAULT_HEIGHT,
  };
}

/** Named X marks for a manifest: defaults scaled to the design width, then the manifest's own. */
export function stagePositions(manifest: GameManifest): Record<string, number> {
  const { width } = stageSize(manifest);
  return {
    farLeft: -width * 0.38,
    left: -width * 0.24,
    center: 0,
    right: width * 0.24,
    farRight: width * 0.38,
    ...manifest.stage?.positions,
  };
}

/** Resolves a position name or number to an X coordinate. Throws on unknown names. */
export function resolvePosition(manifest: GameManifest, at: StagePosition | undefined): number {
  if (at === undefined || at === "") return 0;
  if (typeof at === "number") return at;
  const numeric = Number(at);
  if (Number.isFinite(numeric)) return numeric;
  const x = stagePositions(manifest)[at];
  if (x === undefined) throw new Error(`Unknown stage position: ${at}`);
  return x;
}

export function emptyStage(): StageState {
  return {
    backdrop: { id: null, duration: 0 },
    characters: {},
    camera: { zoom: 1, x: 0, y: 0, duration: 0, ease: "inOut" },
    overlay: { color: "#000000", opacity: 0, duration: 0 },
    vignette: { strength: 0, duration: 0 },
    weather: { type: null, intensity: 1, wind: 0 },
    dialogue: { visible: true },
    music: { path: null, volume: 1, fade: 0 },
    effects: [],
    effectId: 1,
  };
}

/** A character's resting state from its manifest definition. */
export function stageCharacter(
  manifest: GameManifest,
  id: string,
  overrides: Partial<StageCharacter> = {},
): StageCharacter {
  const definition = manifest.characters?.[id];
  if (!definition) throw new Error(`Unknown character: ${id}`);
  return {
    id,
    visible: true,
    x: 0,
    flip: definition.flip ?? false,
    view: definition.view,
    opacity: 1,
    tint: "#ffffff",
    animation: definition.animation,
    loop: true,
    overlays: [],
    skin: definition.skin ?? [],
    attachments: definition.attachments ?? {},
    colors: definition.colors ?? {},
    z: 0,
    motion: { duration: 0, ease: "out" },
    ...overrides,
  };
}

/**
 * The stage when a scene starts: its backdrop and cast, keeping camera, weather, overlay and the
 * looks of characters that carry over from the previous scene.
 */
export function sceneStage(
  manifest: GameManifest,
  scene: SceneManifest,
  previous: StageState = emptyStage(),
): StageState {
  const characters: Record<string, StageCharacter> = {};
  (scene.cast ?? []).forEach((member, index) => {
    const carried = previous.characters[member.id];
    characters[member.id] = stageCharacter(manifest, member.id, {
      ...(carried && {
        view: carried.view,
        skin: carried.skin,
        attachments: carried.attachments,
        colors: carried.colors,
        tint: carried.tint,
      }),
      x: resolvePosition(manifest, member.at),
      visible: !member.hidden,
      z: index,
      motion: { duration: 0, ease: "out" },
      ...(member.animation !== undefined && { animation: member.animation }),
      ...(member.skin !== undefined && { skin: member.skin }),
      ...(member.flip !== undefined && { flip: member.flip }),
    });
  });
  return {
    ...previous,
    backdrop: {
      id: scene.backdrop ?? previous.backdrop.id,
      duration: previous.backdrop.id ? 0.8 : 0,
    },
    characters,
    music: scene.music
      ? { path: scene.music, volume: previous.music.volume, fade: 1 }
      : previous.music,
    dialogue: { visible: true },
    effects: [],
  };
}

/** The persistent part of a stage, for saves. */
export function serializeStage(stage: StageState): StageState {
  return structuredClone({ ...stage, effects: [] });
}

/**
 * Skin lists are mix-and-match by editor folder: wearing `clothes/top/shirt2` replaces any other
 * `clothes/top/…` skin. Skins without a folder are only replaced by the same name.
 */
export function wearSkins(current: readonly string[], add: readonly string[]): string[] {
  const folder = (name: string) => {
    const slash = name.lastIndexOf("/");
    return slash < 0 ? null : name.slice(0, slash);
  };
  let next = [...current];
  for (const skin of add) {
    const target = folder(skin);
    next = next.filter((existing) =>
      target === null ? existing !== skin : folder(existing) !== target,
    );
    next.push(skin);
  }
  return next;
}

/** Removes skins by full name or by folder (`clothes/top` removes every top). */
export function removeSkins(current: readonly string[], remove: readonly string[]): string[] {
  return current.filter(
    (skin) =>
      !remove.some((target) => skin === target || skin.startsWith(`${target.replace(/\/$/, "")}/`)),
  );
}
