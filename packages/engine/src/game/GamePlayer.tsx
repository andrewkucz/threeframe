import {
  AssetProvider,
  SceneCanvas,
  useAssetProgress,
  useOwnedAssetStore,
  type AssetStore,
} from "@threeframe/core";
import { stageSize, type GameSession } from "@threeframe/game";
import {
  InkDialogue,
  mergeDialogueOptions,
  resolveDialoguePreset,
  type DialogueHandle,
  type InkDialogueProps,
  type SpeakerStyle,
} from "@threeframe/ink";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { gameAssets } from "./assets";
import { CustomSceneOverlay, CustomSceneView } from "./custom";
import { useGameSnapshot, useStageAudio, type StageAudioOptions } from "./hooks";
import { StageActors, StageView, type StageViewProps } from "./StageView";
import {
  defaultGameLabels,
  defaultGameUI,
  gameStyles,
  type GameLabels,
  type GameMenu,
  type GameScreenProps,
  type GameUIComponents,
} from "./ui";

type DialogueOptions = Omit<InkDialogueProps, "controller" | "paused" | "initialPlayback">;

export interface GamePlayerProps {
  session: GameSession;
  /**
   * Dialogue presentation over the manifest's `dialogue` options (and a layout scaled to the
   * design size). Speakers default to the manifest's character names and colors.
   */
  dialogue?: DialogueOptions;
  /** Replace or remove (`null`) any built-in screen. */
  ui?: Partial<GameUIComponents>;
  labels?: Partial<GameLabels>;
  /** Custom one-shot effect renderers by effect type. */
  effects?: StageViewProps["effects"];
  /** Extra R3F nodes inside the stage camera, e.g. scene-specific props. */
  children?: ReactNode;
  /** Plain DOM nodes over the stage, e.g. a custom HUD. */
  overlay?: ReactNode;
  /** `false` mutes everything. */
  audio?: StageAudioOptions | false;
  /** Disables Space/Enter, number keys and Escape. */
  keyboard?: boolean;
  /** Load every package asset before play (default), with a progress screen. */
  preload?: boolean;
  store?: AssetStore;
  /** Pause play, e.g. while a host UI covers the player. Opening a menu pauses too. */
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Drop the built-in stylesheet so your own CSS styles the `tf-game-*` classes. */
  unstyled?: boolean;
  /** Non-fatal problems from scripts and the stage, such as unknown directives or skins. */
  onWarning?: (message: string) => void;
}

/**
 * A complete game: stage, dialogue, HUD, title screen, pause and save/load menus, level cards,
 * game over and credits, all driven by a headless `GameSession`.
 */
