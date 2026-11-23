# @threeframe/engine

Players built from `@threeframe/core`, `@threeframe/ink`, `@threeframe/spine` and `@threeframe/game`:

- **`GamePlayer`** renders a `@threeframe/game` session: a whole game package with levels, scenes, directives, state, menus and saves. Use it for full games.
- **`NarrativeGame`** plays a single Ink story with a `GameDefinition` (below), for simpler embeds.

## GamePlayer

```tsx
import { GamePlayer, useGameSession } from "@threeframe/engine";
import { loadGamePackage } from "@threeframe/game";

const pkg = await loadGamePackage("/games/harbor.zip");

function Game() {
  const session = useGameSession(pkg); // created once per package, disposed on unmount
  return <GamePlayer session={session} dialogue={{ speed: 40 }} />;
}
```

The player preloads every character sprite and image backdrop in the package (with a progress screen), then shows the title screen. It renders the session's stage, animating every change toward the target state:

- Backdrops cross-fade (images, solid colors and gradients).
- Characters fade or slide in and out, move, tint, and animate. Skins, attachments and animations the sprite doesn't have are skipped with a warning, so a typo never crashes the game.
- Camera pan, zoom and shake; full-screen fades and flashes; a vignette; GPU particle weather (`rain`, `snow`, `dust`, `petals`, `fireflies`, `embers`, or your own via `weatherPresets`).
- Music and sound effects play from the package.

Dialogue uses `InkDialogue` with the manifest's `dialogue` options, then the `dialogue` prop; speakers default to the characters' names and colors.

The DOM layer has a title screen (continue, new game, load, credits), a HUD of variables marked `hud`, a menu button and Escape menu (resume, save, load, quit), save/load slots (autosave, overwrite, delete, export and import save files), level-complete cards, game over (retry level, load, title), a credits roll and an end screen. Space/Enter advance and 1–9 choose.

Customize it with:

- `ui`: replace any screen (`Title`, `PauseMenu`, `SaveLoad`, `LevelComplete`, `GameOver`, `Credits`, `Complete`, `Hud`, `MenuButton`), or pass `null` to drop one. Each screen gets `{ session, snapshot, labels, menu, openMenu, onError }`; the defaults are exported.
- `labels`: every string, for localization (`defaultGameLabels`).
- CSS variables on `.tf-game` (`--tf-game-accent`, `-bg`, `-fg`, `-muted`, `-card`, `-border`, `-font`, `-title-font`); `unstyled` drops the built-in stylesheet so your CSS owns the `tf-game-*` classes.
- `effects`: renderers for custom one-shot effect types queued by custom directives. Each gets `{ effect, width, height, done }`.
- `children` (R3F nodes inside the stage camera), `overlay` (DOM nodes over it), `audio` (`{ muted, volume }` or `false`), `keyboard`, `paused`, `store`, `onWarning`.

For a different interface entirely, use the pieces: `StageView` (stage renderer, inside a `SceneCanvas`; `StageActors` exposes its live sprites), `CharacterSprite`, `CustomSceneView` and `CustomSceneOverlay`, `Weather`, `useGameSnapshot(session)`, `useSaveSlots(store)`, `useStageAudio(pkg, stage)`, `gameAssets(pkg)` and `Tween`.

