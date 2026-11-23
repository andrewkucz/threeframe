import { GamePlayer, useGameSession } from "@threeframe/engine";
import {
  builtinDirectives,
  createManifest,
  memoryPersister,
  packageFromFiles,
  type GameManifest,
  type GamePackage,
} from "@threeframe/game";
import { useEffect, useMemo, useState } from "react";
import { Disclosure, DocsExample, Preview } from "../docs/DocsExample";
import type { PropDoc } from "../docs/examples";
import { Icon } from "../ui";
import { kindle } from "./kindleScene";

const sprite = {
  skeleton: "spineboy/spineboy-pro.json",
  atlas: "spineboy/spineboy.atlas",
};
const files = [
  "spineboy/spineboy-pro.json",
  "spineboy/spineboy.atlas",
  "spineboy/spineboy.png",
  "valley.svg",
  "tower.svg",
];

const manifest: GameManifest = createManifest({
  id: "threeframe-demo",
  title: "The Last Light",
  description: "Two levels, directives, state and saves, all from one game package.",
  state: {
    variables: {
      courage: {
        type: "number",
        default: 0,
        min: 0,
        max: 5,
        label: "Courage",
        icon: "✦",
        hud: true,
      },
    },
  },
  characters: {
    scout: {
      name: "The traveler",
      color: "#eabd78",
      sprite,
      animation: "idle",
      scale: 0.5,
      y: -130,
    },
    keeper: {
      name: "The keeper",
      color: "#99d2c4",
      sprite,
      animation: "idle",
      scale: 0.46,
      y: -130,
      flip: true,
    },
  },
  backdrops: {
    valley: { type: "image", image: "valley.svg" },
    tower: { type: "image", image: "tower.svg" },
    night: { type: "gradient", colors: ["#050913", "#16243a", "#2b3c5c"] },
  },
  levels: [
    {
      id: "valley",
      title: "The Valley",
      scenes: [
        {
          id: "road",
          title: "The road",
          script: "levels/road.ink",
          backdrop: "valley",
          cast: [{ id: "scout", at: "left" }],
        },
      ],
    },
    {
      id: "tower",
      title: "The Tower",
      scenes: [
        {
          id: "kindle",
          title: "Carry the flame",
          kind: "custom",
          component: "kindle",
          script: "levels/kindle.ink",
          backdrop: "night",
          props: { embers: 3 },
          outcomes: { lit: { next: "beacon" } },
        },
        { id: "beacon", title: "The beacon", script: "levels/beacon.ink", backdrop: "night" },
      ],
    },
  ],
  credits: {
    sections: [{ heading: "Made with", lines: ["Threeframe", "Ink · Spine · three.js"] }],
  },
  saves: { slots: 2 },
  dialogue: { preset: "storybook" },
});

const defaultScripts: Record<string, string> = {
  "levels/road.ink": `>>> weather dust intensity=0.8
The light is still on. After all these years. # speaker:scout
>>> anim scout walk loop=true
>>> move scout center duration=1.6 wait
>>> anim scout idle
Will you climb to the tower? # speaker:scout
* [Climb.]
    ~ courage += 2
    >>> camera zoom=1.2 y=60 duration=1.2
    One step. Then another. # speaker:scout
* [Wait for morning.]
    The night is long. # speaker:scout
- >>> fade out duration=1 wait
-> END
`,
  "levels/kindle.ink": `// Knots played by the "kindle" custom scene.
=== intro ===
>>> fade in duration=1 wait
>>> weather embers intensity=0.5
Sparks drift up from the old brazier. Catch them to carry the flame.
-> DONE

=== lit ===
The flame takes hold in your cupped hands.
-> DONE
`,
  "levels/beacon.ink": `>>> weather snow intensity=0.7 wind=40
>>> show keeper from=right at=right duration=1 wait
You came. # speaker:keeper
>>> show scout at=left
{ courage >= 2:
    >>> flash color=fff4d0
    >>> shake strength=10
    The beacon roars back to life. # speaker:keeper
    >>> end_game kindled
- else:
    Come back when you are ready. # speaker:keeper
    >>> hide keeper to=right
    >>> end_game waiting
}
-> END
`,
};

async function loadFiles() {
  return Promise.all(
    files.map(async (path) => {
      const response = await fetch(`/assets/${path}`);
      if (!response.ok) throw new Error(`Could not load /assets/${path}`);
      return [path, await response.blob()] as const;
    }),
  );
}

