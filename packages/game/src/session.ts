import {
  InkController,
  inkAsset,
  type CompiledStory,
  type InkCommand,
  type NarrativeEvent,
  type Story,
} from "@threeframe/ink";
import { evaluateCondition, type Condition } from "./conditions";
import { externalNames, lineStory, resolveSceneProps, type CustomSceneType } from "./custom";
import {
  DirectiveRegistry,
  builtinDirectives,
  parseDirective,
  type Directive,
  type DirectiveContext,
  type DirectiveDefinition,
  type DirectiveValue,
  type FlowAction,
} from "./directives";
import {
  defaultVariables,
  type GameManifest,
  type LevelManifest,
  type SceneManifest,
  type StateValue,
} from "./manifest";
import type { GamePackage } from "./package";
import {
  AUTOSAVE_SLOT,
  SAVE_FORMAT,
  SAVE_VERSION,
  SaveStore,
  parseSave,
  type GamePhase,
  type GameProgress,
  type SaveFile,
  type SaveStoreOptions,
} from "./saves";
import { emptyStage, sceneStage, serializeStage, type StageState } from "./stage";

export type ExternalFunction = (...args: any[]) => unknown;

export interface AutosaveOptions {
  /** When a scene starts. Default true. */
  sceneStart?: boolean;
  /** After every choice. Default true. */
  choice?: boolean;
  /** When a level completes (the save resumes at the next level). Default true. */
  levelComplete?: boolean;
}

export interface GameSessionOptions {
  /** Extra directives, or replacements for built-ins with the same name. */
  directives?: readonly DirectiveDefinition[];
  /**
   * Save slots. Defaults to `localStorage`, with the manifest's slot count and autosave setting.
   * Pass options (for example a custom `persister`), your own store, or `false` for no saves.
   */
  saves?: SaveStore | Omit<SaveStoreOptions, "gameId"> | false;
  /** When to write the autosave slot; `false` never autosaves. */
  autosave?: AutosaveOptions | false;
  /**
   * Ink external functions available in every scene. They are declared for raw `.ink` scripts
   * automatically, so authors call them without writing `EXTERNAL`.
   */
  externals?: Readonly<Record<string, ExternalFunction>>;
  /** Called for each scene's story before it starts, to bind observers or more functions. */
  configureStory?: (story: Story, scene: SceneManifest) => void;
  /** Replaces how scene scripts are loaded and compiled. */
  loadStory?: (scene: SceneManifest, signal: AbortSignal) => Promise<CompiledStory>;
  /**
   * Components that run `custom` scenes, by id. Renderers extend each type with what they draw;
   * the session uses the headless part (props, outcomes, externals).
   */
  customScenes?: readonly CustomSceneType[];
}

export type GameEvent =
  | { type: "phase"; phase: GamePhase }
  | { type: "scene-start"; level: LevelManifest; scene: SceneManifest }
  | { type: "scene-end"; level: LevelManifest; scene: SceneManifest }
  | { type: "level-complete"; level: LevelManifest }
  | { type: "variable"; name: string; value: StateValue; previous: StateValue }
  | { type: "directive"; directive: Directive; handled: boolean }
  | { type: "saved"; slot: string; save: SaveFile }
  /** A scene ended with a named outcome. */
  | { type: "outcome"; scene: SceneManifest; outcome: string; data?: unknown }
  | { type: "narrative"; event: NarrativeEvent }
  /** Something went wrong but play continues, e.g. an unknown directive. */
  | { type: "warning"; message: string; error?: Error }
  /** Play could not continue, e.g. a script failed to compile. */
  | { type: "error"; error: Error };

export interface GameSnapshot {
  revision: number;
  phase: GamePhase;
  paused: boolean;
  /** A scene's script is loading. */
  loading: boolean;
  level: LevelManifest | null;
  scene: SceneManifest | null;
  /** The current scene's story. Custom scenes have one only when they have a script. */
  controller: InkController | null;
  /** The running custom scene, if the current scene is one. */
  custom: CustomSceneSnapshot | null;
  stage: StageState;
  variables: Readonly<Record<string, StateValue>>;
  progress: Readonly<GameProgress>;
  /** The error that stopped play, if any. */
  error: Error | null;
}

/** Built-in Ink functions declared in every raw script. */
export const BUILTIN_EXTERNALS: readonly string[] = ["completed(id)", "outcome(id)"];

/** Where a custom scene is in its lifetime, as renderers see it. */
export interface CustomSceneSnapshot {
  /** The scene's API for its component; one per run of the scene. */
  handle: CustomSceneHandle;
  /** The conversation on screen (from the scene's script or `say`); null between them. */
  talk: InkController | null;
  /** Counts conversations, for keying dialogue views. */
  talkId: number;
}

interface CustomSceneHost {
  active(): boolean;
  dialogue(knot: string): Promise<boolean>;
  say(lines: readonly { speaker?: string | null; text: string }[]): Promise<boolean>;
  complete(outcome: string | undefined, data: unknown): void;
  run(text: string): Promise<unknown> | void;
  warn(message: string, error?: unknown): void;
}

let handleIds = 0;

