import {
  AssetProvider,
  jsonAsset,
  textAsset,
  textureAsset,
  type AssetStore,
} from "@threeframe/core";
import {
  formatDirective,
  stageSize,
  type CustomSceneHandle,
  type CustomSceneSnapshot,
  type CustomSceneType,
  type DirectiveValue,
  type ExternalFunction,
  type GameManifest,
  type GamePackage,
  type GameSession,
  type StageCharacter,
  type StateValue,
} from "@threeframe/game";
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  CharacterSprite,
  type CharacterSpriteProps,
  type StageActor,
  type StageActors,
} from "./StageView";

type Setter<T> = (value: T | ((previous: T) => T)) => void;
type DirectiveOptions = Readonly<Record<string, DirectiveValue | undefined>>;

/** Drives one character through directives, plus access to its live sprite. */
export interface CharacterControls {
  id: string;
  /** The character's stage state (position, animation, skins…), or undefined when not cast. */
  state: StageCharacter | undefined;
  /** Its sprite while it is on stage: skeleton, animation state and the positioning group. */
  actor(): StageActor | null;
  show(options?: DirectiveOptions): Promise<unknown> | void;
  hide(options?: DirectiveOptions): Promise<unknown> | void;
  move(at: string | number, options?: DirectiveOptions): Promise<unknown> | void;
  /**
   * Plays an animation. `{ loop: false }` plays it once and returns to the idle, or to `next`;
   * other options are the `anim` directive's.
   */
  play(animation: string, options?: DirectiveOptions & { loop?: boolean; next?: string }): void;
  overlay(...animations: string[]): void;
  wear(...skins: string[]): void;
  remove(...skinsOrFolders: string[]): void;
  outfit(name: string): void;
  face(direction: "left" | "right" | "flip"): void;
  tint(color: string, options?: DirectiveOptions): void;
  /** `none` hides the slot; `reset` restores the skin's attachment. */
  attach(slot: string, attachment: string): void;
  /** Shows a line spoken by this character. */
  say(text: string | readonly string[]): Promise<boolean>;
}

/**
 * What a custom scene component works with: game state, conversations from the scene's script,
 * directives, characters and package assets. Methods are no-ops once the scene has ended.
 */
export interface SceneContext {
  handle: CustomSceneHandle;
  session: GameSession;
  pkg: GamePackage;
  manifest: GameManifest;
  /** Design size of the stage; the camera's origin is its center. */
  width: number;
  height: number;
  /** A menu is open or the host paused play; freeze timers and ignore input. */
  paused: boolean;
  /** A conversation is on screen; it takes the player's input. */
  talking: boolean;
  /** The scene resumed from a save, with its saved state in place. */
  restored: boolean;
  /** Plays a knot of the scene's script; resolves `true` once it runs out. */
  dialogue(knot: string): Promise<boolean>;
  /** Shows lines without a script. */
  say(speaker: string | null, text: string | readonly string[]): Promise<boolean>;
  /** Ends the scene, optionally with a named outcome. */
  complete(outcome?: string, data?: unknown): void;
  /** Runs a directive such as `shake strength=8`, from text or parts. */
  directive(text: string): Promise<unknown> | void;
  directive(
    name: string,
    args: readonly DirectiveValue[],
    options?: DirectiveOptions,
  ): Promise<unknown> | void;
  wait(seconds: number): Promise<void>;
  getVariable(name: string): StateValue;
  setVariable(name: string, value: StateValue): void;
  /** A game variable, re-rendering when it changes. */
  useVariable<T extends StateValue = StateValue>(name: string): [T, Setter<T>];
  /** Scene state shared by the scene's canvas and DOM parts. Lost when the scene ends or is saved. */
  useSceneState<T>(key: string, initial: T | (() => T)): [T, Setter<T>];
  /** Scene state that is also saved, so a save made mid-scene resumes here. Values must be JSON. */
  useSaved<T>(key: string, initial: T | (() => T)): [T, Setter<T>];
  /** Implements one of the type's `externals` for the scene's script while mounted. */
  useExternal(name: string, fn: ExternalFunction): void;
  /** Controls for a character, re-rendering when its stage state changes. */
  useCharacter(id: string): CharacterControls;
  /** Asset descriptors for package files, for `useAsset`. */
  asset: {
    texture(path: string): ReturnType<typeof textureAsset>;
    json<T = unknown>(path: string): ReturnType<typeof jsonAsset<T>>;
    text(path: string): ReturnType<typeof textAsset>;
  };
}

