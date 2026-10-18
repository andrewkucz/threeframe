# @threeframe/engine

A complete narrative player built from `@threeframe/core`, `@threeframe/ink`, and `@threeframe/spine`.

See the [root quick start](../../README.md#your-first-game) for a working definition.

## GameDefinition

A stable declaration with `id`, `title`, a compiled-story `Asset` (the Ink factories can compile source during loading), `initialScene`, and a scene dictionary. Optional `characters`, extra `assets`, and design `width`/`height` configure the game.

Scenes contain a `background` texture asset or clear `color`, plus character placements (`id`, `position`, `scale`, `flipX`, optional animation). Character definitions contain the Spine asset, default animation, and optional skin. Two character IDs can share the same Spine asset; their animation state remains independent.

`collectGameAssets` deduplicates the story, every scene background, every character asset, and extra assets. It validates scene/character references. All load before the story starts, with progress and failure reporting. The default player owns and disposes its store; passing a `store` delegates lifetime to the caller.

## NarrativeGame

- `definition`: keep identity stable; replacement reloads the game.
- `dialogue`: live `InkDialogue` presentation props (speed, reveal, theme, speakers, dimensions, placement, padding, callbacks).
- `paused`: pauses both dialogue and character updates.
- `scene`: optional live scene override; omit to follow Ink.
- `characterOverrides`: per-ID live animation, skin, flip, time scale, tint, opacity, visibility, mixing, or pause overrides.
- `configureStory(story)`: bind external functions/observers before the first continuation.
- `onReady(controller)`, `onEvent(event)`, `onProgress(progress)`, `onError(error)`.
- `renderLoading(progress)`, `renderError(error, retry)`: DOM replacement states. Retry evicts failed assets and restarts the session; successful resources stay cached.
- `children`: additional R3F nodes with the same Ink/asset context. These can implement interactive scenes, minigames, or effects.
- `className`, `style`, `controls`: host styling and visibility of accessible HTML controls (true by default). Keyboard input is scoped to the focused player and ignores form fields/key repeats.

Canvas text and choice buttons work with pointer/touch input. Space/Enter advances; 1–9 select Ink choice indices. All available choices also appear as native HTML buttons, including choices beyond 9. The transcript uses a polite live region and announces full pages, avoiding per-character announcements. With `controls={false}`, the same controls are visually hidden for custom interfaces; provide visible keyboard affordances in your host.

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
