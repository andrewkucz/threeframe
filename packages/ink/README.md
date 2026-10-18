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

`DialogueBox` is the renderer without Ink: pass `text`, `speaker`, optional `choices`, `onAdvance`, and `onChoose`. `InkStory` and `InkDialogue` accept its presentation props.

| Prop                         | Default / meaning                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `reveal`                     | `character`; also `word`, `line` (wrapped visual lines), `instant`                                                 |
| `speed`                      | 36 reveal units/second; 0 means instant                                                                            |
| `allowFastSkip`              | true; click during reveal shows this page, not the next one                                                        |
| `paused`                     | false; pauses printing and ignores player actions                                                                  |
| `width`, `height`, `padding` | 1120, 210, 30 design units                                                                                         |
| `position`                   | `[0, -220, 100]`; choices stack above bottom panels and below top panels                                           |
| `choicesPerPage`             | 3; larger choice lists get native previous/next controls                                                           |
| `theme`                      | Partial `DialogueTheme`: family, size, color, background, border, accent, muted, lineHeight, radius, choice colors |
| `speakers`                   | Dictionary of per-speaker `name`, label `color`, and canvas font shorthand `font`                                  |
| `onDisplayChange`            | Fires for page/printing/choice changes, not every printed character                                                |
| `onPrintComplete`            | Fires once per completed page                                                                                      |
| `initialPlayback`            | Page and UTF-16 reveal offset when the component mounts                                                            |

Long passages wrap by measured font width and split into pages without discarding trailing text. Long unbroken words split at grapheme boundaries. Blank paragraphs are preserved. Changing width, height, padding, or font metrics restarts the current passage at its first page so reflow cannot silently skip text. Keep enough room around a panel for choices; extremely long individual choice labels may need a taller layout or a custom renderer. The player also exposes all choices as accessible DOM buttons.

The ref supports `advance`, `skip`, `choose`, and `save`. Skip still respects `allowFastSkip` and `paused`. Standalone `DialogueBox` does not announce text to assistive technology or capture global keyboard events; provide host controls or use `NarrativeGame`.
