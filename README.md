# Threeframe

A composable 2D narrative game toolkit for React Three Fiber, Ink, and Spine. The demo is an interactive documentation app with live examples for NarrativeGame, DialogueBox / InkStory, SpineSprite, and scenes / assets.

## Run the playground

```sh
vp install
vp run dev
```

Open http://localhost:5173. Click dialogue to reveal/advance, or focus the player and use Space/Enter. Number keys choose an option after the passage finishes. Controls update the preview and copyable JSX together. Each page includes setup files and a prop reference with types, defaults, and descriptions. Ink editors, event logs, and loading experiments sit in expandable panels. Save/restore uses this browser's local storage.

```sh
vp check             # formatting, lint, and type checking
vp test              # package and example-generation regression tests
vp run build         # all four libraries (ESM + declarations), then the demo
vp run ready         # all of the above
```

Node 22.18+ and Vite+ are required. `vp run dev` invokes the workspace script; `vp dev` is the separate built-in command. Workspace development resolves each package's source through the `development` export condition. Normal package imports resolve built ESM. Source is included in package artifacts so both conditions work outside the workspace.

## Packages

| Package                                           | Responsibility                                               | Main exports                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [`@threeframe/core`](packages/core/README.md)     | Asset ownership, loading, orthographic scenes, measured text | `AssetStore`, `AssetProvider`, `SceneCanvas`, `Camera2D`, `Backdrop`, `CanvasPanel`    |
| [`@threeframe/ink`](packages/ink/README.md)       | Ink runtime, state, native scene dialogue                    | `InkStory`, `InkController`, `InkProvider`, `InkDialogue`, `DialogueBox`, `compileInk` |
| [`@threeframe/spine`](packages/spine/README.md)   | Spine 4.3 assets and independent animated sprites            | `spineAsset`, `SpineSprite`                                                            |
| [`@threeframe/engine`](packages/engine/README.md) | Complete game loading and playback                           | `NarrativeGame`, `GameStage`, `GameDefinition`                                         |

The dependency direction is `core → ink/spine → engine`. Each layer can be used independently. React 19, R3F 9, and Three 0.184 are the shared peers. Spine is pinned to 4.3.13; its declared Three peer range excludes 0.185 and newer.

## Your first game

The package names below are local workspace packages. They are not published to npm by this repository.

```tsx
import { useRef } from "react";
import { textureAsset, fontAsset } from "@threeframe/core";
import { inkAsset } from "@threeframe/ink";
import { spineAsset } from "@threeframe/spine";
import { NarrativeGame, type GameDefinition, type NarrativeGameHandle } from "@threeframe/engine";

// Stable declarations outside render; each asset key is unique within a game store.
const hero = spineAsset({
  skeleton: "/hero/hero.json",
  atlas: "/hero/hero.atlas",
});
const game: GameDefinition = {
  id: "my-story",
  title: "A new beginning",
  story: inkAsset("/story.ink"), // or inkAsset('/story.json', 'json')
  assets: [fontAsset("StoryFont", "/fonts/story.ttf")],
  initialScene: "garden",
  characters: { hero: { asset: hero, animation: "idle" } },
  scenes: {
    garden: {
      background: textureAsset("/garden.webp"),
      characters: [{ id: "hero", position: [0, -190, 0], scale: 0.6 }],
    },
  },
};

export function MyGame() {
  const player = useRef<NarrativeGameHandle>(null);
  return (
    <NarrativeGame
      ref={player}
      definition={game}
      dialogue={{
        theme: { fontFamily: "StoryFont", fontSize: 25 },
        speakers: { hero: { name: "Ada", color: "#eabd78" } },
        speed: 36,
        reveal: "character",
      }}
      onEvent={(event) => console.log(event)}
    />
  );
}
```

```ink
VAR courage = 0
The garden is quiet. # speaker:hero # scene:garden # animation:hero:idle
* [Take a step forward.]
    ~ courage += 1
    A new adventure begins. # speaker:hero # animation:hero:walk
    -> END
* [Stay a little longer.]
    Some things are worth waiting for. # speaker:hero
    -> END
```

Keep the `GameDefinition` identity stable. Replacing it intentionally reloads/restarts the game. Use `paused`, `dialogue`, `scene`, and `characterOverrides` for live adjustments that preserve state. Changed `source` props on `InkStory` compile and restart only that story.

## Rendering and composition

The default design space is **1280 × 720**, centered at `(0, 0)`, with positive Y up and positive Z toward the camera. `Camera2D` adapts the orthographic frustum to the container; the scene uses design units independent of device pixels. The complete player maintains its design aspect ratio.

Dialogue and choice buttons are native Three meshes with canvas textures. Font metrics determine wrapping and pagination, and Unicode graphemes stay intact during reveal. Text updates are isolated inside the dialogue component; Spine updates its own mesh in `useFrame` without React state changes on every animation frame. Assets are shared; skeletons, animation state, and mesh geometry are per character. Canvas text redraws reuse the same backing surface.

`NarrativeGame` children are **R3F scene nodes**, under the asset and Ink providers. Add interactive meshes, effects, or custom stage components there. Use `useInkController()` to read/set variables or jump to a knot when an interaction finishes. An imperative player ref exposes advance, choose, restart, save, and restore. Normal props drive visual configuration.

## Story state and supported Ink features

The runtime is inkjs, including choices, knots/stitches/diverts, conditions, variables, lists, functions, tunnels, threads, visit counts, and external functions. `InkController.story` exposes the complete runtime for advanced flows and APIs; call `controller.refresh()` after directly mutating it. Use `configureStory` to bind external functions **before** playback begins.

Engine conventions are deliberately small: `speaker:id`, `scene:id`, `animation:character:animationName`, `show:character`, and `hide:character`. Other tags reach the event callback untouched. These are presentation conventions, not additions to the Ink language. Scene/character identifiers must exist in the definition. `show`/`hide` affect a character placed in the current scene.

Engine saves contain versioned Ink state, the displayed passage, scene/character state, and page/reveal position. Saves reject mismatched stories/games. Presentation props such as fonts and inspector overrides are application preferences and are not saved. Preserve layout/font settings when restoring an exact page position.

## Current scope

This is a browser/WebGL narrative engine. Audio, rich inline markup, localization catalogs, physics, arbitrary scene-transition timelines, and editor tooling are extension points. Standard text layout is left aligned; applications needing advanced bidirectional typography should supply a custom dialogue renderer. Browser font loading is supported; raw Ink `INCLUDE` resolution needs compiler options or precompilation. The default player provides keyboard controls and a screen-reader transcript because canvas text alone is not accessible. Standalone scene components need equivalent controls from their host.

Use compiled Ink JSON in shipped games to avoid loading the authoring compiler. The compiler and optional demo workshops load in separate chunks. The Three renderer, Spine runtime, and Ink runtime still make the demo a substantial download; no claim is made that this is a minimal mobile bundle.

## References and assets

- [React Three Fiber documentation](https://r3f.docs.pmnd.rs/getting-started/introduction)
- [Three.js documentation](https://threejs.org/docs/)
- [Ink writing guide](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md)
- [InkJS](https://github.com/y-lohse/inkjs)
- [Spine runtimes](https://github.com/EsotericSoftware/spine-runtimes)
- [Third-party asset notices](THIRD_PARTY_NOTICES.md)

The demo's Spineboy JSON, binary, atlas, and texture were copied from `example/spineboy-4.3/export`. The earlier `/Users/andrew/dev/r3f2dge` implementation informed the review, but these packages have their own APIs and loaders. The demo story and SVG scenery are local, editable assets.
