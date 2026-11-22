# @threeframe/ink

Ink runtime orchestration and native R3F dialogue. All scene components go inside a Canvas.

## Raw Ink in a scene

```tsx
<InkStory
  source={`Hello, traveler. # speaker:ada
* [Hello!]
  A friendship begins.
  -> END`}
  speed={32}
  speakers={{ ada: { name: "Ada", color: "#a9d6cb" } }}
  onReady={(controller) => {
    /* retain controller for save/restore or variables */
  }}
  onError={(error) => console.error(error)}
/>
```

`source` changes compile/restart. `format="json"` accepts precompiled JSON text and avoids the compiler. `fallback` must be a Three scene node. Compilation failures call `onError` or throw to an error boundary if it is absent. The ref exposes dialogue controls; `onReady` exposes the story controller. `configureStory(story)` runs before playback. `onEvent` observes line, tags, choice, reset, restore, and end events.

## Bring your own state

```tsx
const controller = new InkController(await compileInk(source), {
  configure: (story) => story.BindExternalFunction("award", (amount) => award(amount)),
});

<InkProvider controller={controller}>
  <InkDialogue />
</InkProvider>;
```

`InkProvider` starts once by default (`autoStart={false}` disables this). `InkDialogue` can also take a controller prop. `useInk()` reads the stable external-store snapshot. `useInkController()` returns the controller. These hooks also accept an explicit controller.

Controller methods:

| Method                                           | Behavior                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `start()`                                        | Start if idle; repeated calls do not advance.                       |
| `advance()`                                      | Continue to one nonempty passage or decision. Never bypass choices. |
| `choose(index)`                                  | Select a currently available Ink choice, then continue.             |
| `jump(path)` / `restart()`                       | Jump to a knot/stitch or reset runtime state.                       |
| `getVariable(name)` / `setVariable(name, value)` | Read/write Ink values, including lists.                             |
| `observeVariable(name, callback)`                | Returns an unsubscribe function.                                    |
| `bindExternal(name, callback, lookaheadSafe?)`   | Bind a host function; returns unbind.                               |
| `evaluate(name, args?)`                          | Evaluate an Ink function.                                           |
| `save()` / `restore(save)`                       | Preserve the runtime and currently displayed passage.               |
| `onEvent(callback)` / `subscribe(callback)`      | Events or snapshot subscription, with unsubscribe.                  |
| `refresh()`                                      | Notify views after direct changes through `.story`.                 |

`advance()` on the final passage acknowledges the end on the following click. Choices on that passage remain available, while `InkDialogue` waits until reveal and pagination finish before exposing them. `getSnapshot()` includes text, speaker, tags, choices, status, lineId, and revision. A `speaker:` tag applies to its passage; untagged lines use the narrator label. Raw tags and choice tags are preserved.

`save()` returns a versioned object containing Ink JSON and display state. The compiled story fingerprint rejects incompatible saves. The controller does not own a renderer's page/reveal state; `NarrativeGame` additionally saves that, while standalone callers can use the dialogue ref's `save()` and `initialPlayback` on remount.

`compileInk(source, compilerOptions?)` dynamically imports the Ink compiler. For `INCLUDE` files, supply an inkjs `CompilerOptions` with a file handler (such as `JsonFileHandler`), or compile ahead of time. `inkAsset(url, 'ink' | 'json')` and `inkSourceAsset(key, source, options?)` integrate with the core asset store. The latter keys by both name and source, so source edits do not return stale compiled content.

## Dialogue configuration

`DialogueBox` is the renderer without Ink: pass `text`, `speaker`, optional `choices`, `onAdvance`, and `onChoose`. `InkStory` and `InkDialogue` accept all of its presentation props.

### Presets

`preset` takes a built-in name or your own preset object, and sits beneath every other prop. Explicit props deep-merge over it, so any part of a preset can be tweaked. `InkStory`, `InkDialogue`, and `NarrativeGame`'s `dialogue` prop accept the same `preset`.

```tsx
<DialogueBox preset="noir" text="Rain again." />
<DialogueBox preset="noir" theme={{ accentColor: "#ffd166" }} nameplate={false} text="…" />
<NarrativeGame definition={game} dialogue={{ preset: "visualNovel", speed: 24 }} />
```

Built-ins (`dialoguePresets`): `threeframe` (the package defaults), `parchment`, `visualNovel`, `terminal`, `subtitles`, `storybook`, `noir`, `topHud`, `chatBubble`, `royalFantasy`.

Presets are plain JSON data (choice markers use named formats), so you can store them, share them, or build one in the docs site's Presets panel and paste the export. Helpers:

