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
  mergeDialogueOptions,
  resolveDialoguePreset,
  useInk,
  type DialogueDisplay,
  type DialogueHandle,
  type DialoguePlayback,
  type InkDialogueProps,
  type NarrativeChoice,
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
/** Every string the player's DOM layer shows. Override any subset, for example to localize. */
export interface NarrativeGameLabels {
  continue: string;
  reveal: string;
  printing: string;
  ended: string;
  playAgain: string;
  paused: string;
  keyboardHint: string;
  /** Transcript name for lines without a speaker. */
  narrator: string;
  choice: (choice: NarrativeChoice, number: number) => string;
  loading: string;
  loadingProgress: (loaded: number, total: number) => string;
  loadingProgressLabel: string;
  error: string;
  retry: string;
  webglRequired: string;
}
export const defaultNarrativeGameLabels: NarrativeGameLabels = {
  continue: "Continue",
  reveal: "Reveal dialogue",
  printing: "Printing…",
  ended: "The story has ended.",
  playAgain: "Play again",
  paused: "Paused",
  keyboardHint: "Space to continue · Number keys to choose",
  narrator: "Narrator",
  choice: (choice, number) => `${number}. ${choice.text}`,
  loading: "Preparing your story",
  loadingProgress: (loaded, total) => `${loaded} / ${total} assets`,
  loadingProgressLabel: "Loading game assets",
  error: "Unable to play this story.",
  retry: "Retry loading",
  webglRequired: "WebGL is required to render this game.",
};
/** DOM parts that accept `classNames` and `styles`. */
export type NarrativeGameSlot =
  | "root"
  | "canvas"
  | "controls"
  | "button"
  | "hint"
  | "status"
  | "loading"
  | "error";
export interface NarrativeGameKeyboard {
  /** `KeyboardEvent.code` values that advance. */
  advance?: readonly string[];
  /** Number keys 1–9 choose the matching choice. */
  choiceKeys?: boolean;
}

export interface NarrativeGameProps {
  definition: GameDefinition;
  store?: AssetStore;
  paused?: boolean;
  scene?: string;
  characterOverrides?: Readonly<Record<string, CharacterOverrides>>;
  /**
   * Live dialogue presentation, including `preset`. Layers, lowest first: layout scaled to the
   * definition's design size, then the preset, then these props.
   */
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
  /** Visible DOM controls plus the native canvas controls. `false` keeps them for screen readers only. */
  controls?: boolean;
  labels?: Partial<NarrativeGameLabels>;
  /** Class names per DOM part. */
  classNames?: Partial<Record<NarrativeGameSlot, string>>;
  /** Inline styles per DOM part, merged over the built-in look. */
  styles?: Partial<Record<NarrativeGameSlot, CSSProperties>>;
  /** Drop the built-in inline styles so `classNames` fully control the DOM parts. */
  unstyled?: boolean;
  /** `false` disables keyboard input. */
  keyboard?: NarrativeGameKeyboard | false;
}