export default function GamePlayerPage() {
  const [assets, setAssets] = useState<(readonly [string, Blob])[] | null>(null);
  const [error, setError] = useState("");
  const [scripts, setScripts] = useState(defaultScripts);
  const [applied, setApplied] = useState(defaultScripts);
  const [restart, setRestart] = useState(0);
  useEffect(() => {
    let active = true;
    loadFiles().then(
      (loaded) => active && setAssets(loaded),
      (reason: unknown) => active && setError(String(reason)),
    );
    return () => {
      active = false;
    };
  }, []);
  // A stable source id keeps sprites and images cached when only scripts change.
  const pkg = useMemo(
    () =>
      assets &&
      packageFromFiles(manifest, [...assets, ...Object.entries(applied)], `demo-game:${restart}`),
    [assets, applied, restart],
  );
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          label="Game preview"
          actions={
            <button className="text-button" onClick={() => setRestart((value) => value + 1)}>
              <Icon name="reset" size={14} />
              Restart
            </button>
          }
          footer={
            <span className="preview-caption">
              Space/Enter advance · 1–9 choose · Escape opens the menu · saves stay in memory
            </span>
          }
        >
          {pkg ? (
            <Player key={`${restart}`} pkg={pkg} />
          ) : (
            <div className="lab-canvas loading" role="status">
              {error || "Loading package files…"}
            </div>
          )}
        </Preview>
        <DocsExample
          usage={usage}
          setup={[
            { name: "game.json", source: JSON.stringify(manifest, null, 2) },
            ...Object.entries(defaultScripts).map(([name, source]) => ({
              name,
              source,
              language: "ink" as const,
            })),
          ]}
          reference={reference}
          note="Packages are folders with a game.json at the root, or zip archives of one. Every manifest path is package-relative, so the same package plays from a folder URL, an archive, or memory."
          recipes={[
            {
              name: "Custom scene (minigame)",
              source: `const kindle = defineCustomScene<{ embers: number }>({
  id: "kindle",
  props: { embers: { type: "number", default: 3 } },
  outcomes: ["lit"],
  Component({ props, scene }) {
    const [caught, setCaught] = scene.useSaved<number[]>("caught", []);
    const [, setCourage] = scene.useVariable<number>("courage");
    useEffect(() => void scene.dialogue("intro"), []);
    // …meshes whose onPointerDown calls catchEmber(i)…
    async function catchEmber(i: number) {
      setCaught([...caught, i]);
      setCourage((value) => value + 1);
      if (caught.length + 1 === props.embers) {
        await scene.dialogue("lit"); // a knot of the scene's script
        scene.complete("lit"); // follows the manifest's outcome wiring
      }
    }
  },
});
// Manifest: { "kind": "custom", "component": "kindle", "script": "levels/kindle.ink", … }
const session = useGameSession(pkg, { customScenes: [kindle] });`,
            },
            {
              name: "Custom directive",
              source: `const session = new GameSession(pkg, {
  directives: [{
    name: "confetti",
    usage: "confetti [count=80]",
    description: "Bursts confetti.",
    run: (directive, context) => context.effect("confetti", { count: 80 }),
  }],
});
// Render it: <GamePlayer session={session} effects={{ confetti: Confetti }} />`,
            },
            {
              name: "Saves in your own storage",
              source: `const session = new GameSession(pkg, {
  saves: {
    persister: {
      get: (key) => db.get(key),
      set: (key, value) => db.put(key, value),
      remove: (key) => db.delete(key),
    },
    slots: ["quick", "1", "2"],
  },
});`,
            },
          ]}
        />
        <Disclosure title="Edit the scripts">
          {Object.keys(scripts).map((path) => (
            <label key={path} className="script-editor">
              <code>{path}</code>
              <textarea
                spellCheck={false}
                rows={12}
                value={scripts[path]}
                onChange={(event) => setScripts({ ...scripts, [path]: event.target.value })}
              />
            </label>
          ))}
          <div className="resource-actions">
            <button className="small-button" onClick={() => setApplied(scripts)}>
              Apply & restart
            </button>
            <button
              className="small-button"
              onClick={() => {
                setScripts(defaultScripts);
                setApplied(defaultScripts);
              }}
            >
              Reset scripts
            </button>
          </div>
        </Disclosure>
        <Disclosure title="Directive reference">
          <dl className="directive-list">
            {builtinDirectives.map((directive) => (
              <div key={directive.name}>
                <dt>
                  <code>{directive.usage}</code>
                </dt>
                <dd>{directive.description}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      </div>
    </div>
  );
}

function Player({ pkg }: { pkg: GamePackage }) {
  const options = useMemo(
    () => ({ saves: { persister: memoryPersister() }, customScenes: [kindle] }),
    [],
  );
  const session = useGameSession(pkg, options);
  return <GamePlayer session={session} audio={false} />;
}

const usage = `import { GamePlayer, useGameSession } from "@threeframe/engine";
import { loadGamePackage } from "@threeframe/game";

// A folder with game.json at its root, or a zip of one.
const pkg = await loadGamePackage("/games/last-light.zip");

export default function Example() {
  const session = useGameSession(pkg);
  return <GamePlayer session={session} />;
}`;

const reference: PropDoc[] = [
  {
    name: "session",
    type: "GameSession",
    defaultValue: "required",
    description:
      "The headless playthrough to render; create it with useGameSession(pkg) or new GameSession(pkg, options).",
  },
  {
    name: "dialogue",
    type: "InkDialogue options",
    defaultValue: "manifest.dialogue",
    description:
      "Presentation over the manifest's dialogue options. Speakers default to character names and colors.",
  },
  {
    name: "ui",
    type: "Partial<GameUIComponents>",
    defaultValue: "defaultGameUI",
    description:
      "Replace or remove (null) the Title, PauseMenu, SaveLoad, LevelComplete, GameOver, Credits, Complete, Hud or MenuButton screens.",
  },
  {
    name: "labels",
    type: "Partial<GameLabels>",
    defaultValue: "defaultGameLabels",
    description: "Every string the menus show, for localization.",
  },
  {
    name: "effects",
    type: "Record<string, Component>",
    defaultValue: "{}",
    description: "Renderers for one-shot effects queued by custom directives.",
  },
  {
    name: "audio",
    type: "{ muted?, volume? } | false",
    defaultValue: "{}",
    description: "Music and sound effects from the package.",
  },
  {
    name: "preload",
    type: "boolean",
    defaultValue: "true",
    description: "Load every sprite and image backdrop before the title screen.",
  },
  {
    name: "unstyled",
    type: "boolean",
    defaultValue: "false",
    description: "Drop the built-in stylesheet; style the tf-game-* classes yourself.",
  },
  {
    name: "onWarning",
    type: "(message) => void",
    defaultValue: "console.warn",
    description: "Unknown directives, skins or animations, which are skipped rather than fatal.",
  },
];
