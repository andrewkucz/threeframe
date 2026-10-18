import {
  AssetProvider,
  Backdrop,
  SceneCanvas,
  jsonAsset,
  useAsset,
  useAssetProgress,
  useOwnedAssetStore,
  type Asset,
  type Camera2DProps,
} from "@threeframe/core";
import { DialogueBox, InkStory, type DialogueDisplay, type DialogueHandle } from "@threeframe/ink";
import { SpineSprite, type SpineSpriteHandle } from "@threeframe/spine";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { speakers, spineboy, spineboyBinary, storyFont, tower, valley } from "./demo";
import { Icon } from "./ui";
import { Controls, options } from "./docs/Controls";
import { CodeBlock, Disclosure, DocsExample, Preview } from "./docs/DocsExample";
import { code, componentExample, jsx, printValue, sceneHost, sharedAssets } from "./docs/examples";
import {
  dialogueControls,
  dialogueDefaults,
  dialogueReference,
  sceneControls,
  sceneDefaults,
  sceneReference,
  spineControls,
  spineDefaults,
  spineReference,
} from "./docs/options";

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <p className="notice" role="alert">
        {this.state.error.message}
      </p>
    ) : (
      this.props.children
    );
  }
}
function LabScene({
  assets,
  children,
  fit = "contain",
  scenePreview = false,
}: {
  assets: readonly Asset<any>[];
  children: ReactNode;
  fit?: Camera2DProps["fit"];
  scenePreview?: boolean;
}) {
  const store = useOwnedAssetStore();
  const progress = useAssetProgress(store);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    void store
      .preload(assets)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [assets, store]);
  return (
    <div className={`lab-canvas${scenePreview ? " scene-preview" : ""}`}>
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : ready ? (
        <SceneErrorBoundary key={assets.map((asset) => asset.key).join("|")}>
          <AssetProvider store={store}>
            <SceneCanvas fit={fit}>
              <Suspense fallback={null}>{children}</Suspense>
            </SceneCanvas>
          </AssetProvider>
        </SceneErrorBoundary>
      ) : (
        <div className="loading" role="status">
          Loading assets… {Math.round(progress.progress * 100)}%
        </div>
      )}
    </div>
  );
}
const dialogueAssets = [valley, storyFont];
const sample =
  "Some stories begin with a grand adventure. This one begins with a light in a window, and the quiet feeling that someone, somewhere, has been waiting for you.\n\nBeyond the mountains, there is a place where every forgotten story finds a home. Perhaps yours belongs there too. Keep going. The road is longer than it looks, but you do not have to walk it alone. 🌙";
const inkSample =
  "A little light, a long way from home. # speaker:scout\n* [Follow the light.]\n  The journey begins. # speaker:narrator\n  -> END\n* [Stay a while.]\n  There is no hurry. # speaker:keeper\n  -> END";
const noChoices: typeof exampleChoices = [];
const exampleChoices = [
  { index: 0, text: "Follow the little light.", tags: [] },
  { index: 1, text: "Wait for the morning.", tags: [] },
];

