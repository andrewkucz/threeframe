import {
  DialogueBox,
  InkStory,
  type DialogueDisplay,
  type DialogueHandle,
  type DialoguePresetName,
} from "@threeframe/ink";
import { useMemo, useRef, useState } from "react";
import { speakers, storyFont } from "../demo";
import { useBackdropPicker } from "../docs/BackdropPicker";
import { Controls } from "../docs/Controls";
import { dialoguePresets, presetSettings } from "../docs/dialoguePresets";
import { Presets } from "../docs/Presets";
import { Disclosure, DocsExample, Preview } from "../docs/DocsExample";
import { code, componentExample, jsx, sceneHost, sharedAssets } from "../docs/examples";
import {
  dialogueControls,
  dialogueControlVisible,
  dialogueDefaults,
  dialogueProps,
  dialogueReference,
  exportDialoguePreset,
  parseDialoguePreset,
  presetMatches,
  type DialogueSettings,
} from "../docs/options";
import { LabScene } from "../LabScene";
import { Icon } from "../ui";

const sample =
  "Some stories begin with a grand adventure. This one begins with a light in a window, and the quiet feeling that someone, somewhere, has been waiting for you.\n\nBeyond the mountains, there is a place where every forgotten story finds a home. Perhaps yours belongs there too. Keep going. The road is longer than it looks, but you do not have to walk it alone. 🌙";
const inkSample =
  "A little light, a long way from home. # speaker:scout\n* [Follow the light.]\n  The journey begins. # speaker:narrator\n  -> END\n* [Stay a while.]\n  There is no hurry. # speaker:keeper\n  -> END";
const choiceText = [
  "Follow the little light.",
  "Wait for the morning.",
  "Call out into the dark.",
  "Light a lantern of your own.",
  "Turn back toward the village.",
  "Sit with the keeper a while longer.",
];
const choiceSets = {
  none: [],
  two: choiceText.slice(0, 2),
  six: choiceText,
} satisfies Record<string, string[]>;
const exampleChoices = Object.fromEntries(
  Object.entries(choiceSets).map(([key, texts]) => [
    key,
    texts.map((choice, index) => ({ index, text: choice, tags: [] as string[] })),
  ]),
);

export default function DialoguePage() {
  const ref = useRef<DialogueHandle>(null);
  const [settings, setSettings] = useState(dialogueDefaults);
  // The preset the current settings started from; tweaks are detected by comparing against it.
  const [preset, setPreset] = useState<{
    id: DialoguePresetName | null;
    name: string;
    settings: DialogueSettings;
  }>(() => ({
    id: "threeframe",
    name: dialoguePresets[0].name,
    settings: presetSettings("threeframe"),
  }));
  const presetModified = !presetMatches(settings, preset.settings);
  const loadPreset = (next: typeof preset) => {
    setPreset(next);
    // Keep the chosen component, speaker, and choices; a preset sets everything else.
    setSettings((previous) => ({ ...previous, ...next.settings }));
  };
  const stageColor = String(settings.previewBackground);
  const backdropPicker = useBackdropPicker(stageColor);
  const [text, setText] = useState(sample);
  const [script, setScript] = useState(inkSample);
  const [draft, setDraft] = useState(inkSample);
  const [iteration, setIteration] = useState(0);
  const [message, setMessage] = useState("");
  const [display, setDisplay] = useState<DialogueDisplay | null>(null);
  const backdrop = backdropPicker.asset;
  // Stable per backdrop so LabScene only reloads (and restarts the dialogue) when it changes.
  const assets = useMemo(() => (backdrop ? [backdrop, storyFont] : [storyFont]), [backdrop]);
  const ink = settings.mode === "ink";
  // A built-in preset is passed by name, with only the tweaked values on top: exactly what you
  // would write by hand. The default preset is the package defaults, so it needs no name.
  const named = preset.id && preset.id !== "threeframe" ? preset.id : null;
  const presetProps = useMemo(
    () =>
      named
        ? { preset: named, ...dialogueProps(settings, preset.settings) }
        : dialogueProps(settings),
    [named, settings, preset.settings],
  );
  const presentation = useMemo(() => ({ ...presetProps, speakers }), [presetProps]);
  const choices = exampleChoices[String(settings.choices)] ?? exampleChoices.none;
  const speaker = settings.speaker ? String(settings.speaker) : null;
  const component = ink ? "InkStory" : "DialogueBox";
  const codeProps = presetProps;
  const exampleProps = ink
    ? { source: code("source"), ...codeProps }
    : { text, speaker, ...(choices.length ? { choices } : {}), ...codeProps };
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
  const specs = dialogueControls.filter(
    (spec) =>
      (!ink || (spec.key !== "speaker" && spec.key !== "choices")) &&
      dialogueControlVisible(spec.key, settings),
  );
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          label={`${component} preview`}
          footer={
            <>
              {backdropPicker.picker}
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
                    (display.printing && settings.allowFastSkip === false)
                  }
                  onClick={() => ref.current?.advance()}
                >
                  {display?.printing ? "Reveal" : "Continue"}
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            </>
          }
        >
          <LabScene assets={assets} background={stageColor}>
            {backdropPicker.scene}
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
                speaker={speaker}
                choices={choices}
                ref={ref}
                onDisplayChange={setDisplay}
                onAdvance={() => setMessage("Passage complete.")}
                onChoose={(index) =>
                  setMessage(`Selected: ${choices.find((choice) => choice.index === index)?.text}`)
                }
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
              source: sceneHost(backdropPicker.host),
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
        collapsible
        preface={
          <Presets
            presets={dialoguePresets}
            selected={preset.id}
            importedName={preset.id === null ? preset.name : null}
            modified={presetModified}
            exportText={() =>
              exportDialoguePreset(
                settings,
                presetModified ? `${preset.name} (custom)` : preset.name,
              )
            }
            onSelect={(id) => {
              const next = dialoguePresets.find((item) => item.id === id);
              if (next)
                loadPreset({
                  id: next.id,
                  name: next.name,
                  settings: presetSettings(next.id),
                });
            }}
            onRestore={() => loadPreset(preset)}
            onImport={(source) => {
              const result = parseDialoguePreset(source);
              loadPreset({
                id: null,
                name: result.name ?? "Imported preset",
                settings: result.settings,
              });
              return result.warnings;
            }}
          />
        }
      />
    </div>
  );
}