See the [root quick start](../../README.md#your-first-game) for a working definition.

### Custom scenes

`defineCustomScene` adds what a custom scene draws to its headless type (see `@threeframe/game`'s custom scenes): `Component` renders in the canvas inside the stage camera (above the cast; shake and zoom apply), `Overlay` renders DOM over it. Register definitions with the session; the player renders whichever scene is running.

```tsx
const lockpick = defineCustomScene<{ pins: number }>({
  id: "lockpick",
  props: { pins: { type: "number", default: 4, min: 1, max: 8 } },
  outcomes: ["won", "lost"],
  externals: ["reveal_pin()"],
  knots: ["intro", "hint"],
  Component({ props, scene }) {
    const [picks, setPicks] = scene.useVariable<number>("picks"); // game state, reactive
    const [lock, setLock] = scene.useSaved("lock", () => newLock(props.pins)); // saved and shared
    const ada = scene.useCharacter("ada"); // directives plus her live sprite: ada.actor()
    scene.useExternal("reveal_pin", () => setLock(reveal(lock)));
    useEffect(() => void scene.dialogue("intro"), []);
    async function fail() {
      setPicks(picks - 1);
      ada.play("gasp", { loop: false });
      scene.directive("shake", [], { strength: 8 });
      if (picks <= 1) scene.complete("lost");
      else await scene.dialogue("hint"); // a full conversation, choices included
    }
    return <LockMeshes lock={lock} paused={scene.paused || scene.talking} onFail={fail} />;
  },
  Overlay: ({ scene }) => <button onClick={() => scene.complete("lost")}>Give up</button>,
});

const session = useGameSession(pkg, { customScenes: [lockpick] });
```

Both parts get `{ props, scene }`. The scene context has `paused` (menus) and `talking` (a conversation has the input), `dialogue`, `say`, `directive`, `wait`, `complete`, variables (`useVariable`, `getVariable`, `setVariable`), scene state shared by both parts (`useSceneState`, or `useSaved` to include it in saves; `restored` says the scene resumed from one), `useExternal`, `useCharacter`, `asset.texture/json/text(path)` descriptors for `useAsset`, and the stage size. Nested components reach it with `useCustomScene()`; `<SceneCharacter id x y animation />` draws a manifest character the scene positions itself.

Keyboard: Space/Enter and number keys go to a conversation while one is on screen, and otherwise reach the scene. The DOM overlay ignores pointer events except on buttons, inputs, links and `[data-interactive]`, so the canvas below stays clickable. A component that throws shows the error screen, whose Retry restarts the scene.

## GameDefinition

A stable declaration with `id`, `title`, a compiled-story `Asset` (the Ink factories can compile source during loading), `initialScene`, and a scene dictionary. Optional `characters`, extra `assets`, and design `width`/`height` configure the game.

Scenes contain a `background` texture asset, `backdrop` options (any `Backdrop` prop: `fit`, `scale`, `align`, `offset`, `tint`, `opacity`, flips), a clear `color`, and character placements. `backgroundColor` and `characterDefaults` (`position`, `scale`) on the definition fill in what scenes and placements omit.

Character definitions and placements both accept every SpineSprite look prop (`animation`, `loop`, `skin` or skins, `tint`, `opacity`, `flipX`/`flipY`, `timeScale`, `mixDuration`, `mixes`, `tracks`, `queue`, `material`, `renderOrder`); placements add `position`, `scale`, and `rotation`. Layering, lowest first: character definition, scene placement, Ink tags, live `characterOverrides`. Two character IDs can share the same Spine asset; their animation state remains independent.

`collectGameAssets` deduplicates the story, every scene background, every character asset, and extra assets. It validates scene/character references. All load before the story starts, with progress and failure reporting. The default player owns and disposes its store; passing a `store` delegates lifetime to the caller.

## NarrativeGame

- `definition`: keep identity stable; replacement reloads the game.
- `dialogue`: live `InkDialogue` presentation props, including `preset` (a built-in name or custom object), playback, geometry, `theme`, part props, `speakers`, `labels`, and callbacks. Layers, lowest first: layout scaled to the definition's design size, then the preset, then these props, so a preset's geometry wins over the scaled defaults. See the [ink README](../ink/README.md#presets).
- `paused`: pauses both dialogue and character updates.
- `scene`: optional live scene override; omit to follow Ink.
- `characterOverrides`: per-ID live animation, skin, flip, time scale, tint, opacity, visibility, mixing, or pause overrides.
- `configureStory(story)`: bind external functions/observers before the first continuation.
- `onReady(controller)`, `onEvent(event)`, `onProgress(progress)`, `onError(error)`.
- `renderLoading(progress)`, `renderError(error, retry)`: DOM replacement states. Retry evicts failed assets and restarts the session; successful resources stay cached.
- `children`: additional R3F nodes with the same Ink/asset context. These can implement interactive scenes, minigames, or effects.
- `className`, `style`, `controls`: host styling and visibility of accessible HTML controls (true by default).
- `labels`: every DOM string (`continue`, `reveal`, `printing`, `ended`, `playAgain`, `paused`, `keyboardHint`, `narrator`, `choice(choice, n)`, `loading`, `loadingProgress(loaded, total)`, `loadingProgressLabel`, `error`, `retry`, `webglRequired`). Defaults are exported as `defaultNarrativeGameLabels`.
- `classNames`, `styles`: per-part class names and inline styles for `root`, `canvas`, `controls`, `button`, `hint`, `status`, `loading`, and `error`. `unstyled` drops the built-in inline styles so your classes fully own the look.
- `keyboard`: `{ advance?: string[]; choiceKeys?: boolean }` (`["Space", "Enter"]`, true) or `false`. Input is scoped to the focused player and ignores form fields and key repeats.

Canvas text and choice buttons work with pointer/touch input. By default Space/Enter advances and 1–9 select Ink choice indices. All available choices also appear as native HTML buttons, including choices beyond 9. The transcript uses a polite live region and announces full pages, avoiding per-character announcements. With `controls={false}`, the same controls are visually hidden for custom interfaces; provide visible keyboard affordances in your host.

The ref exposes:

```ts
player.current?.advance();
player.current?.choose(0); // obeys reveal/pagination/pause gating
player.current?.restart();
const save = player.current!.save();
player.current!.restore(save);
player.current?.controller?.setVariable("courage", 5);
```

Save/restore throw if the game is not ready or the save is incompatible. Persist the returned JSON object using your preferred storage. Saves include Ink runtime/display state, the scene and character presentation, and dialogue page/reveal progress. Live prop overrides and arbitrary child-component state are not serialized. Applications should version their own minigame/save extensions alongside `GameSave`.

## Tag-driven presentation

```ink
A door opens. # speaker:ada # scene:hall # animation:ada:walk
There you are. # speaker:keeper # show:keeper
The keeper disappears. # hide:keeper
```

`applyStageTags` is a pure reducer for these conventions. It throws on undefined scene/character references. Unrecognized tags remain available to your event handler for audio, effects, analytics, and other extensions. `speaker` is interpreted by the Ink layer, not the stage reducer. Speaker IDs and actor IDs may differ.

`GameStage` exposes rendering independently of the full player: pass `definition`, `state: StageState`, optional pause/scene/character overrides, and put it inside a Canvas + AssetProvider. `initialStage(definition)` creates the initial state. The full player handles these pieces for ordinary narrative games.