export function GamePlayer({
  session,
  dialogue,
  ui,
  labels: labelOverrides,
  effects,
  children,
  overlay,
  audio = {},
  keyboard = true,
  preload = true,
  store: providedStore,
  paused: hostPaused = false,
  className,
  style,
  unstyled = false,
  onWarning,
}: GamePlayerProps) {
  const snapshot = useGameSnapshot(session);
  const labels = useMemo(() => ({ ...defaultGameLabels, ...labelOverrides }), [labelOverrides]);
  const screens = useMemo(() => ({ ...defaultGameUI, ...ui }), [ui]);
  const ownedStore = useOwnedAssetStore();
  const store = providedStore ?? ownedStore;
  const progress = useAssetProgress(store);
  const [ready, setReady] = useState(!preload);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState<GameMenu>(null);
  const [uiError, setUiError] = useState<Error | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actors] = useState(() => new StageActors());
  const [sceneError, setSceneError] = useState<{ handle: number; error: Error } | null>(null);
  const dialogueRef = useRef<DialogueHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const latestWarning = useRef(onWarning);
  latestWarning.current = onWarning;
  const pkg = session.pkg;
  const { manifest } = pkg;
  const { width, height } = stageSize(manifest);

  useEffect(() => {
    if (!preload) return;
    let active = true;
    setLoadError(null);
    store.preload(gameAssets(pkg).all()).then(
      () => active && setReady(true),
      (error: unknown) =>
        active && setLoadError(error instanceof Error ? error : new Error(String(error))),
    );
    return () => {
      active = false;
    };
  }, [pkg, store, preload, attempt]);

  useEffect(
    () =>
      session.onEvent((event) => {
        if (event.type === "warning") {
          latestWarning.current?.(event.message);
          if (!latestWarning.current) console.warn(`[game] ${event.message}`, event.error ?? "");
        }
      }),
    [session],
  );

  const inMenu = menu !== null && menu !== "credits";
  const paused = hostPaused || inMenu || snapshot.phase !== "playing";
  useEffect(() => {
    session.setPaused(hostPaused || inMenu);
  }, [session, hostPaused, inMenu]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useStageAudio(pkg, snapshot.stage, audio === false ? { muted: true } : audio);

  const stageWarning = useCallback((message: string) => {
    latestWarning.current?.(message);
    if (!latestWarning.current) console.warn(`[stage] ${message}`);
  }, []);

  const reportUiError = useCallback((error: Error) => {
    setUiError(error);
    setToast(error.message);
  }, []);
  const openMenu = useCallback((next: GameMenu) => {
    setUiError(null);
    setMenu(next);
  }, []);
  // Menus close themselves when the game moves on underneath them (e.g. after loading).
  const phase = snapshot.phase;
  useEffect(() => {
    if (phase !== "playing" && phase !== "title" && phase !== "game-over") setMenu(null);
  }, [phase]);

  // Screens unmount the button that had focus, and a custom scene's buttons keep it when a
  // conversation starts; keep keyboard input on the player.
  const talkingKey = snapshot.custom?.talk ? snapshot.custom.talkId : null;
  useEffect(() => {
    const node = root.current;
    const active = document.activeElement;
    if (node && (!active || active === document.body || active.closest(".tf-game-scene-layer")))
      node.focus({ preventScroll: true });
  }, [phase, menu, talkingKey]);

  const speakers = useMemo(() => {
    const result: Record<string, SpeakerStyle> = {};
    for (const [id, character] of Object.entries(manifest.characters ?? {}))
      result[id] = { name: character.name, ...(character.color && { color: character.color }) };
    return result;
  }, [manifest]);
  const dialogueOptions = useMemo(() => {
    const fromManifest = (manifest.dialogue ?? {}) as DialogueOptions;
    const { preset, ...own } = mergeDialogueOptions<DialogueOptions>(fromManifest, dialogue ?? {});
    return mergeDialogueOptions<DialogueOptions>(
      {
        width: width * 0.875,
        height: height * 0.292,
        padding: (width * 28) / 1280,
        position: [0, -height * 0.306, 100],
      },
      resolveDialoguePreset(preset) as DialogueOptions,
      { speakers },
      own,
    );
  }, [manifest, dialogue, speakers, width, height]);

  const screenProps: GameScreenProps = {
    session,
    snapshot,
    labels,
    menu,
    openMenu,
    onError: reportUiError,
  };
  const controller = snapshot.controller;
  const playing = snapshot.phase === "playing";
  const custom = playing ? snapshot.custom : null;
  // Custom scenes show their conversations one at a time; Ink scenes show their whole story.
  const talk = custom ? custom.talk : controller;
  const talkKey = custom
    ? `custom:${custom.handle.id}:${custom.talkId}`
    : `${controller?.storyId}${String(snapshot.scene?.id)}`;
  const onSceneError = useCallback(
    (error: Error) => {
      const id = session.getSnapshot().custom?.handle.id;
      if (id !== undefined) setSceneError({ handle: id, error });
    },
    [session],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!keyboard || event.repeat) return;
    const target = event.target as HTMLElement;
    if (event.key === "Escape" && (playing || menu)) {
      event.preventDefault();
      if (menu === "save" || menu === "load") openMenu(snapshot.phase === "title" ? null : "pause");
      else openMenu(menu ? null : playing ? "pause" : null);
      return;
    }
    if (paused || !playing || target.closest("button, input, textarea, select")) return;
    // Without dialogue on screen (custom scenes between conversations) keys reach the scene.
    const dialogueView = dialogueRef.current;
    if (!dialogueView) return;
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      dialogueView.advance();
    } else if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      dialogueView.choose(Number(event.key) - 1);
    }
  };

  const {
    Title,
    PauseMenu,
    SaveLoad,
    LevelComplete,
    GameOver,
    Credits,
    Complete,
    Hud,
    MenuButton,
  } = screens;
  const failedScene =
    sceneError && custom && sceneError.handle === custom.handle.id ? sceneError.error : null;
  const error = loadError ?? snapshot.error ?? failedScene;
  return (
    <div
      ref={root}
      className={["tf-game", className].filter(Boolean).join(" ")}
      style={{ aspectRatio: `${width} / ${height}`, width: "100%", ...style }}
      tabIndex={0}
      role="region"
      aria-label={manifest.title}
      onKeyDown={onKeyDown}
      onPointerDown={() => root.current?.focus({ preventScroll: true })}
    >
      {!unstyled && <style>{gameStyles}</style>}
      <div className="tf-game-canvas">
        <SceneCanvas
          width={width}
          height={height}
          fallback={<div role="alert">WebGL is required.</div>}
        >
          <AssetProvider store={store}>
            {ready && (
              <Suspense fallback={null}>
                <StageView
                  pkg={pkg}
                  stage={snapshot.stage}
                  paused={paused}
                  effects={effects}
                  onWarning={stageWarning}
                  actors={actors}
                >
                  {custom && !failedScene && (
                    <CustomSceneView
                      key={custom.handle.id}
                      session={session}
                      custom={custom}
                      paused={paused}
                      actors={actors}
                      onError={onSceneError}
                    />
                  )}
                  {children}
                </StageView>
                {playing && talk && snapshot.stage.dialogue.visible && (
                  <InkDialogue
                    key={talkKey}
                    {...dialogueOptions}
                    controller={talk}
                    ref={dialogueRef}
                    paused={paused}
                    onError={reportUiError}
                  />
                )}
              </Suspense>
            )}
          </AssetProvider>
        </SceneCanvas>
      </div>
      {custom && ready && !failedScene && (
        <CustomSceneOverlay
          key={custom.handle.id}
          session={session}
          custom={custom}
          paused={paused}
          actors={actors}
          onError={onSceneError}
          store={store}
        />
      )}
      {playing && Hud && <Hud {...screenProps} />}
      {playing && !menu && MenuButton && <MenuButton {...screenProps} />}
      {overlay}
      {snapshot.phase === "title" && !menu && Title && <Title {...screenProps} />}
      {snapshot.phase === "level-complete" && LevelComplete && <LevelComplete {...screenProps} />}
      {snapshot.phase === "game-over" && !menu && GameOver && <GameOver {...screenProps} />}
      {(snapshot.phase === "credits" || menu === "credits") && Credits && (
        <Credits {...screenProps} />
      )}
      {snapshot.phase === "complete" && Complete && <Complete {...screenProps} />}
      {menu === "pause" && PauseMenu && <PauseMenu {...screenProps} />}
      {(menu === "save" || menu === "load") && SaveLoad && (
        <SaveLoad {...screenProps} mode={menu} />
      )}
      {(!ready || snapshot.loading) && !error && (
        <div className="tf-game-status" role="status">
          <span>{labels.loading}</span>
          {!ready && (
            <>
              <progress value={progress.loaded} max={Math.max(1, progress.total)} />
              <small className="tf-game-muted">
                {labels.loadingProgress(progress.loaded, progress.total)}
              </small>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="tf-game-status tf-game-error" role="alert">
          <p>{labels.error}</p>
          <pre>{error.message}</pre>
          <nav className="tf-game-actions">
            <button
              onClick={() => {
                if (loadError) {
                  store.retryFailed();
                  setAttempt((value) => value + 1);
                } else if (failedScene && snapshot.scene) {
                  setSceneError(null);
                  void session.playScene(snapshot.scene.id, snapshot.variables);
                } else void session.retryLevel();
              }}
            >
              {labels.retry}
            </button>
            <button onClick={() => session.toTitle()}>{labels.quitToTitle}</button>
          </nav>
        </div>
      )}
      {toast && uiError && (
        <div className="tf-game-toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}
