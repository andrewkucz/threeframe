import {
  AssetProvider,
  SceneCanvas,
  useAssetProgress,
  useOwnedAssetStore,
  type AssetProgress,
  type AssetStore,
} from "@threeframe/core";
import {
  InkController,
  InkDialogue,
  InkProvider,
  useInk,
  type DialogueDisplay,
  type DialogueHandle,
  type DialoguePlayback,
  type InkDialogueProps,
  type NarrativeEvent,
  type NarrativeSave,
  type Story,
} from "@threeframe/ink";
import {
  Component,
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  GameStage,
  applyStageTags,
  collectGameAssets,
  initialStage,
  type CharacterOverrides,
  type GameDefinition,
  type StageState,
} from "./stage";

export interface GameSave {
  version: 1;
  gameId: string;
  narrative: NarrativeSave;
  stage: StageState;
  dialogue?: DialoguePlayback;
}
export interface NarrativeGameHandle {
  controller: InkController | null;
  advance: () => void;
  choose: (index: number) => void;
  restart: () => void;
  save: () => GameSave;
  restore: (save: GameSave) => void;
}
export interface NarrativeGameProps {
  definition: GameDefinition;
  store?: AssetStore;
  paused?: boolean;
  scene?: string;
  characterOverrides?: Readonly<Record<string, CharacterOverrides>>;
  dialogue?: Omit<InkDialogueProps, "controller" | "paused" | "initialPlayback">;
  /** Bind external functions and observers before the first Ink continuation. */
  configureStory?: (story: Story) => void;
  onEvent?: (event: NarrativeEvent) => void;
  onReady?: (controller: InkController) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: AssetProgress) => void;
  renderLoading?: (progress: AssetProgress) => ReactNode;
  renderError?: (error: Error, retry: () => void) => ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Visible DOM controls plus the native canvas controls. */
  controls?: boolean;
}

class RenderBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void; fallback: (error: Error) => ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

const hidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};
const buttonStyle: CSSProperties = {
  font: "inherit",
  color: "inherit",
  background: "transparent",
  border: "1px solid #60717b",
  borderRadius: 6,
  padding: "7px 12px",
  cursor: "pointer",
};

function AccessibleControls({
  controller,
  dialogue,
  paused,
  display,
  controls,
  allowFastSkip,
  run,
}: {
  controller: InkController;
  dialogue: React.RefObject<DialogueHandle | null>;
  paused: boolean;
  display: DialogueDisplay | null;
  controls: boolean;
  allowFastSkip: boolean;
  run: (action: () => void) => void;
}) {
  const snapshot = useInk(controller);
  return (
    <div
      style={
        controls
          ? {
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              padding: "10px 14px",
              background: "#101d26",
              color: "#d9e4e8",
              fontSize: 12,
            }
          : hidden
      }
    >
      <p aria-live="polite" aria-atomic="true" style={hidden}>
        {snapshot.status === "ended"
          ? "The story has ended."
          : `${snapshot.speaker ?? "Narrator"}: ${display?.text ?? snapshot.text}`}
      </p>
      {snapshot.status === "ended" ? (
        <>
          <span>The story has ended.</span>
          <button style={buttonStyle} onClick={() => run(controller.restart)}>
            Play again
          </button>
        </>
      ) : (
        <>
          <button
            style={buttonStyle}
            disabled={
              paused || Boolean(display?.choices.length) || (display?.printing && !allowFastSkip)
            }
            onClick={() => run(() => dialogue.current?.advance())}
          >
            {display?.printing ? (allowFastSkip ? "Reveal dialogue" : "Printing…") : "Continue"}
          </button>
          {display?.choices.map((choice) => (
            <button
              key={choice.index}
              style={buttonStyle}
              disabled={paused}
              onClick={() => run(() => dialogue.current?.choose(choice.index))}
            >
              {choice.index + 1}. {choice.text}
            </button>
          ))}
          <span style={{ marginLeft: "auto", opacity: 0.6 }}>
            {paused ? "Paused" : "Space to continue · Number keys to choose"}
          </span>
        </>
      )}
    </div>
  );
}

/** A self-contained player. Its children are R3F scene nodes with Ink and asset context. */
export const NarrativeGame = forwardRef<NarrativeGameHandle, NarrativeGameProps>(
  function NarrativeGame(props, ref) {
    return <GameSession key={props.definition.id} {...props} ref={ref} />;
  },
);

