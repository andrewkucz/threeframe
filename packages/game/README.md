# @threeframe/game

The headless model of a narrative game: a portable **package** of files described by a manifest, made of **levels** of **scenes**, each scene an Ink script whose **directives** drive a serializable **stage**. A `GameSession` plays it, keeps **state variables** and **progress**, and **saves** to pluggable storage. Nothing here renders; `@threeframe/engine`'s `GamePlayer` draws a session with Three.js and DOM menus, and you can build your own UI on the same session.

## Packages

A package is a folder with a `game.json` manifest at its root. Every path in the manifest is relative to that root, so the same package plays from a web folder, a zip archive, or memory.

```
game.json
characters/ada/ada.json, ada.atlas, ada.png   # Spine exports
backdrops/harbor.webp
levels/one/arrival.ink                         # one script per scene
audio/rain.mp3
```

```ts
import { loadGamePackage, createGameArchive, packageFromFiles } from "@threeframe/game";

await loadGamePackage("/games/harbor/"); // folder URL (or …/game.json)
await loadGamePackage("/games/harbor.zip"); // archive URL (.zip or .tfgame)
await loadGamePackage(fileFromInput); // Blob, ArrayBuffer or Uint8Array of a zip
await loadGamePackage(memorySource({ "game.json": json, ...files })); // any FileSource

const zip = await createGameArchive(source); // portable archive bytes; game.json first
packageFromFiles(manifest, files); // an in-memory package, e.g. an editor's working copy
```

Loading validates the manifest and, for enumerable sources, that every referenced file exists. A zip whose only `game.json` sits in a single wrapping folder works too. `validateManifest(json, files?)` returns every problem (with dotted paths such as `levels.0.scenes.1.backdrop`) without throwing, for editors.

### Manifest

```jsonc
{
  "format": "threeframe.game",
  "formatVersion": 1,
  "id": "harbor", // saves only load into the game with this id
  "title": "Harbor Lights",
  "version": "1.0.0",
  "stage": { "width": 1280, "height": 720, "background": "#0b0d12", "positions": { "door": 420 } },
  "state": {
    "variables": {
      "coins": { "type": "number", "default": 0, "min": 0, "hud": true, "icon": "🪙" },
      "brave": { "type": "boolean", "default": false },
    },
  },
  "characters": {
    "ada": {
      "name": "Ada",
      "color": "#eabd78",
      "sprite": { "skeleton": "characters/ada/ada.json", "atlas": "characters/ada/ada.atlas" },
      "skin": ["body/ada", "clothes/top/shirt1"], // combined in export order
      "outfits": { "gala": ["body/ada", "clothes/top/dress2"] },
      "animation": "idle",
    },
  },
  "backdrops": {
    "harbor": { "type": "image", "image": "backdrops/harbor.webp", "fit": "cover" },
    "dusk": { "type": "gradient", "colors": ["#1d2747", "#e3946b"] },
    "black": { "type": "color", "color": "#000" },
  },
  "levels": [
    {
      "id": "night",
      "title": "The Long Night",
      "completeWhen": "coins >= 10", // optional; otherwise after the last scene
      "scenes": [
        {
          "id": "arrival", // unique across the game
          "script": "levels/night/arrival.ink", // or compiled .json
          "backdrop": "dusk",
          "cast": [{ "id": "ada", "at": "left" }],
          "next": "storm", // optional; defaults to the next scene
          "music": "audio/rain.mp3",
        },
      ],
    },
  ],
  "gameOverWhen": "coins < 0 && !brave",
  "credits": { "title": "Harbor Lights", "sections": [{ "heading": "Story", "lines": ["…"] }] },
  "saves": { "slots": 3, "autosave": true },
  "dialogue": { "preset": "visualNovel", "speed": 40 }, // InkDialogue options, as JSON
}
```