/**
 * A running custom scene, handed to its component: game state, conversations from the scene's
 * script, directives, and the scene's own state, shared between its views and optionally saved.
 * Every method becomes a no-op once the scene is over, so late callbacks can't affect what plays
 * next.
 */
export class CustomSceneHandle {
  /** Unique per run of a scene; re-entering the same scene makes a new handle. */
  readonly id = ++handleIds;
  readonly session: GameSession;
  readonly level: LevelManifest;
  readonly scene: SceneManifest;
  /** The registered type, or null when none is registered for the scene's component. */
  readonly type: CustomSceneType | null;
  /** The scene's settings over the type's defaults. */
  readonly props: Readonly<Record<string, unknown>>;
  /** Whether the scene resumed from a save (its saved state is already in place). */
  readonly restored: boolean;
  private host: CustomSceneHost;
  private state = new Map<string, unknown>();
  private saved = new Set<string>();
  private externals = new Map<string, ExternalFunction>();
  private listeners = new Set<() => void>();

  /** @internal Created by the session. */
  constructor(
    session: GameSession,
    level: LevelManifest,
    scene: SceneManifest,
    type: CustomSceneType | null,
    host: CustomSceneHost,
    restore?: Record<string, unknown>,
  ) {
    this.session = session;
    this.level = level;
    this.scene = scene;
    this.type = type;
    this.props = resolveSceneProps(type ?? undefined, scene.props);
    this.host = host;
    this.restored = !!restore;
    for (const [key, value] of Object.entries(restore ?? {})) {
      this.state.set(key, value);
      this.saved.add(key);
    }
  }

  /** False once the scene has ended (or the game moved elsewhere). */
  get active() {
    return this.host.active();
  }
  /** Whether a conversation is on screen. */
  get talking() {
    return this.active && !!this.session.getSnapshot().custom?.talk;
  }

  /**
   * Plays a knot of the scene's script in the dialogue box, choices and directives included, and
   * resolves when it runs out (`-> DONE`): `true` if it finished, `false` if the scene ended first.
   * Conversations queue; one plays at a time.
   */
  dialogue(knot: string) {
    return this.active ? this.host.dialogue(knot) : Promise.resolve(false);
  }

  /** Shows lines without a script, resolving once the player has read them. */
  say(speaker: string | null, text: string | readonly string[]) {
    if (!this.active) return Promise.resolve(false);
    const lines = (typeof text === "string" ? [text] : text).map((line) => ({
      speaker,
      text: line,
    }));
    return this.host.say(lines);
  }

  /** Ends the scene. A named outcome follows the scene's `outcomes` wiring. */
  complete(outcome?: string, data?: unknown) {
    if (this.active) this.host.complete(outcome, data);
  }

  /** Runs directive text such as `shake strength=8`; blocking ones return a promise. */
  directive(text: string) {
    return this.active ? this.host.run(text) : undefined;
  }

  /** Resolves after `seconds` of unpaused play. */
  wait(seconds: number) {
    return this.active ? this.session.wait(seconds) : new Promise<void>(() => {});
  }

  getVariable(name: string) {
    return this.session.getVariable(name);
  }
  setVariable(name: string, value: StateValue) {
    if (this.active) this.session.setVariable(name, value);
  }

  /**
   * Implements one of the type's `externals` for the scene's script. Returns a function that
   * removes it again.
   */
  provide(name: string, fn: ExternalFunction) {
    this.externals.set(name, fn);
    return () => {
      if (this.externals.get(name) === fn) this.externals.delete(name);
    };
  }
  /** @internal Called by the scene's story. */
  callExternal(name: string, args: unknown[]) {
    const fn = this.externals.get(name);
    if (!fn) {
      this.host.warn(`The script called ${name}() but the scene doesn't provide it right now.`);
      return 0;
    }
    return fn(...args);
  }

  // Scene state -----------------------------------------------------------------------------------

  /** Scene state shared by the scene's views, e.g. its canvas and DOM parts. */
  hasState(key: string) {
    return this.state.has(key);
  }
  getState<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }
  /** Sets scene state. With `save`, the value (which must be JSON) goes into save files. */
  setState(key: string, value: unknown, options: { save?: boolean } = {}) {
    if (options.save) this.saved.add(key);
    if (this.state.get(key) === value && this.state.has(key)) return;
    this.state.set(key, value);
    this.listeners.forEach((listener) => listener());
  }
  /**
   * Returns a key's value, first setting it to `initial()` (without notifying subscribers) when the
   * key is new. Saved keys restored from a save keep their saved value.
   */
  ensureState<T>(key: string, initial: () => T, options: { save?: boolean } = {}): T {
    if (options.save) this.saved.add(key);
    if (!this.state.has(key)) this.state.set(key, initial());
    return this.state.get(key) as T;
  }
  subscribeState = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** The saved part of the scene state, or null when the scene saves nothing. */
  savedState(): Record<string, unknown> | null {
    if (!this.saved.size) return null;
    return structuredClone(
      Object.fromEntries([...this.saved].map((key) => [key, this.state.get(key)])),
    );
  }
}

const freshProgress = (): GameProgress => ({
  level: null,
  scene: null,
  completedScenes: [],
  completedLevels: [],
  ending: null,
  playtime: 0,
  levelStart: null,
  outcomes: {},
});

const now = () => globalThis.performance?.now() ?? Date.now();