export function DialogueLab() {
  const ref = useRef<DialogueHandle>(null);
  const [settings, setSettings] = useState(dialogueDefaults);
  const [text, setText] = useState(sample);
  const [script, setScript] = useState(inkSample);
  const [draft, setDraft] = useState(inkSample);
  const [iteration, setIteration] = useState(0);
  const [message, setMessage] = useState("");
  const [display, setDisplay] = useState<DialogueDisplay | null>(null);
  const ink = settings.mode === "ink";
  const presentation = useMemo(
    () => ({
      reveal: settings.reveal,
      speed: settings.speed,
      allowFastSkip: settings.fastSkip,
      width: settings.width,
      height: settings.height,
      padding: settings.padding,
      position: [0, -180, 100] as [number, number, number],
      theme: {
        fontFamily: "Lora",
        fontSize: settings.fontSize,
        background: settings.background,
        color: settings.color,
        radius: settings.radius,
      },
      speakers,
    }),
    [settings],
  );
  const choices = settings.choices ? exampleChoices : noChoices;
  const component = ink ? "InkStory" : "DialogueBox";
  const exampleProps = ink
    ? { source: code("source"), ...presentation }
    : { text, speaker: settings.speaker, choices, ...presentation };
  const usage = componentExample(
    `import { ${component} } from "@threeframe/ink";\nimport { speakers } from "./assets";${ink ? '\nimport source from "./story.ink?raw";' : ""}`,
    jsx(component, {
      ...exampleProps,
      speakers: code("speakers"),
      ...(ink
        ? { onError: code("(error) => console.error(error)") }
        : {
            onAdvance: code('() => console.log("Passage complete")'),
            onChoose: code('(index) => console.log("Choice", index)'),
          }),
    }),
  );
  const reset = () => {
    setSettings(dialogueDefaults);
    setText(sample);
    setScript(inkSample);
    setDraft(inkSample);
    setIteration((value) => value + 1);
    setMessage("");
  };
  const specs = dialogueControls.filter(
    (spec) => !ink || (spec.key !== "speaker" && spec.key !== "choices"),
  );
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          label={`${component} preview`}
          actions={
            <button
              className="text-button"
              onClick={() => {
                setIteration(iteration + 1);
                setMessage("");
              }}
            >
              <Icon name="reset" size={14} />
              Replay
            </button>
          }
          footer={
            <>
              <button
                className="small-button"
                disabled={
                  !display ||
                  Boolean(display.choices.length) ||
                  (display.printing && !settings.fastSkip)
                }
                onClick={() => ref.current?.advance()}
              >
                {display?.printing ? "Reveal" : "Continue"}
                <Icon name="arrow" size={14} />
              </button>
              {display?.choices.map((choice) => (
                <button
                  className="small-button"
                  key={choice.index}
                  onClick={() => ref.current?.choose(choice.index)}
                >
                  {choice.text}
                </button>
              ))}
              <span className="sr-only" aria-live="polite">
                {display?.text}
              </span>
              <span className="preview-caption" role="status">
                {message || (display ? `Page ${display.page + 1} of ${display.pageCount}` : "")}
              </span>
            </>
          }
        >
          <LabScene assets={dialogueAssets}>
            <Backdrop asset={valley} />
            {ink ? (
              <InkStory
                key={`ink-${iteration}`}
                {...presentation}
                source={script}
                ref={ref}
                onDisplayChange={setDisplay}
                onError={(error) => {
                  setMessage(error.message);
                  setDisplay(null);
                }}
                onEvent={(event) => {
                  if (event.type === "end") {
                    setMessage("Story complete. Replay to restart.");
                    setDisplay(null);
                  }
                }}
              />
            ) : (
              <DialogueBox
                key={`text-${iteration}`}
                {...presentation}
                text={text}
                speaker={settings.speaker}
                choices={choices}
                ref={ref}
                onDisplayChange={setDisplay}
                onAdvance={() => setMessage("Passage complete.")}
                onChoose={(index) => setMessage(`Selected: ${exampleChoices[index].text}`)}
              />
            )}
          </LabScene>
        </Preview>
        <DocsExample
          usage={usage}
          setup={[
            { name: "assets.ts", source: sharedAssets },
            { name: "App.tsx", source: sceneHost() },
            ...(ink ? [{ name: "story.ink", source: script, language: "ink" as const }] : []),
          ]}
          reference={dialogueReference.filter(
            (prop) => !ink || !["speaker", "choices"].includes(prop.name),
          )}
          note="This component belongs inside a Canvas. App.tsx adds the orthographic camera, background, font, and asset provider. Replace the demo asset URLs with your own."
          recipes={[
            {
              name: "Dialogue controls",
              source:
                "const dialogue = useRef<DialogueHandle>(null);\n// Pass ref={dialogue} to the component.\ndialogue.current?.advance();\ndialogue.current?.skip();\ndialogue.current?.choose(0);\nconst playback = dialogue.current?.save();",
            },
          ]}
        />
        <Disclosure title={ink ? "Edit Ink source" : "Edit dialogue text"}>
          <label className="editor-label" htmlFor="dialogue-source">
            {ink ? "story.ink" : "text"}
          </label>
          <textarea
            id="dialogue-source"
            className="source-editor"
            value={ink ? draft : text}
            spellCheck={false}
            onChange={(event) => (ink ? setDraft(event.target.value) : setText(event.target.value))}
          />
          {ink ? (
            <div className="editor-footer">
              <span>Compile to update the preview and example.</span>
              <button
                className="primary-button"
                onClick={() => {
                  setScript(draft);
                  setIteration(iteration + 1);
                  setMessage("");
                }}
              >
                Compile & play
              </button>
            </div>
          ) : (
            <p className="docs-note">
              Changes update the preview and JSX immediately. Long passages split into pages.
            </p>
          )}
        </Disclosure>
      </div>
      <Controls
        specs={specs}
        values={settings}
        onChange={(key, value) => {
          setSettings((previous) => ({ ...previous, [key]: value }));
          if (key === "mode") {
            setMessage("");
            setDisplay(null);
          }
        }}
        onReset={reset}
      />
    </div>
  );
}

