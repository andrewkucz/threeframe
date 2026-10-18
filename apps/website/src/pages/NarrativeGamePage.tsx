import { NarrativeGame, type GameSave, type NarrativeGameHandle } from "@threeframe/engine";
import { useCallback, useMemo, useRef, useState } from "react";
import type { NarrativeEvent } from "../types";
import { createDemo, source, speakers } from "../demo";
import { Icon } from "../ui";
import { Controls } from "../docs/Controls";
import { CodeBlock, Disclosure, DocsExample, Preview } from "../docs/DocsExample";
import { code, componentExample, gameSetup, jsx } from "../docs/examples";
import { playerControls, playerDefaults, playerReference } from "../docs/options";

export default function NarrativeGamePage() {
  const game = useRef<NarrativeGameHandle>(null);
  const [settings, setSettings] = useState(playerDefaults);
  const [script, setScript] = useState(source);
  const [draft, setDraft] = useState(source);
  const definition = useMemo(() => createDemo(script), [script]);
  const [events, setEvents] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [courage, setCourage] = useState(0);
  const dialogue = useMemo(
    () => ({
      speed: settings.speed,
      reveal: settings.reveal,
      allowFastSkip: settings.fastSkip,
      position: [0, settings.placement === "bottom" ? -220 : 215, 100] as [number, number, number],
      theme: { fontFamily: settings.font, fontSize: settings.fontSize, accent: settings.accent },
      speakers: { ...speakers, scout: { ...speakers.scout, color: settings.accent } },
    }),
    [settings],
  );
  const handleEvent = useCallback((event: NarrativeEvent) => {
    const message =
      event.type === "tags"
        ? event.tags.join(" · ")
        : event.type === "choice"
          ? `choice: ${event.choice.text}`
          : event.type === "line"
            ? `line ${event.snapshot.lineId}: ${event.snapshot.speaker ?? "narrator"}`
            : event.type;
    setEvents((previous) => [message, ...previous].slice(0, 6));
    setCourage(Number(game.current?.controller?.getVariable("courage") ?? 0));
  }, []);
  const save = () => {
    try {
      if (!game.current?.controller) return;
      localStorage.setItem("threeframe-demo-v1", JSON.stringify(game.current.save()));
      setNotice("Saved in this browser.");
    } catch (error) {
      setNotice(String(error));
    }
  };
  const restore = () => {
    try {
      const saved = localStorage.getItem("threeframe-demo-v1");
      if (!saved) {
        setNotice("Save a moment first.");
        return;
      }
      game.current?.restore(JSON.parse(saved) as GameSave);
      setNotice("Save restored.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  const usage = componentExample(
    'import { NarrativeGame } from "@threeframe/engine";\nimport { game, speakers } from "../game";',
    jsx("NarrativeGame", {
      definition: code("game"),
      paused: settings.paused,
      scene: settings.scene || undefined,
      dialogue: {
        ...dialogue,
        speakers: code(
          `{ ...speakers, scout: { ...speakers.scout, color: ${JSON.stringify(settings.accent)} } }`,
        ),
      },
      onEvent: code("(event) => console.log(event)"),
    }),
  );
  const reset = () => {
    setSettings(playerDefaults);
    setScript(source);
    setDraft(source);
    setNotice("");
    game.current?.restart();
  };
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          actions={
            <>
              <button
                className="text-button"
                onClick={() => {
                  game.current?.restart();
                  setNotice("");
                }}
              >
                <Icon name="reset" size={14} />
                Restart
              </button>
              <button className="text-button" onClick={save}>
                <Icon name="save" size={14} />
                Save
              </button>
              <button className="text-button" onClick={restore}>
                Restore
              </button>
            </>
          }
        >
          <NarrativeGame
            ref={game}
            definition={definition}
            paused={settings.paused}
            scene={settings.scene || undefined}
            dialogue={dialogue}
            onEvent={handleEvent}
            onError={(error) => setNotice(error.message)}
          />
        </Preview>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <DocsExample
          usage={usage}
          setup={[
            { name: "game.ts", source: gameSetup },
            { name: "story.ink", source: script, language: "ink" },
          ]}
          reference={playerReference}
          note="NarrativeGame owns its canvas and asset store. Copy these files beside Example.tsx; the asset URLs refer to this demo’s public/assets directory."
          recipes={[
            {
              name: "Playback and state",
              source:
                'const player = useRef<NarrativeGameHandle>(null);\n// Pass ref={player} to NarrativeGame.\nplayer.current?.advance();\nplayer.current?.choose(0);\nplayer.current?.restart();\n\nconst save = player.current?.save();\nif (save) player.current?.restore(save);\nplayer.current?.controller?.setVariable("courage", 5);',
            },
          ]}
        />
        <Disclosure title="Edit Ink source">
          <label className="editor-label" htmlFor="story-source">
            story.ink
          </label>
          <textarea
            id="story-source"
            className="source-editor"
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="editor-footer">
            <span>Compile to apply changes and restart the story.</span>
            <button
              className="primary-button"
              onClick={() => {
                setScript(draft);
                setNotice("");
                if (draft === script) game.current?.restart();
              }}
            >
              Compile & play
            </button>
          </div>
        </Disclosure>
        <Disclosure title="Events & Ink state">
          <div className="state-row">
            <code>courage = {courage}</code>
            <button
              className="small-button"
              onClick={() => {
                try {
                  game.current?.controller?.setVariable("courage", courage + 1);
                  setCourage(courage + 1);
                } catch (error) {
                  setNotice(String(error));
                }
              }}
            >
              Increment
            </button>
          </div>
          <CodeBlock
            file={{
              name: "Update a variable",
              source: `player.current?.controller?.setVariable("courage", ${courage + 1});`,
            }}
          />
          <ol className="event-list" aria-label="Recent story events">
            {events.map((event, index) => (
              <li key={`${index}-${event}`}>
                <code>{event}</code>
              </li>
            ))}
          </ol>
        </Disclosure>
      </div>
      <Controls
        specs={playerControls}
        values={settings}
        onChange={(key, value) => setSettings((previous) => ({ ...previous, [key]: value }))}
        onReset={reset}
      />
    </div>
  );
}