interface PendingWait {
  remaining: number;
  started: number;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: () => void;
}

/**
 * A headless playthrough of a game package: phases, levels and scenes, state variables, directives,
 * and saves. Renderers subscribe to snapshots and drive the scene's `controller`.
 */
export class GameSession {
  readonly pkg: GamePackage;
  readonly manifest: GameManifest;
  readonly directives: DirectiveRegistry;
  readonly saves: SaveStore | null;
  /** Registered custom scene types by id. */
  readonly customScenes: ReadonlyMap<string, CustomSceneType>;
  private options: GameSessionOptions;
  private autosaveOptions: Required<AutosaveOptions> | false;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: GameEvent) => void>();
  private snapshot: GameSnapshot;
  private stories = new Map<string, Promise<CompiledStory>>();
  private generation = 0;
  private abort: AbortController | null = null;
  private unsubscribeController: (() => void) | null = null;
  private waits = new Set<PendingWait>();
  private skipping = false;
  private playStarted: number | null = null;
  private pendingFlow: FlowAction | null = null;
  private syncing = false;
  private disposed = false;
  private talkQueue: Promise<unknown> = Promise.resolve();
  private endTalk: ((completed: boolean) => void) | null = null;

  constructor(pkg: GamePackage, options: GameSessionOptions = {}) {
    this.pkg = pkg;
    this.manifest = pkg.manifest;
    this.options = options;
    this.directives = new DirectiveRegistry([...builtinDirectives, ...(options.directives ?? [])]);
    this.customScenes = new Map((options.customScenes ?? []).map((type) => [type.id, type]));
    this.saves =
      options.saves === false
        ? null
        : options.saves instanceof SaveStore
          ? options.saves
          : new SaveStore({
              gameId: this.manifest.id,
              slots: this.manifest.saves?.slots ?? 3,
              autosave: this.manifest.saves?.autosave ?? true,
              ...options.saves,
            });
    this.autosaveOptions =
      options.autosave === false || !this.saves?.autosave
        ? false
        : { sceneStart: true, choice: true, levelComplete: true, ...options.autosave };
    this.snapshot = {
      revision: 0,
      phase: "title",
      paused: false,
      loading: false,
      level: null,
      scene: null,
      controller: null,
      custom: null,
      stage: emptyStage(),
      variables: defaultVariables(this.manifest),
      progress: freshProgress(),
      error: null,
    };
  }

  // Subscriptions ---------------------------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  onEvent = (listener: (event: GameEvent) => void) => {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  };
  private emit(event: GameEvent) {
    this.eventListeners.forEach((listener) => listener(event));
  }
  private update(value: Partial<GameSnapshot>) {
    const phaseChanged = value.phase !== undefined && value.phase !== this.snapshot.phase;
    this.trackPlaytime(value.phase ?? this.snapshot.phase, value.paused ?? this.snapshot.paused);
    this.snapshot = { ...this.snapshot, ...value, revision: this.snapshot.revision + 1 };
    this.listeners.forEach((listener) => listener());
    if (phaseChanged) this.emit({ type: "phase", phase: this.snapshot.phase });
  }
  private warn(message: string, error?: unknown) {
    this.emit({
      type: "warning",
      message,
      error: error === undefined ? undefined : toError(error),
    });
  }
  private fail(error: unknown) {
    const result = toError(error);
    this.update({ error: result, loading: false });
    this.emit({ type: "error", error: result });
  }

  private trackPlaytime(phase: GamePhase, paused: boolean) {
    const playing = phase === "playing" && !paused && !this.disposed;
    if (this.playStarted !== null && !playing) {
      this.snapshot.progress = {
        ...this.snapshot.progress,
        playtime: this.snapshot.progress.playtime + (now() - this.playStarted) / 1000,
      };
      this.playStarted = null;
    } else if (this.playStarted === null && playing) this.playStarted = now();
  }
  /** Progress including the time played since the last phase change. */
  private currentProgress(): GameProgress {
    const progress = this.snapshot.progress;
    return this.playStarted === null
      ? progress
      : { ...progress, playtime: progress.playtime + (now() - this.playStarted) / 1000 };
  }

  // Flow ------------------------------------------------------------------------------------------

  /** Starts a new playthrough from the first scene, with default variables. */
  newGame() {
    const level = this.manifest.levels[0];
    this.update({
      variables: defaultVariables(this.manifest),
      progress: freshProgress(),
      stage: emptyStage(),
      error: null,
    });
    return this.enterLevel(level);
  }

  /**
   * Plays one scene directly, e.g. to test it from an editor. Variables default to the game's
   * initial values; pass some to start from a particular state.
   */
  playScene(sceneId: string, variables?: Readonly<Record<string, StateValue>>) {
    const found = this.findScene(sceneId);
    if (!found) throw new Error(`Unknown scene: ${sceneId}`);
    this.update({
      variables: { ...defaultVariables(this.manifest), ...variables },
      progress: { ...freshProgress(), levelStart: { ...defaultVariables(this.manifest) } },
      stage: emptyStage(),
      error: null,
    });
    return this.enterScene(found.level, found.scene);
  }

  /** From `level-complete`, starts the next level; from `credits`, finishes the game. */
  proceed() {
    const { phase, level } = this.snapshot;
    if (phase === "credits") return this.update({ phase: "complete" });
    if (phase !== "level-complete" || !level) return;
    const next = this.manifest.levels[this.manifest.levels.indexOf(level) + 1];
    if (next) void this.enterLevel(next);
    else this.finishGame();
  }

  /** From `game-over` (or any time), restarts the current level with the variables it began with. */
  retryLevel() {
    const { level, progress } = this.snapshot;
    if (!level) return this.newGame();
    this.update({
      variables: { ...defaultVariables(this.manifest), ...progress.levelStart },
      error: null,
    });
    return this.enterLevel(level, false);
  }

  /** Back to the title screen. The playthrough's state is dropped (save first to keep it). */
  toTitle() {
    this.stopScene();
    this.update({
      phase: "title",
      paused: false,
      loading: false,
      level: null,
      scene: null,
      controller: null,
      custom: null,
      stage: emptyStage(),
      error: null,
    });
  }

  setPaused(paused: boolean) {
    if (paused === this.snapshot.paused) return;
    for (const wait of this.waits) {
      if (paused && wait.timer !== null) {
        clearTimeout(wait.timer);
        wait.timer = null;
        wait.remaining -= (now() - wait.started) / 1000;
      } else if (!paused) this.scheduleWait(wait);
    }
    this.update({ paused });
  }

  /** While skipping, timed waits resolve immediately (fast-forward). */
  setSkipping(skipping: boolean) {
    this.skipping = skipping;
    if (skipping) for (const wait of this.waits) this.resolveWait(wait);
  }

  private findScene(sceneId: string) {
    for (const level of this.manifest.levels) {
      const scene = level.scenes.find((entry) => entry.id === sceneId);
      if (scene) return { level, scene };
    }
    return undefined;
  }

  private enterLevel(level: LevelManifest, recordStart = true) {
    if (recordStart)
      this.update({
        progress: { ...this.snapshot.progress, levelStart: { ...this.snapshot.variables } },
      });
    return this.enterScene(level, level.scenes[0]);
  }

  private stopScene() {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.unsubscribeController?.();
    this.unsubscribeController = null;
    this.pendingFlow = null;
    for (const wait of this.waits) this.resolveWait(wait, false);
    this.endTalk?.(false);
    this.endTalk = null;
    this.talkQueue = Promise.resolve();
  }

  private async enterScene(
    level: LevelManifest,
    scene: SceneManifest,
    restore?: SaveFile["scene"],
  ): Promise<void> {
    this.stopScene();
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.update({
      phase: "playing",
      loading: true,
      error: null,
      level,
      scene,
      custom: null,
      progress: { ...this.snapshot.progress, level: level.id, scene: scene.id },
    });
    const custom = scene.kind === "custom";
    const type = custom ? (this.customScenes.get(scene.component ?? "") ?? null) : null;
    if (custom && !type)
      this.warn(
        `No custom scene component "${scene.component ?? ""}" is registered for "${scene.id}".`,
      );
    let compiled: CompiledStory | null = null;
    if (scene.script) {
      try {
        compiled = await this.story(scene, type, abort.signal);
      } catch (error) {
        if (generation === this.generation) this.fail(error);
        return;
      }
    } else if (!custom) {
      this.fail(new Error(`Scene "${scene.id}" has no script.`));
      return;
    }
    if (generation !== this.generation) return;

    const restoreCustom = custom && restore && !restore.narrative ? restore.custom : undefined;
    const handle = custom
      ? new CustomSceneHandle(this, level, scene, type, this.customHost(generation), restoreCustom)
      : null;
    let controller: InkController | null = null;
    if (compiled !== null) {
      controller = new InkController(compiled, {
        configure: (story) => {
          story.BindExternalFunction(
            "completed",
            (id: string) => this.isCompleted(String(id)),
            true,
          );
          story.BindExternalFunction(
            "outcome",
            (id: string) => this.snapshot.progress.outcomes[String(id)] ?? "",
            true,
          );
          for (const [name, fn] of Object.entries(this.options.externals ?? {}))
            story.BindExternalFunction(name, fn as (...args: any[]) => any);
          for (const name of externalNames(type?.externals))
            story.BindExternalFunction(name, (...args: unknown[]) =>
              handle?.callExternal(name, args),
            );
          this.options.configureStory?.(story, scene);
        },
        onCommand: (command) => this.runCommand(command, generation),
      });
      this.bindVariables(controller);
      this.unsubscribeController = controller.onEvent((event) =>
        this.onNarrative(event, generation),
      );
    }

    let stage = sceneStage(this.manifest, scene, this.snapshot.stage);
    let restored = false;
    if (restoreCustom) {
      stage = { ...restore!.stage, effects: [], effectId: this.snapshot.stage.effectId };
      restored = true;
    } else if (restore?.narrative && controller && !custom) {
      try {
        controller.restore(restore.narrative);
        stage = { ...restore.stage, effects: [], effectId: this.snapshot.stage.effectId };
        restored = true;
        this.pushVariables(controller);
      } catch (error) {
        this.warn(
          `The save for "${scene.title ?? scene.id}" doesn't match its current script; restarting the scene.`,
          error,
        );
      }
    }
    this.update({
      loading: false,
      controller,
      stage,
      custom: handle ? { handle, talk: null, talkId: 0 } : null,
    });
    this.emit({ type: "scene-start", level, scene });
    if (!restored) {
      if (this.autosaveOptions && this.autosaveOptions.sceneStart) this.autosave(false);
      if (!custom)
        try {
          controller!.start();
        } catch (error) {
          this.fail(error);
        }
    }
  }

  private customHost(generation: number): CustomSceneHost {
    return {
      active: () => generation === this.generation && !!this.snapshot.custom,
      dialogue: (knot) => {
        const controller = this.snapshot.controller;
        if (!controller) {
          this.warn(`"${this.snapshot.scene?.id}" has no script to play "${knot}" from.`);
          return Promise.resolve(false);
        }
        return this.talk(generation, controller, () => controller.jump(knot), `Knot "${knot}"`);
      },
      say: (lines) => {
        const controller = new InkController(lineStory(lines), { commandPrefix: false });
        return this.talk(generation, controller, controller.start, "say()");
      },
      complete: (outcome, data) => this.flow({ type: "end-scene", outcome, data }, generation),
      run: (text) => {
        const directive = parseDirective(text);
        return directive ? this.runDirective(directive, true, generation) : undefined;
      },
      warn: (message, error) => this.warn(message, error),
    };
  }

  /** Shows one conversation of a custom scene; conversations queue behind each other. */
  private talk(
    generation: number,
    controller: InkController,
    begin: () => void,
    label: string,
  ): Promise<boolean> {
    const run = () =>
      new Promise<boolean>((resolve) => {
        const current = this.snapshot.custom;
        if (generation !== this.generation || !current) return resolve(false);
        let off = () => {};
        const finish = (completed: boolean) => {
          if (this.endTalk !== finish) return;
          this.endTalk = null;
          off();
          const custom = this.snapshot.custom;
          if (generation === this.generation && custom)
            this.update({ custom: { ...custom, talk: null } });
          resolve(completed);
        };
        this.endTalk = finish;
        off = controller.onEvent((event) => {
          if (event.type === "end") finish(true);
        });
        this.update({ custom: { ...current, talk: controller, talkId: current.talkId + 1 } });
        try {
          begin();
        } catch (error) {
          this.warn(`${label} could not play: ${toError(error).message}`, error);
          finish(false);
        }
      });
    const result = this.talkQueue.then(run, run);
    this.talkQueue = result;
    return result;
  }

  private story(scene: SceneManifest, type: CustomSceneType | null, signal: AbortSignal) {
    if (this.options.loadStory) return this.options.loadStory(scene, signal);
    signal.throwIfAborted();
    const script = scene.script!;
    // Custom scene types declare their own externals, so their compiles are kept apart.
    const key = `${script}\u0000${type?.id ?? ""}`;
    const cached = this.stories.get(key);
    if (cached) return cached;
    const asset = inkAsset(script, {
      format: script.toLowerCase().endsWith(".json") ? "json" : "ink",
      source: this.pkg.source,
      globals: {
        variables: defaultVariables(this.manifest),
        externals: [
          ...BUILTIN_EXTERNALS,
          ...Object.entries(this.options.externals ?? {}).map(
            ([name, fn]) =>
              `${name}(${Array.from({ length: fn.length }, (_, i) => `a${i}`).join(", ")})`,
          ),
          ...(type?.externals ?? []),
        ],
      },
    });
    // Compiles are shared between scenes using one script and never cancelled midway.
    const promise = asset.load(new AbortController().signal);
    this.stories.set(key, promise);
    promise.catch(() => this.stories.delete(key));
    return promise;
  }

  /** Drops cached compiled scripts, e.g. after editing package files. */
  invalidateScripts(path?: string) {
    if (!path) return this.stories.clear();
    for (const key of this.stories.keys())
      if (key.startsWith(`${path}\u0000`)) this.stories.delete(key);
  }

  private finishScene() {
    const { level, scene } = this.snapshot;
    if (!level || !scene) return;
    let flow = this.pendingFlow;
    this.pendingFlow = null;
    if (flow?.type === "end-scene" && flow.outcome !== undefined) {
      flow = this.applyOutcome(scene, flow.outcome, flow.data);
      // Outcome variables may have lost the game.
      if (this.snapshot.phase !== "playing" || this.snapshot.scene !== scene) return;
    }
    this.markCompleted(scene.id);
    this.emit({ type: "scene-end", level, scene });
    if (this.checkGameOver()) return;
    if (flow?.type === "end-level") return this.completeLevel();
    if (flow?.type === "game-over") return this.gameOver();
    if (flow?.type === "end-game") return this.finishGame(flow.ending);
    if (level.completeWhen !== undefined && this.test(level.completeWhen))
      return this.completeLevel();
    let next: SceneManifest | undefined;
    if (flow?.type === "goto") {
      next = level.scenes.find((entry) => entry.id === flow.scene);
      const elsewhere = next ? undefined : this.findScene(flow.scene);
      if (elsewhere) return void this.enterScene(elsewhere.level, elsewhere.scene);
      if (!next) this.warn(`goto: unknown scene ${flow.scene}`);
    }
    next ??= scene.next
      ? level.scenes.find((entry) => entry.id === scene.next)
      : level.scenes[level.scenes.indexOf(scene) + 1];
    if (next) void this.enterScene(level, next);
    else this.completeLevel();
  }

  private applyOutcome(scene: SceneManifest, outcome: string, data: unknown): FlowAction | null {
    const type = this.snapshot.custom?.handle.type;
    if (type?.outcomes && !type.outcomes.includes(outcome))
      this.warn(`${type.name ?? type.id} ended with an undeclared outcome "${outcome}".`);
    const progress = this.snapshot.progress;
    this.update({
      progress: { ...progress, outcomes: { ...progress.outcomes, [scene.id]: outcome } },
    });
    this.emit({ type: "outcome", scene, outcome, data });
    const wiring = scene.outcomes?.[outcome];
    if (!wiring) return null;
    const apply = (name: string, value: () => StateValue) => {
      try {
        this.setVariable(name, value());
      } catch (error) {
        this.warn(`Outcome "${outcome}" of ${scene.id}: ${toError(error).message}`, error);
      }
    };
    for (const [name, value] of Object.entries(wiring.set ?? {})) apply(name, () => value);
    for (const [name, amount] of Object.entries(wiring.add ?? {}))
      apply(name, () => {
        const current = this.getVariable(name);
        if (typeof current !== "number") throw new Error(`${name} is not a number.`);
        return current + amount;
      });
    if (wiring.flow === "end-level") return { type: "end-level" };
    if (wiring.flow === "game-over") return { type: "game-over" };
    if (wiring.flow === "end-game") return { type: "end-game", ending: wiring.ending };
    if (wiring.next) return { type: "goto", scene: wiring.next };
    return null;
  }

  private markCompleted(sceneId: string) {
    const progress = this.snapshot.progress;
    if (!progress.completedScenes.includes(sceneId))
      this.update({
        progress: { ...progress, completedScenes: [...progress.completedScenes, sceneId] },
      });
  }

  private completeLevel() {
    const { level } = this.snapshot;
    if (!level) return;
    this.stopScene();
    const progress = this.snapshot.progress;
    const index = this.manifest.levels.indexOf(level);
    const next = this.manifest.levels[index + 1];
    this.update({
      controller: null,
      custom: null,
      progress: {
        ...progress,
        completedLevels: progress.completedLevels.includes(level.id)
          ? progress.completedLevels
          : [...progress.completedLevels, level.id],
      },
    });
    this.emit({ type: "level-complete", level });
    if (this.autosaveOptions && this.autosaveOptions.levelComplete) {
      // Resumes at the start of the next level, or at the credits.
      this.autosave(false, {
        phase: next ? "playing" : this.manifest.credits ? "credits" : "complete",
        progress: {
          ...this.currentProgress(),
          level: next?.id ?? null,
          scene: next?.scenes[0]?.id ?? null,
          levelStart: { ...this.snapshot.variables },
        },
      });
    }
    if (level.interstitial === false) {
      if (next) void this.enterLevel(next);
      else this.finishGame();
    } else this.update({ phase: "level-complete" });
  }

  private gameOver() {
    this.stopScene();
    this.update({ phase: "game-over", controller: null, custom: null });
  }

  private finishGame(ending?: string) {
    this.stopScene();
    const { level, progress } = this.snapshot;
    // Ending the game from inside a level completes that level too.
    const completedLevels =
      level && !progress.completedLevels.includes(level.id)
        ? [...progress.completedLevels, level.id]
        : progress.completedLevels;
    this.update({
      phase: this.manifest.credits ? "credits" : "complete",
      controller: null,
      custom: null,
      progress: { ...progress, completedLevels, ending: ending ?? progress.ending },
    });
    if (this.autosaveOptions) this.autosave(false);
  }

  private checkGameOver() {
    const condition = this.manifest.gameOverWhen;
    if (condition === undefined || this.snapshot.phase !== "playing") return false;
    if (!this.test(condition)) return false;
    this.gameOver();
    return true;
  }

  /** Evaluates a condition against the current state. Invalid conditions warn and count as false. */
  test(condition: Condition) {
    try {
      return evaluateCondition(condition, {
        variables: this.snapshot.variables,
        completed: (id) => this.isCompleted(id),
      });
    } catch (error) {
      this.warn(`Invalid condition: ${String(error instanceof Error ? error.message : error)}`);
      return false;
    }
  }

  /** Whether a scene or level id has been completed in this playthrough. */
  isCompleted(id: string) {
    const { completedScenes, completedLevels } = this.snapshot.progress;
    return completedScenes.includes(id) || completedLevels.includes(id);
  }

  // Narrative and directives -----------------------------------------------------------------------

  private onNarrative(event: NarrativeEvent, generation: number) {
    if (generation !== this.generation) return;
    this.emit({ type: "narrative", event });
    if (event.type === "tags")
      for (const tag of event.tags) {
        const directive = parseDirective(tag);
        if (directive && !DirectiveRegistry.reserved.has(directive.name))
          void this.runDirective(directive, false, generation);
      }
    if (event.type === "error") this.warn(event.error.message, event.error);
    // Custom scenes play knots as conversations; running out ends the conversation, not the scene.
    if (event.type === "end") return this.snapshot.custom ? undefined : this.finishScene();
    if (event.type === "choice" && this.autosaveOptions && this.autosaveOptions.choice)
      queueMicrotask(() => {
        if (generation === this.generation) this.autosave(true);
      });
    if (event.type === "line" || event.type === "choice") this.checkGameOver();
  }

  private runCommand(command: InkCommand, generation: number) {
    const directive = parseDirective(command.text);
    if (!directive) return;
    return this.runDirective(directive, true, generation);
  }

  /**
   * Runs directive text now, as if from a command line, e.g. from a debug console. Returns the
   * promise of a blocking directive.
   */
  run(text: string) {
    const directive = parseDirective(text);
    return directive ? this.runDirective(directive, true, this.generation) : undefined;
  }

  private runDirective(
    directive: Directive,
    blocking: boolean,
    generation: number,
  ): Promise<unknown> | void {
    const definition = this.directives.get(directive.name);
    this.emit({ type: "directive", directive, handled: !!definition });
    if (!definition) return this.warn(`Unknown directive: ${directive.source}`);
    const currentStage = () => this.snapshot.stage;
    const context: DirectiveContext = {
      manifest: this.manifest,
      blocking,
      get stage() {
        return currentStage();
      },
      updateStage: (update) => {
        if (generation === this.generation) this.update({ stage: update(this.snapshot.stage) });
      },
      effect: (type, params = {}) => {
        if (generation !== this.generation) return;
        const stage = this.snapshot.stage;
        this.update({
          stage: {
            ...stage,
            effectId: stage.effectId + 1,
            // Renderers play effects as they arrive; keep a short tail for late subscribers.
            effects: [...stage.effects.slice(-15), { id: stage.effectId, type, params }],
          },
        });
      },
      getVariable: (name) => this.getVariable(name),
      setVariable: (name, value) => this.setVariable(name, value),
      wait: (seconds) => this.wait(seconds),
      flow: (action) => this.flow(action, generation),
    };
    try {
      const result = definition.run(directive, context);
      if (this.pendingFlow && blocking) return new Promise(() => {});
      return result instanceof Promise
        ? result.catch((error: unknown) =>
            this.warn(`${directive.source}: ${toError(error).message}`, error),
          )
        : undefined;
    } catch (error) {
      this.warn(`${directive.source}: ${toError(error).message}`, error);
    }
  }

  private flow(action: FlowAction, generation: number) {
    if (generation !== this.generation) return;
    this.pendingFlow = action;
    // Leave the Ink continuation that issued the directive before switching scenes.
    queueMicrotask(() => {
      if (generation === this.generation && this.pendingFlow === action) this.finishScene();
    });
  }

  wait(seconds: number): Promise<void> {
    if (this.skipping || seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const wait: PendingWait = { remaining: seconds, started: 0, timer: null, resolve };
      this.waits.add(wait);
      if (!this.snapshot.paused) this.scheduleWait(wait);
    });
  }
  private scheduleWait(wait: PendingWait) {
    wait.started = now();
    wait.timer = setTimeout(() => this.resolveWait(wait), Math.max(0, wait.remaining * 1000));
  }
  private resolveWait(wait: PendingWait, settle = true) {
    if (wait.timer !== null) clearTimeout(wait.timer);
    this.waits.delete(wait);
    if (settle) wait.resolve();
  }

  // Variables -------------------------------------------------------------------------------------

  getVariable(name: string): StateValue {
    if (!(name in this.snapshot.variables)) throw new Error(`Unknown variable: ${name}`);
    return this.snapshot.variables[name];
  }

  /** Sets a game state variable (clamped to its range) and mirrors it into the current scene's Ink. */
  setVariable(name: string, value: StateValue) {
    const definition = this.manifest.state?.variables?.[name];
    if (!definition) throw new Error(`Unknown variable: ${name}`);
    let next = coerce(definition.type, value, name);
    if (typeof next === "number") {
      if (definition.min !== undefined) next = Math.max(definition.min, next);
      if (definition.max !== undefined) next = Math.min(definition.max, next);
    }
    const previous = this.snapshot.variables[name];
    const controller = this.snapshot.controller;
    if (
      controller &&
      !this.syncing &&
      controller.story.variablesState.GlobalVariableExistsWithName(name)
    ) {
      const current = controller.story.variablesState.$(name) as StateValue;
      if (current !== next) {
        this.syncing = true;
        try {
          controller.setVariable(name, next);
        } finally {
          this.syncing = false;
        }
      }
    }
    if (previous === next) return;
    this.update({ variables: { ...this.snapshot.variables, [name]: next } });
    this.emit({ type: "variable", name, value: next, previous });
    this.checkGameOver();
  }

  private bindVariables(controller: InkController) {
    const state = controller.story.variablesState;
    for (const name of Object.keys(this.manifest.state?.variables ?? {})) {
      if (!state.GlobalVariableExistsWithName(name)) continue;
      state.$(name, this.snapshot.variables[name]);
      controller.observeVariable(name, (_, value) => {
        if (this.syncing || this.snapshot.controller !== controller) return;
        const definition = this.manifest.state!.variables![name];
        this.syncing = true;
        try {
          this.setVariable(name, coerce(definition.type, value as StateValue, name));
        } catch (error) {
          this.warn(`Ink set ${name} to an invalid value.`, error);
        } finally {
          this.syncing = false;
        }
        // Clamping may change the value; write it back so Ink and the game agree.
        const clamped = this.snapshot.variables[name];
        if (state.$(name) !== clamped) {
          this.syncing = true;
          try {
            state.$(name, clamped);
          } finally {
            this.syncing = false;
          }
        }
      });
    }
  }
  private pushVariables(controller: InkController) {
    const state = controller.story.variablesState;
    for (const [name, value] of Object.entries(this.snapshot.variables))
      if (state.GlobalVariableExistsWithName(name) && state.$(name) !== value) {
        this.syncing = true;
        try {
          state.$(name, value);
        } finally {
          this.syncing = false;
        }
      }
  }

  // Saves -----------------------------------------------------------------------------------------

  /**
   * A save of the current moment. Mid-scene saves record the exact passage; pass `false` to save
   * only progress and variables, which resume at the start of the scene.
   */
  createSave(withScene = true, overrides: Partial<SaveFile> = {}): SaveFile {
    const { level, scene, controller, custom, phase, stage } = this.snapshot;
    const status = controller?.getSnapshot().status;
    const at = withScene && phase === "playing" && level && scene ? { level, scene } : null;
    // Custom scenes resume only when they save state of their own; otherwise they restart.
    const saved = at && custom ? custom.handle.savedState() : null;
    const sceneState =
      at && custom
        ? saved && {
            level: at.level.id,
            scene: at.scene.id,
            custom: saved,
            stage: serializeStage(stage),
          }
        : at && controller && status !== "idle"
          ? {
              level: at.level.id,
              scene: at.scene.id,
              narrative: controller.save(),
              stage: serializeStage(stage),
            }
          : undefined;
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      game: { id: this.manifest.id, version: this.manifest.version, title: this.manifest.title },
      savedAt: new Date().toISOString(),
      label: level
        ? [level.title ?? level.id, scene?.title ?? scene?.id].filter(Boolean).join(" · ")
        : undefined,
      phase: phase === "title" || phase === "loading" ? "playing" : phase,
      progress: structuredClone(this.currentProgress()),
      variables: { ...this.snapshot.variables },
      ...(sceneState && { scene: sceneState }),
      ...overrides,
    };
  }

  /** Saves into a slot. */
  async saveTo(slot: string, label?: string) {
    if (!this.saves) throw new Error("Saving is disabled for this game.");
    const save = this.createSave(true, label ? { label } : {});
    await this.saves.write(slot, save);
    this.emit({ type: "saved", slot, save });
    return save;
  }

  private autosave(withScene: boolean, overrides: Partial<SaveFile> = {}) {
    if (!this.saves?.autosave) return;
    const save = this.createSave(withScene, overrides);
    this.saves.write(AUTOSAVE_SLOT, save).then(
      () => this.emit({ type: "saved", slot: AUTOSAVE_SLOT, save }),
      (error: unknown) => this.warn("Autosave failed.", error),
    );
  }

  /** Loads a slot, returning false when it is empty. */
  async loadSlot(slot: string) {
    const save = await this.saves?.read(slot);
    if (!save) return false;
    await this.load(save);
    return true;
  }

  /** Resumes the most recent save. Returns false when there is none. */
  async continueGame() {
    const latest = await this.saves?.latest();
    if (!latest?.save) return false;
    await this.load(latest.save);
    return true;
  }

  /** Loads a save object or exported save-file text. Throws if it is invalid or for another game. */
  async load(input: SaveFile | string) {
    const save = parseSave(input, this.manifest);
    const variables = defaultVariables(this.manifest);
    for (const [name, value] of Object.entries(save.variables))
      if (name in variables) variables[name] = value;
    this.stopScene();
    this.update({
      variables,
      progress: { ...freshProgress(), ...save.progress },
      custom: null,
      stage: emptyStage(),
      paused: false,
      error: null,
    });
    if (save.phase === "credits" || save.phase === "complete") {
      this.update({ phase: save.phase, level: null, scene: null, controller: null, custom: null });
      return;
    }
    if (save.scene) {
      const found = this.findScene(save.scene.scene);
      if (found) return this.enterScene(found.level, found.scene, save.scene);
    }
    const scene = save.progress.scene ? this.findScene(save.progress.scene) : undefined;
    if (scene) return this.enterScene(scene.level, scene.scene);
    const level = this.manifest.levels.find((entry) => entry.id === save.progress.level);
    if (level) return this.enterLevel(level, false);
    this.warn("The saved position no longer exists in this game; starting from the beginning.");
    return this.newGame();
  }

  dispose() {
    this.stopScene();
    this.disposed = true;
    this.trackPlaytime(this.snapshot.phase, this.snapshot.paused);
    this.listeners.clear();
    this.eventListeners.clear();
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function coerce(
  type: "number" | "boolean" | "string",
  value: StateValue,
  name: string,
): StateValue {
  if (type === "number") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) throw new Error(`${name} must be a number.`);
    return number;
  }
  if (type === "boolean")
    return typeof value === "boolean" ? value : value === "true" || value === 1;
  return String(value);
}

export type { DirectiveValue };