interface Skin {
  labels: NarrativeGameLabels;
  slot: (
    name: NarrativeGameSlot,
    base?: CSSProperties,
  ) => { className?: string; style?: CSSProperties };
}
function createSkin(
  labels: Partial<NarrativeGameLabels> | undefined,
  classNames: NarrativeGameProps["classNames"],
  styles: NarrativeGameProps["styles"],
  unstyled: boolean,
): Skin {
  return {
    labels: { ...defaultNarrativeGameLabels, ...labels },
    slot: (name, base) => ({
      className: classNames?.[name],
      style: unstyled ? styles?.[name] : { ...base, ...styles?.[name] },
    }),
  };
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
  skin,
}: {
  skin: Skin;
  controller: InkController;
  dialogue: React.RefObject<DialogueHandle | null>;
  paused: boolean;
  display: DialogueDisplay | null;
  controls: boolean;
  allowFastSkip: boolean;
  run: (action: () => void) => void;
}) {
  const snapshot = useInk(controller);
  const { labels, slot } = skin;
  const button = slot("button", buttonStyle);
  const container = controls
    ? slot("controls", {
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "10px 14px",
        background: "#101d26",
        color: "#d9e4e8",
        fontSize: 12,
      })
    : { style: hidden };
  return (
    <div {...container}>
      <p aria-live="polite" aria-atomic="true" style={hidden}>
        {snapshot.status === "ended"
          ? labels.ended
          : `${snapshot.speaker ?? labels.narrator}: ${display?.text ?? snapshot.text}`}
      </p>
      {snapshot.status === "ended" ? (
        <>
          <span {...slot("status")}>{labels.ended}</span>
          <button {...button} onClick={() => run(controller.restart)}>
            {labels.playAgain}
          </button>
        </>
      ) : (
        <>
          <button
            {...button}
            disabled={
              paused || Boolean(display?.choices.length) || (display?.printing && !allowFastSkip)
            }
            onClick={() => run(() => dialogue.current?.advance())}
          >
            {display?.printing
              ? allowFastSkip
                ? labels.reveal
                : labels.printing
              : labels.continue}
          </button>
          {display?.choices.map((choice, i) => (
            <button
              key={choice.index}
              {...button}
              disabled={paused}
              onClick={() => run(() => dialogue.current?.choose(choice.index))}
            >
              {labels.choice(choice, i + 1)}
            </button>
          ))}
          <span {...slot("hint", { marginLeft: "auto", opacity: 0.6 })}>
            {paused ? labels.paused : labels.keyboardHint}
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
    labels: labelOverrides,
    classNames,
    styles,
    unstyled = false,
    keyboard = {},
  },
  ref,
) {
  const skin = useMemo(
    () => createSkin(labelOverrides, classNames, styles, unstyled),
    [labelOverrides, classNames, styles, unstyled],
  );
  const advanceKeys = keyboard ? (keyboard.advance ?? ["Space", "Enter"]) : [];
  const choiceKeys = keyboard ? keyboard.choiceKeys !== false : false;
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
        <div
          role="alert"
          {...skin.slot("error", { padding: 36, color: "#f4d1c6", background: "#241b1a" })}
        >
          <p>{skin.labels.error}</p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{reason.message}</pre>
          <button {...skin.slot("button", buttonStyle)} onClick={retry}>
            {skin.labels.retry}
          </button>
        </div>
      ),
    [renderError, retry, skin],
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
      className={[className, classNames?.root].filter(Boolean).join(" ") || undefined}
      style={{ position: "relative", ...styles?.root, ...style }}
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
        if (advanceKeys.includes(event.code)) {
          event.preventDefault();
          run(() => dialogue.current?.advance());
        } else if (choiceKeys && /^[1-9]$/.test(event.key)) {
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
            {...skin.slot("loading", {
              ...canvasStyle,
              display: "grid",
              placeContent: "center",
              gap: 16,
              background: "#13232e",
              color: "#f3eee2",
              textAlign: "center",
            })}
          >
            <span>{skin.labels.loading}</span>
            <progress
              aria-label={skin.labels.loadingProgressLabel}
              value={progress.loaded}
              max={Math.max(1, progress.total)}
            />
            <small>{skin.labels.loadingProgress(progress.loaded, progress.total)}</small>
          </div>
        ))
      ) : (
        <RenderBoundary key={attempt} onError={reportError} fallback={errorView}>
          <AssetProvider store={store}>
            <InkProvider controller={controller} autoStart={false} onEvent={handleEvent}>
              <StartStory controller={controller} run={run} />
              <div
                {...skin.slot("canvas", canvasStyle)}
                onPointerDown={(event) =>
                  event.currentTarget.parentElement?.focus({ preventScroll: true })
                }
              >
                <SceneCanvas
                  width={definition.width}
                  height={definition.height}
                  fallback={<div role="alert">{skin.labels.webglRequired}</div>}
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
                allowFastSkip={
                  dialogueProps?.allowFastSkip ??
                  resolveDialoguePreset(dialogueProps?.preset).allowFastSkip ??
                  true
                }
                run={run}
                skin={skin}
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
  const { preset, ...own } = props ?? {};
  type Options = NonNullable<NarrativeGameProps["dialogue"]>;
  // Layout scales with the design size, but a preset's geometry and explicit props win over it.
  const options = mergeDialogueOptions<Options>(
    {
      width: designWidth * 0.875,
      height: designHeight * 0.292,
      padding: (designWidth * 28) / 1280,
      position: [0, -designHeight * 0.306, 100],
    },
    resolveDialoguePreset(preset) as Options,
    own,
  );
  return (
    <InkDialogue
      {...options}
      ref={dialogueRef}
      paused={paused}
      initialPlayback={resume?.lineId === snapshot.lineId ? resume.playback : undefined}
      onDisplayChange={onDisplay}
      onError={onError}
    />
  );
}
