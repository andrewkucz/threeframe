# @threeframe/spine

React Three Fiber components for the official **Spine 4.3** Three.js runtime.

```tsx
const boy = spineAsset({
  skeleton: "/spineboy/spineboy-pro.json",
  atlas: "/spineboy/spineboy.atlas",
  format: "json", // 'binary' for .skel
  scale: 1, // skeleton-data scale, part of the asset cache key
});

<AssetProvider store={store}>
  <SceneCanvas>
    <Suspense fallback={null}>
      <SpineSprite asset={boy} animation="idle" position={[0, -200, 0]} scale={0.6} />
    </Suspense>
  </SceneCanvas>
</AssetProvider>;
```

`spineAsset` loads atlas pages and skeleton data together. The atlas owns its page textures; the AssetStore owns/disposes the loader. Atlas page URLs resolve relative to the atlas. JSON version mismatches fail with a readable message; binary compatibility is checked by the runtime. Use the matching export/runtime generation, not a 4.2 skeleton with this package. The example's `4.3.75-beta` exports work with the pinned 4.3.13 runtime and are tested in JSON and binary form.

Each `SpineSprite` has its own skeleton, animation state, listeners, and mesh geometry, while sharing immutable asset data and atlas textures. The mesh is disposed when the sprite unmounts; shared assets remain valid for other instances. StrictMode effect replay is supported.

Props react to changes:

- `animation`, `loop` (true): the base animation on track 0.
- `queue`: `{ animation, loop?, delay? }[]` played after the base animation, in order.
- `tracks`: `{ animation, loop?, alpha?, timeScale? }[]` blended above the base on tracks 1, 2, … (an aim, a blink, a held pose). Only tracks whose animation or `loop` changes restart; the others keep playing.
- `mixDuration` (0.2 seconds) and `mixes`: `[from, to, seconds][]` per-transition blend times.
- `paused` (false), `timeScale` (1); animation advances in `useFrame`, with frame deltas capped at 0.1 seconds to prevent large background-tab jumps.
- `skin`: one name, or several combined in order into one skin for mix-and-match outfits.
- `attachments`: slot attachment overrides by slot name, `{ [slot]: placeholder | null }` (`null` hides the slot). Applied with `skeleton.setAttachment` after the skin's setup pose and reapplied when the skin changes; animations that key a slot still override it.
- `colors`: `{ [group or slot]: hex }`, recoloring slots by the asset's `colorGroups` (see below). Reapplied with the attachments; animations that key a slot's color still override it.
- `flipX`, `flipY`, `tint` (hex color), `opacity`.
- `material`: `alphaTest` (0.001), `depthTest` (true), `depthWrite` (false), `toneMapped` (false), `twoColorTint` (true). Changing it rebuilds the mesh.
- Standard R3F group props: position, scale, rotation, visibility, pointer events, etc.
- `listener`: official Spine animation callbacks (`start`, `complete`, `event`, `interrupt`, `end`, `dispose`). Callback identity changes do not restart animations.
- `onReady(handle)` and a ref exposing `mesh`, `play`, `queue`, and `clear`.

```ts
sprite.current?.play("jump", false); // track 0
sprite.current?.queue("idle", true, 0); // play after the jump
sprite.current?.play("shoot", false, 1); // independent overlay track
sprite.current?.clear(1, 0.2); // mix overlay out
```

### Loading from a file source

`spineAsset({ skeleton, atlas, source })` reads the skeleton, the atlas and its page images through a core `FileSource` (plain URLs by default). Page images resolve relative to the atlas, as in the Spine runtime, so exports packed into an archive or held in memory load unchanged. The loaded value is `{ data, atlas }`; disposing it releases the atlas textures.

## Skins and attachments

Name skins with editor folders (`clothes/top/shirt1`, `clothes/bottom/skirt1`, …) and combine one per folder for mix-and-match outfits, as the Spine runtime guide recommends. The default skin is always the fallback, so it never needs to be listed.

```tsx
const data = useSpineData(character); // SkeletonData, through Suspense
const folders = skinFolders(data); // [{ path: "clothes/top", label: "top", skins: [{ name, label }] }, …]
const slots = slotAttachments(data, outfit); // [{ slot, bone, setup, attachments: [...] }, …]

<SpineSprite asset={character} skin={outfit} attachments={{ mouth: "mouth2", hat: null }} />;
```

A `spineAsset` can carry the appearance sprites start with, which they use when they omit `skin`/`attachments` (pass `[]`/`{}` to opt out). These defaults are not part of the cache key, so variants of one skeleton share a single load:

```ts
const heroine = spineAsset({
  skeleton: "/assets/heroine.json",
  atlas: "/assets/heroine.atlas",
  skin: ["body/base", "clothes/top/shirt1"],
  attachments: { mouth: "smile" },
});
```

## Hidden slots

Some skins replace other parts, such as a gag covering the mouth. List them on the asset as `hides`, by skin name or skin folder; sprites wearing a matching skin draw those slots fully transparent, so animations that only swap the slot's attachment can't bring it back:

