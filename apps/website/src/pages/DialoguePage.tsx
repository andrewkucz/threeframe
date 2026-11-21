import { Backdrop, textureAsset, type Asset } from "@threeframe/core";
import { DialogueBox, InkStory, type DialogueDisplay, type DialogueHandle } from "@threeframe/ink";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Texture } from "three";
import { speakers, storyFont, tower, valley } from "../demo";
import { Controls } from "../docs/Controls";
import { Disclosure, DocsExample, Preview } from "../docs/DocsExample";
import { code, componentExample, jsx, sceneHost, sharedAssets } from "../docs/examples";
import { dialogueControls, dialogueDefaults, dialogueReference } from "../docs/options";
import { LabScene } from "../LabScene";
import { Icon } from "../ui";

const builtInBackdrops: Record<string, Asset<Texture>> = { valley, tower };
const sample =
  "Some stories begin with a grand adventure. This one begins with a light in a window, and the quiet feeling that someone, somewhere, has been waiting for you.\n\nBeyond the mountains, there is a place where every forgotten story finds a home. Perhaps yours belongs there too. Keep going. The road is longer than it looks, but you do not have to walk it alone. 🌙";
const inkSample =
  "A little light, a long way from home. # speaker:scout\n* [Follow the light.]\n  The journey begins. # speaker:narrator\n  -> END\n* [Stay a while.]\n  There is no hurry. # speaker:keeper\n  -> END";
const noChoices: typeof exampleChoices = [];
const exampleChoices = [
  { index: 0, text: "Follow the little light.", tags: [] },
  { index: 1, text: "Wait for the morning.", tags: [] },
];

export default function DialoguePage() {
  const ref = useRef<DialogueHandle>(null);
  const [settings, setSettings] = useState(dialogueDefaults);
  const [text, setText] = useState(sample);
  const [script, setScript] = useState(inkSample);
  const [draft, setDraft] = useState(inkSample);
  const [iteration, setIteration] = useState(0);
  const [message, setMessage] = useState("");
  const [display, setDisplay] = useState<DialogueDisplay | null>(null);
  const [upload, setUpload] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => (upload ? () => URL.revokeObjectURL(upload.url) : undefined), [upload]);
  const uploadAsset = useMemo(() => upload && textureAsset(upload.url), [upload]);
  const backdrop =
    settings.backdrop === "custom" ? uploadAsset : builtInBackdrops[settings.backdrop];
  // Stable per backdrop so LabScene only reloads (and restarts the dialogue) when it changes.
  const assets = useMemo(() => (backdrop ? [backdrop, storyFont] : [storyFont]), [backdrop]);
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
          footer={
            <>
              <div className="preview-footer-group">
                <select
                  aria-label="Preview backdrop"
                  value={settings.backdrop}
                  onChange={(event) =>
                    setSettings((previous) => ({ ...previous, backdrop: event.target.value }))
                  }
                >
                  <option value="grid">Grid (default)</option>
                  <option value="valley">valley.svg</option>
                  <option value="tower">tower.svg</option>
                  <option value="custom">Upload image…</option>
                </select>
                {settings.backdrop === "custom" && (
                  <>
                    <label className="small-button file-button">
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) setUpload({ name: file.name, url: URL.createObjectURL(file) });
                          event.target.value = "";
                        }}
                      />
                      {upload ? "Change image…" : "Choose image…"}
                    </label>
                    <span className="preview-caption">
                      {upload ? upload.name : "Stays in this browser tab only."}
                    </span>
                  </>
                )}
              </div>
              <span className="sr-only" aria-live="polite">
                {display?.text}
              </span>
              <span className="preview-caption preview-footer-status" role="status">
                {message || (display ? `Page ${display.page + 1} of ${display.pageCount}` : "")}
              </span>
              <div className="preview-footer-group preview-footer-actions">
                <button
                  className="small-button"
                  onClick={() => {
                    setIteration(iteration + 1);
                    setMessage("");
                    setDisplay(null);
                  }}
                >
                  <Icon name="reset" size={14} />
                  Start over
                </button>
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
              </div>
            </>
          }
        >
          <LabScene assets={assets}>
            {backdrop ? (
              <Backdrop asset={backdrop} />
            ) : (
              settings.backdrop === "grid" && (
                <gridHelper
                  args={[2560, 64, "#4a6472", "#22353f"]}
                  rotation-x={Math.PI / 2}
                  position-z={-100}
                />
              )
            )}
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
                    setMessage("Story complete. Start over to replay.");
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
            {
              name: "App.tsx",
              source: sceneHost({
                background:
                  settings.backdrop === "grid"
                    ? "grid"
                    : settings.backdrop === "tower"
                      ? "tower"
                      : "valley",
              }),
            },
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