const GameSession = forwardRef<NarrativeGameHandle, NarrativeGameProps>(function GameSession(
  {
    definition,
    store: providedStore,
    paused = false,
    scene,
    characterOverrides,
    dialogue: dialogueProps,
    configureStory,
    onEvent,
    onReady,
    onError,
    onProgress,
    renderLoading,
    renderError,
    children,
    className,
    style,
    controls = true,
  },
  ref,
) {
  const ownedStore = useOwnedAssetStore();
  const store = providedStore ?? ownedStore;
  const progress = useAssetProgress(store);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    definition: GameDefinition;
    controller: InkController;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [stage, setStage] = useState(() => initialStage(definition));
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [display, setDisplay] = useState<DialogueDisplay | null>(null);
  const [resume, setResume] = useState<{ lineId: number; playback?: DialoguePlayback } | null>(
    null,
  );
  const dialogue = useRef<DialogueHandle>(null);
  const latest = useRef({ configureStory, onEvent, onReady, onError, onProgress, dialogueProps });
  latest.current = { configureStory, onEvent, onReady, onError, onProgress, dialogueProps };
  const controller = loaded?.definition === definition ? loaded.controller : null;

  const reportError = useCallback((reason: unknown) => {
    const result = reason instanceof Error ? reason : new Error(String(reason));
    setError(result);
    latest.current.onError?.(result);
  }, []);
  const run = useCallback(
    (action: () => void) => {
      try {
        action();
      } catch (reason) {
        reportError(reason);
      }
    },
    [reportError],
  );
  useEffect(() => {
    latest.current.onProgress?.(progress);
  }, [progress]);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoaded(null);
    setDisplay(null);
    setResume(null);
    setStage(initialStage(definition));
    async function load() {
      await store.preload(collectGameAssets(definition));
      if (cancelled) return;
      const next = new InkController(store.read(definition.story), {
        configure: latest.current.configureStory,
      });
      setLoaded({ definition, controller: next });
      latest.current.onReady?.(next);
    }
    void load().catch((reason: unknown) => {
      if (!cancelled) reportError(reason);
    });
    return () => {
      cancelled = true;
    };
  }, [definition, store, attempt, reportError]);

  const handleEvent = useCallback(
    (event: NarrativeEvent) => {
      run(() => {
        if (event.type === "tags") {
          const next = applyStageTags(definition, stageRef.current, event.tags);
          stageRef.current = next;
          setStage(next);
        }
        if (event.type === "reset") {
          const next = initialStage(definition);
          stageRef.current = next;
          setStage(next);
          setResume(null);
        }
        latest.current.onEvent?.(event);
      });
    },
    [definition, run],
  );

  const onDisplay = useCallback((next: DialogueDisplay) => {
    setDisplay(next);
    latest.current.dialogueProps?.onDisplayChange?.(next);
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      controller,
      advance: () => run(() => dialogue.current?.advance()),
      choose: (index) => run(() => dialogue.current?.choose(index)),
      restart: () => run(() => controller?.restart()),
      save: () => {
        if (!controller) throw new Error("The game is still loading.");
        return {
          version: 1,
          gameId: definition.id,
          narrative: controller.save(),
          stage: structuredClone(stageRef.current),
          dialogue: dialogue.current?.save(),
        };
      },
      restore: (save) => {
        if (!controller) throw new Error("The game is still loading.");
        if (
          save?.version !== 1 ||
          save.gameId !== definition.id ||
          !save.stage ||
          !definition.scenes[save.stage.scene] ||
          !save.stage.characters ||
          (save.dialogue &&
            (!Number.isFinite(save.dialogue.page) ||
              save.dialogue.page < 0 ||
              !Number.isFinite(save.dialogue.revealed) ||
              save.dialogue.revealed < 0))
        ) {
          throw new Error("This save is invalid or belongs to a different game.");
        }
        controller.restore(save.narrative);
        stageRef.current = structuredClone(save.stage);
        setStage(stageRef.current);
        setResume({ lineId: controller.getSnapshot().lineId, playback: save.dialogue });
      },
    }),
    [controller, definition, run],
  );

  const retry = useCallback(() => {
    store.retryFailed();
    setAttempt((value) => value + 1);
  }, [store]);
  const errorView = useCallback(
    (reason: Error) =>
      renderError?.(reason, retry) ?? (
        <div role="alert" style={{ padding: 36, color: "#f4d1c6", background: "#241b1a" }}>
          <p>Unable to play this story.</p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{reason.message}</pre>
          <button style={buttonStyle} onClick={retry}>
            Retry loading
          </button>
        </div>
      ),
    [renderError, retry],
  );
  const canvasStyle = useMemo<CSSProperties>(
    () => ({
      width: "100%",
      aspectRatio: `${definition.width ?? 1280} / ${definition.height ?? 720}`,
    }),
    [definition.width, definition.height],
  );

  return (
    <div
      className={className}
      style={{ position: "relative", ...style }}
      tabIndex={0}
      role="region"
      aria-label={definition.title}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          event.repeat ||
          paused ||
          target.closest("button, input, textarea, select, [contenteditable=true]")
        )
          return;
        if (event.code === "Space" || event.code === "Enter") {
          event.preventDefault();
          run(() => dialogue.current?.advance());
        } else if (/^[1-9]$/.test(event.key)) {
          event.preventDefault();
          run(() => dialogue.current?.choose(Number(event.key) - 1));
        }
      }}
    >
      {error ? (
        errorView(error)
      ) : !controller ? (
        (renderLoading?.(progress) ?? (
          <div
            role="status"
            style={{
              ...canvasStyle,
              display: "grid",
              placeContent: "center",
              gap: 16,
              background: "#13232e",
              color: "#f3eee2",
              textAlign: "center",
            }}
          >
            <span>Preparing your story</span>
            <progress
              aria-label="Loading game assets"
              value={progress.loaded}
              max={Math.max(1, progress.total)}
            />
            <small>
              {progress.loaded} / {progress.total} assets
            </small>
          </div>
        ))
      ) : (
        <RenderBoundary key={attempt} onError={reportError} fallback={errorView}>
          <AssetProvider store={store}>
            <InkProvider controller={controller} autoStart={false} onEvent={handleEvent}>
              <StartStory controller={controller} run={run} />
              <div
                style={canvasStyle}
                onPointerDown={(event) =>
                  event.currentTarget.parentElement?.focus({ preventScroll: true })
                }
              >
                <SceneCanvas
                  width={definition.width}
                  height={definition.height}
                  fallback={<div role="alert">WebGL is required to render this game.</div>}
                >
                  <Suspense fallback={null}>
                    <GameStage
                      definition={definition}
                      state={stage}
                      scene={scene}
                      paused={paused}
                      characterOverrides={characterOverrides}
                    />
                    {children}
                    <GameDialogue
                      controller={controller}
                      dialogueRef={dialogue}
                      props={dialogueProps}
                      paused={paused}
                      resume={resume}
                      onDisplay={onDisplay}
                      onError={reportError}
                      designWidth={definition.width ?? 1280}
                      designHeight={definition.height ?? 720}
                    />
                  </Suspense>
                </SceneCanvas>
              </div>
              <AccessibleControls
                controller={controller}
                dialogue={dialogue}
                paused={paused}
                display={display}
                controls={controls}
                allowFastSkip={dialogueProps?.allowFastSkip ?? true}
                run={run}
              />
            </InkProvider>
          </AssetProvider>
        </RenderBoundary>
      )}
    </div>
  );
});