function AnimationCatalog({
  binary,
  onAnimations,
}: {
  binary: boolean;
  onAnimations: (names: string[]) => void;
}) {
  const { data } = useAsset(binary ? spineboyBinary : spineboy);
  useEffect(
    () => onAnimations(data.animations.map((animation) => animation.name)),
    [data, onAnimations],
  );
  return null;
}
export function SpineLab() {
  const ref = useRef<SpineSpriteHandle>(null);
  const [settings, setSettings] = useState(spineDefaults);
  const [animations, setAnimations] = useState(["idle", "walk", "run", "jump"]);
  const [events, setEvents] = useState<string[]>([]);
  const binary = settings.format === "binary";
  const assets = useMemo(() => [binary ? spineboyBinary : spineboy, valley], [binary]);
  const { format: _format, ...sprite } = settings;
  const props = { ...sprite, position: [0, -270, 0] as [number, number, number] };
  const listener = useMemo(
    () => ({
      start: (entry: { animation: { name: string } | null }) =>
        setEvents((previous) => [`start: ${entry.animation?.name}`, ...previous].slice(0, 5)),
      complete: (entry: { animation: { name: string } | null }) =>
        setEvents((previous) => [`complete: ${entry.animation?.name}`, ...previous].slice(0, 5)),
    }),
    [],
  );
  const specs = spineControls.map((spec) =>
    spec.key === "animation" ? { ...spec, options: options(...animations) } : spec,
  );
  const assetDeclaration = `const spineboy = spineAsset(${printValue({ skeleton: `/assets/spineboy/spineboy-pro.${binary ? "skel" : "json"}`, atlas: "/assets/spineboy/spineboy.atlas", format: binary ? "binary" : "json" })});`;
  const usage = componentExample(
    `import { SpineSprite, spineAsset } from "@threeframe/spine";\n\n${assetDeclaration}`,
    jsx("SpineSprite", { asset: code("spineboy"), ...props }),
  );
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          label="SpineSprite preview"
          actions={
            <button
              className="text-button"
              onClick={() => ref.current?.play(settings.animation, settings.loop)}
            >
              <Icon name="reset" size={14} />
              Replay
            </button>
          }
          footer={
            <>
              <span className="preview-caption">Spineboy · Spine 4.3</span>
              <button
                className="small-button"
                onClick={() => {
                  ref.current?.play("jump", false);
                  ref.current?.queue(settings.animation, settings.loop);
                }}
              >
                Queue a jump
                <Icon name="arrow" size={14} />
              </button>
            </>
          }
        >
          <LabScene assets={assets}>
            <Backdrop asset={valley} />
            <AnimationCatalog binary={binary} onAnimations={setAnimations} />
            <SpineSprite
              ref={ref}
              asset={binary ? spineboyBinary : spineboy}
              {...props}
              listener={listener}
            />
          </LabScene>
        </Preview>
        <DocsExample
          usage={usage}
          setup={[
            { name: "assets.ts", source: sharedAssets },
            { name: "App.tsx", source: sceneHost({ font: false }) },
          ]}
          reference={spineReference}
          note="Put the JSON or binary skeleton, atlas, and atlas images in public/assets/spineboy. The 4.3 runtime requires matching exports. This wrapper provides the canvas and asset cache."
          recipes={[
            {
              name: "Animation tracks",
              source: `const sprite = useRef<SpineSpriteHandle>(null);\n// Pass ref={sprite} to SpineSprite.\nsprite.current?.play("jump", false);\nsprite.current?.queue(${JSON.stringify(settings.animation)}, ${settings.loop});\nsprite.current?.play("shoot", false, 1);\nsprite.current?.clear(1, ${settings.mixDuration});`,
            },
          ]}
        />
        <Disclosure title="Animation events">
          <CodeBlock
            file={{
              name: "Listen to animations",
              source:
                "<SpineSprite\n  asset={spineboy}\n  listener={{\n    complete: (entry) => console.log(entry.animation?.name),\n    event: (_, event) => console.log(event.data.name),\n  }}\n/>",
            }}
          />
          <ol className="event-list">
            {events.map((event, index) => (
              <li key={`${index}-${event}`}>
                <code>{event}</code>
              </li>
            ))}
          </ol>
        </Disclosure>
      </div>
      <Controls
        specs={specs}
        values={settings}
        onChange={(key, value) => setSettings((previous) => ({ ...previous, [key]: value }))}
        onReset={() => {
          setSettings(spineDefaults);
          setEvents([]);
          ref.current?.play("idle", true);
        }}
      />
    </div>
  );
}