export interface CustomSceneProps<P = Record<string, unknown>> {
  /** The scene's manifest `props` over the type's defaults. */
  props: P;
  scene: SceneContext;
}

/**
 * A custom scene type with what it renders. `Component` renders in the stage's canvas, inside the
 * camera (so shake and zoom apply) above the stage's characters; `Overlay` renders DOM over the
 * canvas, for buttons and readouts. Both get the same scene context and share its state.
 */
export interface CustomSceneDefinition<P = Record<string, unknown>> extends CustomSceneType {
  Component?: ComponentType<CustomSceneProps<P>>;
  Overlay?: ComponentType<CustomSceneProps<P>>;
}

/**
 * Declares a custom scene type. Register it with the session (`customScenes: [lockpick]`) and use
 * its id as a custom scene's `component` in the manifest.
 */
export function defineCustomScene<P = Record<string, unknown>>(
  definition: CustomSceneDefinition<P>,
): CustomSceneDefinition<P> {
  return definition;
}

/** The registered definition for a custom scene, if any. */
export function customSceneDefinition(session: GameSession, handle: CustomSceneHandle) {
  return handle.type
    ? (session.customScenes.get(handle.type.id) as CustomSceneDefinition | undefined)
    : undefined;
}

const SceneReactContext = createContext<SceneContext | null>(null);

/** The current custom scene's context, for components nested inside a custom scene. */
export function useCustomScene() {
  const scene = useContext(SceneReactContext);
  if (!scene) throw new Error("useCustomScene() must be used inside a custom scene.");
  return scene;
}

const resolve = <T,>(next: T | ((previous: T) => T), previous: T) =>
  typeof next === "function" ? (next as (previous: T) => T)(previous) : next;

function useHandleState<T>(
  handle: CustomSceneHandle,
  key: string,
  initial: T | (() => T),
  save: boolean,
): [T, Setter<T>] {
  handle.ensureState(
    key,
    () => (typeof initial === "function" ? (initial as () => T)() : initial),
    {
      save,
    },
  );
  const value = useSyncExternalStore(
    handle.subscribeState,
    () => handle.getState<T>(key) as T,
    () => handle.getState<T>(key) as T,
  );
  const set = useCallback<Setter<T>>(
    (next) => handle.setState(key, resolve(next, handle.getState<T>(key) as T), { save }),
    [handle, key, save],
  );
  return [value, set];
}