```ts
import { defineDialoguePreset, dialoguePresets, mergeDialogueOptions } from "@threeframe/ink";

// Type-checked custom preset.
export const brand = defineDialoguePreset({
  theme: { fontFamily: "Inter", accentColor: "#7c9cff", radius: 10 },
  nameplate: { placement: "border" },
  labels: { continue: "Next" },
});

// Extend a built-in.
export const rainyNoir = mergeDialogueOptions(dialoguePresets.noir, {
  theme: { accentColor: "#6fb1ff" },
});
```

`mergeDialogueOptions(...layers)` merges nested part objects key by key. Arrays (`position`, `padding`, offsets), functions, and `false` replace earlier values; an object after `false` turns a hidden part back on; `undefined` never erases. `resolveDialoguePreset(nameOrObject)` returns the preset object and throws on unknown names.

### Option layers

Props are organized in four layers. Each layer only overrides what you set, so partial objects are always safe:

1. **Theme tokens** (`theme`) — shared fonts, colors, border, and radius. Every part reads its defaults from these, so `theme={{ accentColor: "#9cd" }}` restyles the nameplate, choice markers, hover borders, and pager together.
2. **Parts** (`panel`, `body`, `nameplate`, `prompt`, `pageCounter`, `choiceMenu`) — one prop per visual element. Set a part to `false` to remove it.
3. **Speakers** (`speakers[id]`) — per-speaker `name`, accent `color`, and `nameplate`, `body`, or `panel` overrides, applied above the part props.
4. **Labels** (`labels`) — every drawn string in one object, ready for localization.

```tsx
<DialogueBox
  text="The lantern flickers."
  speaker="keeper"
  choices={choices}
  width={900}
  padding={[24, 32]}
  theme={{ fontFamily: "Lora", accentColor: "#99d2c4", radius: 6 }}
  nameplate={{ placement: "border", align: "center", surface: { radius: 99 } }}
  body={{ textAlign: "center" }}
  pageCounter={false}
  choiceMenu={{ columns: 2, width: 720, marker: false, hover: { color: "#fff" } }}
  speakers={{ keeper: { name: "The keeper", color: "#99d2c4", body: { fontStyle: "italic" } } }}
  labels={{ continue: "Tap to continue", choose: "What will you do?" }}
/>
```

### Content, playback, and geometry

| Prop              | Default / meaning                                                            |
| ----------------- | ---------------------------------------------------------------------------- |
| `text`, `speaker` | Passage text; key into `speakers` (`null` shows `labels.narrator`)           |
| `choices`         | `[]`; shown once the final page finishes printing                            |
| `reveal`          | `character`; also `word`, `line` (wrapped visual lines), `instant`           |
| `speed`           | 36 reveal units/second; 0 means instant                                      |
| `allowFastSkip`   | true; click during reveal shows this page, not the next one                  |
| `paused`          | false; pauses printing and ignores player actions                            |
| `initialPlayback` | Page and UTF-16 reveal offset when the component mounts                      |
| `position`        | `[0, -220, 100]`; panel center. Its Y also picks the `auto` choice placement |
| `width`, `height` | 1120, 210 design units                                                       |
| `padding`         | 28; also `[vertical, horizontal]` or `[top, right, bottom, left]`            |
| `resolution`      | 2 canvas pixels per design unit for every dialogue texture                   |
| `onDisplayChange` | Fires for page/printing/choice changes, not every printed character          |
| `onPrintComplete` | Fires once per completed page                                                |

### Theme tokens (`theme`)

| Token                                                | Default                                      | Used by                                                                                    |
| ---------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `fontFamily`, `fontSize`, `lineHeight`               | `Georgia, serif`, 25, 1.5                    | Body; choices use the family at 85% size                                                   |
| `uiFontFamily`                                       | `system-ui, sans-serif`                      | Nameplate, prompt, page counter, markers, pager                                            |
| `textColor`, `mutedColor`                            | `#f3eee2`, `#abb7be`                         | Body and choices; prompt and page counter                                                  |
| `accentColor`                                        | `#eabd78`                                    | Nameplate and badge border (unless the speaker sets `color`), markers, hover border, pager |
| `background`, `borderColor`, `borderWidth`, `radius` | `rgba(15, 24, 33, 0.96)`, `#50606b`, 1.5, 14 | Panel; badge and pager share the background; choices and badges cap the radius at 10 and 8 |
| `choiceBackground`, `choiceHoverBackground`          | `#182d3a`, `#2b4756`                         | Choice fills                                                                               |

### Parts

