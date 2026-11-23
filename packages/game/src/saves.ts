import type { NarrativeSave } from "@threeframe/ink";
import type { GameManifest, StateValue } from "./manifest";
import type { StageState } from "./stage";

type MaybePromise<T> = T | Promise<T>;

/** Key-value storage for saves and settings. Sync or async; defaults to `localStorage`. */
export interface Persister {
  get(key: string): MaybePromise<string | null>;
  set(key: string, value: string): MaybePromise<void>;
  remove(key: string): MaybePromise<void>;
}

/** Browser `localStorage`, or memory where it is unavailable (private mode, SSR, tests). */
export function localStoragePersister(): Persister {
  let storage: Storage | undefined;
  try {
    storage = globalThis.localStorage;
    storage?.getItem("");
  } catch {
    storage = undefined;
  }
  if (!storage) return memoryPersister();
  const local = storage;
  return {
    get: (key) => local.getItem(key),
    set: (key, value) => local.setItem(key, value),
    remove: (key) => local.removeItem(key),
  };
}

export function memoryPersister(initial: Record<string, string> = {}): Persister & {
  readonly data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

export type GamePhase =
  | "title"
  | "loading"
  | "playing"
  | "level-complete"
  | "game-over"
  | "credits"
  | "complete";

/** How far along a playthrough is. */
export interface GameProgress {
  level: string | null;
  scene: string | null;
  completedScenes: string[];
  completedLevels: string[];
  /** Ending reached with `end_game`, if any. */
  ending: string | null;
  /** Seconds of unpaused play. */
  playtime: number;
  /** Variables as they were when the current level began, for retrying it. */
  levelStart: Record<string, StateValue> | null;
  /** The latest named outcome of each scene that ended with one, by scene id. */
  outcomes: Record<string, string>;
}

export const SAVE_FORMAT = "threeframe.save";
export const SAVE_VERSION = 1;

/**
 * A portable save. Progress and variables are always enough to resume at the start of the saved
 * scene; `scene` additionally restores the exact passage when the scene's script is unchanged.
 */
export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  game: { id: string; version?: string; title?: string };
  /** ISO timestamp. */
  savedAt: string;
  /** Human-readable description, e.g. the level and scene titles. */
  label?: string;
  phase: GamePhase;
  progress: GameProgress;
  variables: Record<string, StateValue>;
  scene?: {
    level: string;
    scene: string;
    /** The exact passage of an Ink scene. */
    narrative?: NarrativeSave;
    /** A custom scene's saved state (its `useSaved` values). */
    custom?: Record<string, unknown>;
    stage: StageState;
  };
  /** Free-form data for custom code. */
  extra?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const stringArray = (value: unknown) =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** Validates a save's structure (and, with a manifest, that it belongs to the game). */
export function parseSave(value: unknown, manifest?: GameManifest): SaveFile {
  const json = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  const fail = (message: string): never => {
    throw new Error(`Invalid save file: ${message}`);
  };
  if (!isRecord(json)) return fail("expected a JSON object.");
  if (json.format !== SAVE_FORMAT) fail(`expected format "${SAVE_FORMAT}".`);
  if (json.version !== SAVE_VERSION) fail(`unsupported version ${String(json.version)}.`);
  if (!isRecord(json.game) || typeof json.game.id !== "string") fail("missing game id.");
  if (typeof json.savedAt !== "string") fail("missing savedAt.");
  const progress = json.progress;
  if (
    !isRecord(progress) ||
    !stringArray(progress.completedScenes) ||
    !stringArray(progress.completedLevels) ||
    !(progress.level === null || typeof progress.level === "string") ||
    !(progress.scene === null || typeof progress.scene === "string")
  )
    fail("malformed progress.");
  if (!isRecord(json.variables)) fail("malformed variables.");
  if (
    json.scene !== undefined &&
    (!isRecord(json.scene) ||
      typeof json.scene.scene !== "string" ||
      !isRecord(json.scene.stage) ||
      !(isRecord(json.scene.narrative) || isRecord(json.scene.custom)))
  )
    fail("malformed scene state.");
  const save = json as unknown as SaveFile;
  save.progress.ending ??= null;
  save.progress.playtime ??= 0;
  save.progress.levelStart ??= null;
  if (!isRecord(save.progress.outcomes)) save.progress.outcomes = {};
  if (manifest && save.game.id !== manifest.id)
    throw new Error(`This save belongs to a different game (${save.game.title ?? save.game.id}).`);
  return save;
}

export const AUTOSAVE_SLOT = "auto";

export interface SaveSlotInfo {
  slot: string;
  kind: "manual" | "auto";
  save: SaveFile | null;
}

export interface SaveStoreOptions {
  /** Namespaces keys, so several games share one persister. */
  gameId: string;
  persister?: Persister;
  /** Manual slots: a count (`"1"`…`"n"`) or explicit names. Defaults to 3. */
  slots?: number | readonly string[];
  /** Keep a single automatic save slot. Defaults to true. */
  autosave?: boolean;
  /** Key prefix. Defaults to `"threeframe"`. */
  namespace?: string;
}

/** Save slots on top of a persister, with change notifications for menus. */
export class SaveStore {
  readonly gameId: string;
  readonly persister: Persister;
  readonly slots: readonly string[];
  readonly autosave: boolean;
  private namespace: string;
  private listeners = new Set<() => void>();
  private writes: Promise<unknown> = Promise.resolve();
  private version = 0;

  constructor({
    gameId,
    persister = localStoragePersister(),
    slots = 3,
    autosave = true,
    namespace = "threeframe",
  }: SaveStoreOptions) {
    this.gameId = gameId;
    this.persister = persister;
    this.slots =
      typeof slots === "number" ? Array.from({ length: slots }, (_, i) => String(i + 1)) : slots;
    this.autosave = autosave;
    this.namespace = namespace;
  }

  key(slot: string) {
    return `${this.namespace}:${this.gameId}:save:${slot}`;
  }
  /** Key for other per-game data, such as settings. */
  dataKey(name: string) {
    return `${this.namespace}:${this.gameId}:${name}`;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Changes whenever a slot is written or deleted. */
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  /** Every slot with its save, autosave first. Unreadable saves show as empty. */
  async list(): Promise<SaveSlotInfo[]> {
    const slots: SaveSlotInfo[] = [
      ...(this.autosave ? [{ slot: AUTOSAVE_SLOT, kind: "auto" as const }] : []),
      ...this.slots.map((slot) => ({ slot, kind: "manual" as const })),
    ].map((entry) => ({ ...entry, save: null }));
    await Promise.all(
      slots.map(async (entry) => {
        entry.save = await this.read(entry.slot).catch(() => null);
      }),
    );
    return slots;
  }

  async read(slot: string): Promise<SaveFile | null> {
    await this.writes;
    const text = await this.persister.get(this.key(slot));
    return text ? parseSave(text) : null;
  }

  /** Writes are serialized, so a fast sequence of autosaves lands in order. */
  write(slot: string, save: SaveFile): Promise<void> {
    const write = this.writes.then(() => this.persister.set(this.key(slot), JSON.stringify(save)));
    this.writes = write.catch(() => {});
    return write.then(() => this.changed());
  }

  delete(slot: string): Promise<void> {
    const remove = this.writes.then(() => this.persister.remove(this.key(slot)));
    this.writes = remove.catch(() => {});
    return remove.then(() => this.changed());
  }

  /** The most recent save across all slots, for a "Continue" button. */
  async latest(): Promise<SaveSlotInfo | null> {
    const slots = (await this.list()).filter((entry) => entry.save);
    slots.sort((a, b) => b.save!.savedAt.localeCompare(a.save!.savedAt));
    return slots[0] ?? null;
  }
}

/** Pretty JSON for a downloadable save file. */
export const serializeSave = (save: SaveFile) => JSON.stringify(save, null, 2);

/** A file name such as `my-game-2026-01-31-1415.save.json`. */
export function saveFileName(save: SaveFile) {
  const stamp = save.savedAt.slice(0, 16).replace(/[T:]/g, "-");
  return `${save.game.id}-${stamp}.save.json`;
}