const sceneAssets = [valley, tower];
export function AssetsLab() {
  const [generation, setGeneration] = useState(0);
  return <AssetSession key={generation} reset={() => setGeneration(generation + 1)} />;
}
function AssetSession({ reset }: { reset: () => void }) {
  const store = useOwnedAssetStore();
  const progress = useAssetProgress(store);
  const [settings, setSettings] = useState(sceneDefaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void store
      .preload(sceneAssets)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [store]);
  const backdrop = {
    fit: settings.fit,
    opacity: settings.opacity,
    width: settings.width,
    height: settings.height,
  };
  const backdropCode = jsx("Backdrop", { asset: code("background"), ...backdrop });
  const usage = `import { Suspense } from "react";
import { AssetProvider, Backdrop, SceneCanvas, textureAsset, useOwnedAssetStore } from "@threeframe/core";

const background = textureAsset("/assets/${settings.backdrop}.svg");

export default function Example() {
  const store = useOwnedAssetStore();
  return (
    <div style={{ aspectRatio: "16 / 10" }}>
      <AssetProvider store={store}>
        <SceneCanvas width={1280} height={720} fit="${settings.cameraFit}">
          <color attach="background" args={["#14232c"]} />
          <Suspense fallback={null}>
${backdropCode
  .split("\n")
  .map((line) => `            ${line}`)
  .join("\n")}
          </Suspense>
        </SceneCanvas>
      </AssetProvider>
    </div>
  );
}`;
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          label="Scene preview"
          actions={
            <button className="text-button" onClick={reset}>
              <Icon name="reset" size={14} />
              Reload assets
            </button>
          }
          footer={
            <>
              <span className="preview-caption">Design space 1280 × 720 · viewport 16:10</span>
              <span className="asset-count">
                {progress.loaded}/{progress.total} assets ready
              </span>
            </>
          }
        >
          <div className="lab-canvas scene-preview">
            {ready ? (
              <AssetProvider store={store}>
                <SceneCanvas fit={settings.cameraFit}>
                  <color attach="background" args={["#14232c"]} />
                  <Suspense fallback={null}>
                    <Backdrop
                      asset={settings.backdrop === "valley" ? valley : tower}
                      {...backdrop}
                    />
                  </Suspense>
                </SceneCanvas>
              </AssetProvider>
            ) : (
              <div className="loading" role="status">
                Loading scene assets…
              </div>
            )}
          </div>
        </Preview>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <DocsExample
          usage={usage}
          setup={[
            {
              name: "Asset preloading",
              source:
                'import { AssetStore, textureAsset } from "@threeframe/core";\n\nconst store = new AssetStore();\nconst background = textureAsset("/assets/valley.svg");\n\nawait store.preload([background]);\n// Pass store to AssetProvider.\n// When all consumers have unmounted:\nstore.dispose();',
            },
          ]}
          reference={sceneReference}
          note="This example owns its canvas, so render Example directly in your app. Put valley.svg and tower.svg in public/assets, or change the URLs. The live preview preloads both backgrounds."
          recipes={[
            {
              name: "Loading and recovery",
              source:
                "const progress = useAssetProgress(store);\nconsole.log(progress.loaded, progress.total, progress.failed);\n\n// Clear failed records, then retry the original descriptor.\nstore.retryFailed();\nawait store.preload(assets);",
            },
          ]}
        />
        <Disclosure title="Asset loading & errors">
          <div className="resource-actions">
            <button
              className="small-button"
              onClick={() =>
                void store.preload(sceneAssets).catch((reason: unknown) => setError(String(reason)))
              }
            >
              Preload again
            </button>
            <button
              className="small-button"
              onClick={() =>
                void store
                  .load(jsonAsset("/assets/missing-demo-asset.json"))
                  .catch((reason: unknown) => setError(String(reason)))
              }
            >
              Try a missing asset
            </button>
            <button
              className="small-button"
              onClick={() => {
                store.retryFailed();
                setError("");
              }}
            >
              Clear failed loads
            </button>
            <button className="small-button" onClick={reset}>
              Dispose & reload
            </button>
          </div>
          <progress
            aria-label="Asset loading progress"
            value={progress.loaded}
            max={Math.max(1, progress.total)}
          />
          <div className="asset-list">
            {progress.entries.map((entry) => (
              <div key={entry.key}>
                <code>{entry.key}</code>
                <span className={`status-pill ${entry.status}`}>{entry.status}</span>
              </div>
            ))}
          </div>
        </Disclosure>
      </div>
      <Controls
        specs={sceneControls}
        values={settings}
        onChange={(key, value) => setSettings((previous) => ({ ...previous, [key]: value }))}
        onReset={() => setSettings(sceneDefaults)}
      />
    </div>
  );
}