Scenes are `ink` (the default: the script plays from start to end) or `custom` (a minigame; see [Custom scenes](#custom-scenes)). Character ids, backdrop ids and scene ids are identifiers (`[A-Za-z_][\w-]*`).

A scene can end with a named **outcome**, from a script (`>>> end_scene caught`) or a custom scene's code, and the manifest wires each outcome to what happens next:

```jsonc
"outcomes": {
  "won": { "set": { "opened": true }, "next": "cellar" }, // next: any scene in the game
  "lost": { "add": { "trust": -1 }, "flow": "game-over" }, // or end-level / end-game (+ ending)
}
```

Unwired outcomes continue to the scene's usual successor. The latest outcome of each scene is kept in `progress.outcomes` and readable from Ink as `outcome("scene_id")`.

## Scripts and directives

Each scene is an Ink story. Game variables are declared automatically, so scripts read and write them as ordinary Ink variables (`~ coins += 5`, `{coins}`), and `completed("scene_or_level_id")` and `outcome("scene_id")` are available as functions. Raw `.ink` scripts are compiled at load time, with `INCLUDE`s resolved from the package; declarations are appended, so compiler line numbers match the author's text.

Directives change the presentation. They run in two places:

- **Command lines** start with `>>>` and run in story order between passages, never displayed. Add `wait` to a timed directive to hold the story until it finishes.
- **Tags** on a line of dialogue run when that line appears: `Hello. # show ada at=left`. The compact form `# show:ada` works too.

```ink
>>> fade in duration=1.5 wait
>>> show ada from=left at=center
Hello? # speaker:ada
>>> anim ada wave loop=false then=idle
>>> wear ada clothes/top/raincoat
* [Run] >>> shake strength=16
```

Grammar: `name positional… key=value… flag…`; quote values with spaces. Ink starts a tag at `#`, so write colors as `ffcc00`, a CSS name, or `\#ffcc00`.

| Directive                                                                            | Does                                                |
| ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `backdrop <id\|none> [duration] [wait]`                                              | Cross-fades the backdrop (alias `bg`)               |
| `show <char> [at] [from=edge] [fade] [anim] [outfit] [skin=a+b] [flip] [wait]`       | Brings a character on stage, optionally sliding in  |
| `hide <char> [to=edge] [fade] [wait]`                                                | Takes a character off                               |
| `move <char> <at> [duration] [ease] [wait]`                                          | Moves to a named mark or X                          |
| `anim <char> <name> [loop=false] [then=<name>]`                                      | Plays an animation (aliases `animation`, `play`)    |
| `overlay <char> <anim…\|none>`                                                       | Blends looping animations on upper tracks           |
| `wear` / `remove` / `outfit <char> …`                                                | Mix-and-match skins by editor folder; named outfits |
| `attach <char> <slot> <name\|none\|reset>`                                           | Slot attachment override                            |
| `face <char> left\|right\|flip`, `tint <char> <color>`                               | Facing and color                                    |
| `camera [zoom] [x] [y] [focus=char] [duration]`, `camera reset`                      | Pans and zooms                                      |
| `shake`, `flash [color]`, `fade out\|in [color]`, `vignette <0–1>`                   | Screen effects                                      |
| `weather rain\|snow\|dust\|petals\|fireflies\|embers\|none [intensity] [wind]`       | Ambient particles                                   |
| `dialogue hide\|show`, `wait <seconds>`                                              | Pacing                                              |
| `set <var> <value>`, `add <var> <n>`                                                 | State (Ink assignments work too)                    |
| `goto <scene>`, `end_scene [outcome]`, `end_level`, `game_over`, `end_game [ending]` | Flow                                                |
| `music <file>\|stop [volume] [fade]`, `sound <file> [volume]`                        | Audio from the package                              |

Positions are named marks (`farLeft`, `left`, `center`, `right`, `farRight`, plus the manifest's own) or X coordinates. Skins are mix-and-match by folder: wearing `clothes/top/shirt2` replaces any other `clothes/top/…`; `remove ada clothes/top` removes the folder.

### Custom directives

```ts
const session = new GameSession(pkg, {
  directives: [
    {
      name: "confetti",
      usage: "confetti [count=80]",
      description: "Bursts confetti.",
      run: (directive, context) =>
        context.effect("confetti", { count: directiveReader(directive).number("count", 80) }),
      check: (directive, manifest) => [], // static problems for editors
    },
  ],
});
```

A directive's `run` gets a context to update the stage, queue one-shot effects (renderers pick them up by type), read and set variables, `wait`, and change flow. Returning a promise from a command line holds the story until it settles. Definitions with an existing name replace the built-in.

`lintScript(source, { manifest, directives })` reports unknown directives, characters, backdrops, positions, scenes and variables with line and column, for editors.

## Custom scenes

A `custom` scene runs a component from the game's code instead of playing a script: a minigame with its own interaction and logic. It still reads and writes game state, uses the stage (backdrop, cast, effects), and can stop for full conversations, choices included, from knots of its own script.

```jsonc
{
  "id": "cellar-lock",
  "kind": "custom",
  "component": "lockpick", // a registered custom scene type
  "props": { "pins": 5 }, // checked against the type's prop schema
  "script": "levels/night/cellar-lock.ink", // optional: knots the component plays
  "backdrop": "cellar",
  "cast": [{ "id": "ada", "at": "left" }],
  "outcomes": { "won": { "next": "cellar" }, "lost": { "next": "caught" } },
}
```

The session needs only the headless part of a type, a `CustomSceneType`: its props schema (editors build forms from it), the outcomes it reports, the Ink functions it provides to its script (declared automatically, like game variables), and the knots it plays. Renderers add what they draw; `@threeframe/engine`'s `defineCustomScene` adds React components.

```ts
const session = new GameSession(pkg, { customScenes: [lockpick] });
```

While a custom scene runs, `snapshot.custom.handle` is its API, one per run of the scene and inert once it ends:

```ts
const { handle } = session.getSnapshot().custom!;
handle.props; // manifest props over the schema's defaults
await handle.dialogue("hint"); // plays a knot in the dialogue box; resolves when it runs out
await handle.say("ada", ["Careful.", "Slowly…"]); // lines without a script
handle.provide("reveal_pin", () => reveal()); // implements an external the script calls
handle.directive("shake strength=8"); // any directive
handle.setVariable("picks", 2); // game state, clamped, mirrored into Ink
handle.setState("lock", lock, { save: true }); // scene state; saved keys go into save files
handle.complete("won", { time: 12 }); // ends the scene with an outcome
```

Conversations queue and play one at a time (`snapshot.custom.talk` is the one on screen). A knot ends the conversation when it runs out (`-> DONE`), not the scene; a knot can still end the scene with `>>> end_scene <outcome>`. `checkCustomScene(scene, type, manifest)` reports unknown components, invalid props and outcomes the type never reports, for editors.

Saving inside a custom scene restarts it on load, unless it keeps saved state (`setState(key, value, { save: true })`); then the save restores that state and the stage, and `handle.restored` is true. A scene whose component isn't registered still plays: the session warns, and `GamePlayer` shows a stand-in offering each outcome.

## Sessions

```ts
const session = new GameSession(pkg, {
  saves: { persister: localStoragePersister() }, // default; or a SaveStore, or false
  autosave: { sceneStart: true, choice: true, levelComplete: true },
  externals: { roll: (sides: number) => 1 + Math.floor(Math.random() * sides) }, // Ink functions
});
session.subscribe(() => render(session.getSnapshot()));
session.onEvent((event) => log(event)); // phase, scene-start, variable, directive, saved, warning…

await session.newGame(); // or continueGame(), loadSlot("1"), load(saveFile), playScene("storm")
session.getSnapshot().controller?.advance(); // the scene's InkController
session.setVariable("coins", 10); // clamped, mirrored into Ink
```

Phases: `title` → `playing` → `level-complete` (`proceed()`) → … → `credits` (`proceed()`) → `complete`; `game-over` offers `retryLevel()` (variables as the level began). `toTitle()`, `setPaused()` (also pauses `wait`s) and `setSkipping()` (resolves waits instantly) cover menus and fast-forward. Unknown directives and failed ones are reported as `warning` events and skipped, so a script typo never stops play; a script that fails to compile sets `snapshot.error`.

### Saves

`SaveStore` keeps manual slots plus one autosave slot over a `Persister` — `{ get, set, remove }`, sync or async — defaulting to `localStorage` (`memoryPersister()` for tests). `list()`, `read`, `write`, `delete` and `latest()`; subscribe for menus.

A `SaveFile` is portable JSON (`format: "threeframe.save"`, `version: 1`): game id and version, timestamp, label, phase, progress (level, scene, completed scenes and levels, ending, playtime, variables at level start), variables, and optionally the exact scene state (Ink state and stage). If the scene's script changed since, the save resumes at the start of that scene instead. `serializeSave`, `saveFileName` and `parseSave(text, manifest)` export and import saves as files.