```ts
spineAsset({ skeleton, atlas, hides: { "accessories/gag": ["mouth"] } });
```

`hiddenSlots(hides, skins)` lists the slots hidden for a set of skins.

## Held animations

Some skins only make sense with one animation, such as a chest rope that holds the arms behind the back. List them on the asset as `holds`, by skin name or folder. While a matching skin is worn, a track (or the base animation) playing another animation from the held one's folder plays the held one instead, through any `transitions`, and the held animation is added on a track of its own when none is playing from that folder:

```ts
spineAsset({ skeleton, atlas, holds: { "accessories/chestbind": "pose/behind-back" } });
```

Held animations the skeleton doesn't have are ignored, and so are transition steps, so several skeletons of one character (front, side, back) can share one rig. `heldAnimations(holds, skins)` and `applyHolds(animations, held)` do the same for imperative use.

## Flipped skins

`flipX` mirrors the whole skeleton, which moves anything that belongs to one side of a character to the other: a hair clip on her left ends up on her right. List skins to add while flipped as `flipSkins`, by skin name or folder; they go on after the worn skins, so they can move, show or hide those parts:

```ts
spineAsset({ skeleton, atlas, flipSkins: { "body/hair/bob": ["flipped/body/hair/bob"] } });
```

A flip skin can map the clip's placeholder to a copy placed at the mirrored spot with `scaleX: -1`, so flipping the sprite lands it back on her left. Flip skins the skeleton doesn't have are skipped. `flippedSkins(flipSkins, skins)` lists the skins added for a set of worn skins, and `skinFolders(data, { exclude })` leaves them out of pickers.

## Transitions

Some changes look wrong as a straight blend: a character uncrosses her arms before putting them behind her back, and a runner slows down through `run-to-idle`. List them on the asset as `transitions`, `[from, to, via]`. When a track (the base animation, an overlay track or `handle.play`) switches from `from` to `to`, it plays each `via` animation first, fully mixed in and played to its end, then `to`:

```ts
spineAsset({
  skeleton,
  atlas,
  transitions: [
    ["run", "idle", ["run-to-idle"]],
    ["pose/side", "pose/behind-back", ["transition/side-to-behind-back"]],
    ["pose/crossed", "pose/behind-back", ["pose/side", "transition/side-to-behind-back"]],
  ],
});
```

A via can be a held pose (a single key, which the track holds for its mix duration) or a transition animation that starts on `from`'s pose and ends on `to`'s. Transition animations can also key the moment a part changes layer, such as hands moving from front slots to slots behind the body. `playAnimation(state, track, animation, loop, transitions)` does the same for imperative use.

## Colors

Skins swap shapes; colors are separate. A `spineAsset` lists named `colorGroups`, each tinting some slots, and sprites choose colors by group name (or by slot name for any other slot):

```tsx
const heroine = spineAsset({
  skeleton: "/assets/heroine.json",
  atlas: "/assets/heroine.atlas",
  colorGroups: {
    skin: { slots: ["torso", "head"], default: "#f5d8ab", presets: { tan: "#f3c98b" } },
    hair: {
      slots: ["hair", "fringe"],
      presets: { blonde: "#c1b01c" },
      gradient: { mid: 0.35, range: 50 },
    },
  },
});

<SpineSprite asset={heroine} colors={{ skin: "#f3c98b", hair: "#2e1a0e" }} />;
```

- **Multiply** (no `gradient`): the color multiplies the art. Draw flat-colored parts in white with black outlines and they take any color.
- **Gradient**: for shaded art with highlights. Draw it in grays, with the base color at gray `mid` and lightness (CIE L\*) changing by `range` across grays 0–1, and enable "Tint black" on the slots in Spine. `colorTint(color, group)` picks the two-color tint's light and dark colors so gray `mid` draws exactly `color` and the shading keeps its contrast. Keep outlines and details that shouldn't change color in a separate, untinted slot above.

Groups with a `default` apply when nothing is chosen. `presets` are named choices for pickers. `slotTints(groups, colors)` and `applySlotTints(skeleton, tints)` do the same for imperative use; like the attachments, tints are lost whenever the slots return to the setup pose.

`resolveSkin(data, names)` returns the same runtime `Skin` the sprite uses (default skin, a single skin, or a new combined skin) for imperative use with `mesh.skeleton.setSkin`. Removing an overlay track mixes it out to an empty animation, so slots and bones it keyed return to the setup pose.

Declarative `animation`/`queue` changes override track 0, and `tracks` own tracks 1…n. An imperative animation persists until the relevant declarative props change. Higher tracks remain available through the handle or the raw mesh/state. Removing the `animation` prop resets to the setup pose. Invalid animation/skin names are reported by the runtime; wrap standalone scenes in an error boundary.

Three 0.184 is pinned as the shared peer because the installed Spine runtime declares `<0.185`. The material is unlit and preserves the runtime's atlas blending parameters. This wrapper uses ordinary R3F mesh hit testing; it does not expose per-slot hit regions.

See [Spine Runtimes licensing](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/LICENSE) and the included `LICENSE.spine-runtimes`. The supplied example assets and the runtime retain their upstream terms.