/** Builds the context a custom scene's views receive. */
export function useSceneContext(
  session: GameSession,
  custom: CustomSceneSnapshot,
  paused: boolean,
  actors: StageActors | undefined,
): SceneContext {
  const { handle } = custom;
  const talking = !!custom.talk;
  return useMemo<SceneContext>(() => {
    const { width, height } = stageSize(session.manifest);
    const run = (
      text: string,
      args?: readonly DirectiveValue[],
      options?: DirectiveOptions,
    ): Promise<unknown> | void =>
      handle.directive(args ? formatDirective(text, args, options) : text);
    const context: SceneContext = {
      handle,
      session,
      pkg: session.pkg,
      manifest: session.manifest,
      width,
      height,
      paused,
      talking,
      restored: handle.restored,
      dialogue: (knot) => handle.dialogue(knot),
      say: (speaker, text) => handle.say(speaker, text),
      complete: (outcome, data) => handle.complete(outcome, data),
      directive: run as SceneContext["directive"],
      wait: (seconds) => handle.wait(seconds),
      getVariable: (name) => handle.getVariable(name),
      setVariable: (name, value) => handle.setVariable(name, value),
      useVariable<T extends StateValue = StateValue>(name: string): [T, Setter<T>] {
        const read = () => session.getSnapshot().variables[name] as T;
        const value = useSyncExternalStore(session.subscribe, read, read);
        const set = useCallback<Setter<T>>(
          (next) => handle.setVariable(name, resolve(next, read())),
          [name],
        );
        return [value, set];
      },
      useSceneState: (key, initial) => useHandleState(handle, key, initial, false),
      useSaved: (key, initial) => useHandleState(handle, key, initial, true),
      useExternal(name, fn) {
        const latest = useRef(fn);
        latest.current = fn;
        useEffect(
          () => handle.provide(name, (...args: unknown[]) => latest.current(...args)),
          [name],
        );
      },
      useCharacter(id) {
        const read = () => session.getSnapshot().stage.characters[id];
        const state = useSyncExternalStore(session.subscribe, read, read);
        return useMemo<CharacterControls>(
          () => ({
            id,
            state,
            actor: () => actors?.get(id) ?? null,
            show: (options) => run("show", [id], options),
            hide: (options) => run("hide", [id], options),
            move: (at, options) => run("move", [id, at], options),
            play: (animation, options) => void run("anim", [id, animation], options),
            overlay: (...animations) =>
              void run("overlay", [id, ...(animations.length ? animations : ["none"])]),
            wear: (...skins) => void run("wear", [id, ...skins]),
            remove: (...skins) => void run("remove", [id, ...skins]),
            outfit: (name) => void run("outfit", [id, name]),
            face: (direction) => void run("face", [id, direction]),
            tint: (color, options) => void run("tint", [id, color.replace(/^#/, "")], options),
            attach: (slot, attachment) => void run("attach", [id, slot, attachment]),
            say: (text) => handle.say(id, text),
          }),
          [id, state],
        );
      },
      asset: {
        texture: (path) => textureAsset(path, session.pkg.source),
        json: (path) => jsonAsset(path, session.pkg.source),
        text: (path) => textAsset(path, session.pkg.source),
      },
    };
    return context;
  }, [session, handle, paused, talking, actors]);
}

export type SceneCharacterProps = Omit<CharacterSpriteProps, "pkg" | "paused">;

/**
 * A manifest character drawn by a custom scene, at a position it controls (design units, `y` is the
 * baseline). Independent of the stage's copy of the same character.
 */
export function SceneCharacter(props: SceneCharacterProps) {
  const scene = useCustomScene();
  return (
    <CharacterSprite
      pkg={scene.pkg}
      paused={scene.paused}
      onWarning={(message) => console.warn(`[scene] ${message}`)}
      {...props}
    />
  );
}

class SceneErrorBoundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface HostProps {
  session: GameSession;
  custom: CustomSceneSnapshot;
  paused: boolean;
  actors?: StageActors;
  onError: (error: Error) => void;
}

/** Renders the custom scene's `Component`. Place inside the stage (as `StageView` children). */
export function CustomSceneView({ session, custom, paused, actors, onError }: HostProps) {
  const scene = useSceneContext(session, custom, paused, actors);
  const View = customSceneDefinition(session, custom.handle)?.Component;
  if (!View) return null;
  return (
    <SceneReactContext.Provider value={scene}>
      <SceneErrorBoundary onError={onError}>
        <View props={custom.handle.props} scene={scene} />
      </SceneErrorBoundary>
    </SceneReactContext.Provider>
  );
}

/** Renders the custom scene's DOM `Overlay` over the canvas. */
export function CustomSceneOverlay({
  session,
  custom,
  paused,
  actors,
  onError,
  store,
}: HostProps & { store: AssetStore }) {
  const scene = useSceneContext(session, custom, paused, actors);
  const definition = customSceneDefinition(session, custom.handle);
  const View = definition?.Overlay;
  return (
    <div className="tf-game-scene-layer">
      {View ? (
        <AssetProvider store={store}>
          <SceneReactContext.Provider value={scene}>
            <SceneErrorBoundary onError={onError}>
              <View props={custom.handle.props} scene={scene} />
            </SceneErrorBoundary>
          </SceneReactContext.Provider>
        </AssetProvider>
      ) : (
        !definition?.Component && <MissingCustomScene custom={custom} />
      )}
    </div>
  );
}

/** Stands in for an unregistered component, so the rest of the game stays playable. */
function MissingCustomScene({ custom }: { custom: CustomSceneSnapshot }) {
  const { handle } = custom;
  const outcomes = [
    ...new Set([...(handle.type?.outcomes ?? []), ...Object.keys(handle.scene.outcomes ?? {})]),
  ];
  return (
    <div className="tf-game-scene-missing" role="alert">
      <p className="tf-game-eyebrow">Custom scene</p>
      <h2>{handle.scene.title ?? handle.scene.id}</h2>
      <p className="tf-game-muted">
        {handle.type
          ? `“${handle.type.id}” has nothing to render.`
          : `No component “${handle.scene.component ?? ""}” is registered.`}{" "}
        Choose how it ends:
      </p>
      <nav className="tf-game-actions">
        {outcomes.map((outcome) => (
          <button key={outcome} onClick={() => handle.complete(outcome)}>
            {outcome}
          </button>
        ))}
        <button onClick={() => handle.complete()}>Continue</button>
      </nav>
    </div>
  );
}