All text-bearing parts accept the same `DialogueTextStyle`: `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `color`, `lineHeight`, `letterSpacing`, `textTransform`. Surfaces accept `DialogueSurfaceStyle`: `background`, `borderColor`, `borderWidth` (0 removes it), `radius`.

| Part          | Options (defaults)                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `panel`       | Surface style. `false` draws no surface; the area stays clickable.                                                                                                                                                                         |
| `body`        | Text style + `textAlign` (`start`). Lines align by their full width, so centered text does not drift while printing.                                                                                                                       |
| `nameplate`   | `placement`: `inside` (text row), `border` (badge on the top edge), `outside` (badge above, `gap` away); `align` (`start`); `gap` (10); `offset` (`[0, 0]`); badge `surface` and `padding` (`[6, 14]`); text style (15px, 600, uppercase). |
| `prompt`      | The reveal / continue / choose / paused hint: `align` (`start`), `gap` above the footer (8), text style (12px, uppercase, muted).                                                                                                          |
| `pageCounter` | Same as `prompt` with `align` `end`, plus `showWhenSinglePage` (false). Footer height is reserved while either footer part is enabled.                                                                                                     |
| `choiceMenu`  | See below. `false` hides the rendered menu; `ref.choose()` and host UI still work.                                                                                                                                                         |

`choiceMenu` options:

| Option                              | Default                     | Meaning                                                                                                          |
| ----------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `placement`                         | `auto`                      | `auto` stacks above a panel in the lower half of the scene and below one in the upper half; or `above` / `below` |
| `align`, `width`, `offset`          | `center`, `panel`, `[0, 0]` | Menu position and width relative to the panel                                                                    |
| `margin`, `gap`                     | 12, 8                       | Space from the panel (plus any nameplate badge in the way); space between choices, rows, and the pager           |
| `columns`, `perPage`                | 1, 3                        | Grid columns (rows share the tallest item's height); choices per page                                            |
| `padding`, `minHeight`, `textAlign` | `[12, 30]`, 50, `start`     | Per-choice box; wrapped labels grow past `minHeight`                                                             |
| `surface`                           | choice tokens               | Idle choice surface                                                                                              |
| `hover`                             | hover tokens                | `{ color, markerColor, surface }`; hover never changes metrics, so the layout cannot shift                       |
| `marker`                            | `{}`                        | Text style, `gap` (16), fixed `width` (defaults to the widest marker), or `false`                                |
| `pager`                             | `{}`                        | Text style, `height` (36), `surface`, or `false`. Click its left half for previous, right half for next          |
| text style                          | body family, 85%            | Styles the choice labels themselves                                                                              |

Choices always read top to bottom regardless of placement.

### Labels (`labels`)

| Label                                                            | Default                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `narrator`                                                       | `"Narrator"`; `null` hides the nameplate for narration                                                                                                                                                                                                                |
| `reveal`, `printing`, `nextPage`, `continue`, `choose`, `paused` | Prompt per state: printing with or without fast skip (`""` for both), more pages follow (`"Click to continue  ›"`), passage done (`"Click to continue  ›"`), choices open (`"Make your choice"`), paused (`"Paused"`). An empty string hides the prompt in that state |
| `page(page, count)`                                              | `` `${page} / ${count}` `` (1-based)                                                                                                                                                                                                                                  |
| `choiceMarker`                                                   | `"padded"` (01, 02); also `"numbered"` (1.), `"letters"` (A, B … AA), `"roman"` (I, II), `"bullets"` (◆), or `(n, choice) => string`                                                                                                                                  |
| `choicePage(page, count)`, `previousChoices`, `nextChoices`      | `` `Choices ${page} / ${count}` ``, `"‹ Previous"`, `"Next ›"`                                                                                                                                                                                                        |

`textTransform` applies after labels are resolved, so the default uppercase prompt accepts naturally cased labels.

### Layout behavior

Long passages wrap by measured font width and split into pages without discarding trailing text. Long unbroken words split at grapheme boundaries. Blank paragraphs are preserved. Changing size, padding, or any body font metric restarts the current passage at its first page so reflow cannot silently skip text. The body area is what remains after padding, an `inside` nameplate row, and the footer row. Keep enough room around a panel for choices; extremely long individual choice labels may need a taller layout or a custom renderer. The player also exposes all choices as accessible DOM buttons.

The pure helpers behind the component (`resolveDialogueStyle`, `layoutPanel`, `layoutChoiceMenu`, `resolvePadding`) are exported for custom renderers that want the same cascade and layout.

The ref supports `advance`, `skip`, `choose`, and `save`. Skip still respects `allowFastSkip` and `paused`. Standalone `DialogueBox` does not announce text to assistive technology or capture global keyboard events; provide host controls or use `NarrativeGame`.