function StartStory({
  controller,
  run,
}: {
  controller: InkController;
  run: (action: () => void) => void;
}) {
  // Parent provider subscribes before this microtask, including under StrictMode.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) run(controller.start);
    });
    return () => {
      active = false;
    };
  }, [controller, run]);
  return null;
}
function GameDialogue({
  controller,
  dialogueRef,
  props,
  paused,
  resume,
  onDisplay,
  onError,
  designWidth,
  designHeight,
}: {
  controller: InkController;
  dialogueRef: React.RefObject<DialogueHandle | null>;
  props?: NarrativeGameProps["dialogue"];
  paused: boolean;
  resume: { lineId: number; playback?: DialoguePlayback } | null;
  onDisplay: (display: DialogueDisplay) => void;
  onError: (error: Error) => void;
  designWidth: number;
  designHeight: number;
}) {
  const snapshot = useInk(controller);
  return (
    <InkDialogue
      width={designWidth * 0.875}
      height={designHeight * 0.292}
      padding={(designWidth * 30) / 1280}
      position={[0, -designHeight * 0.306, 100]}
      {...props}
      ref={dialogueRef}
      paused={paused}
      initialPlayback={resume?.lineId === snapshot.lineId ? resume.playback : undefined}
      onDisplayChange={onDisplay}
      onError={onError}
    />
  );
}
