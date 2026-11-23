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
- `tracks`: `{ animation, loop?, alpha?, timeScale? }[]` blended above the base on tracks 1, 2, … (an aim or blink overlay).
- `mixDuration` (0.2 seconds) and `mixes`: `[from, to, seconds][]` per-transition blend times.
- `paused` (false), `timeScale` (1); animation advances in `useFrame`, with frame deltas capped at 0.1 seconds to prevent large background-tab jumps.
- `skin`: one name, or several combined in order into one skin for mix-and-match outfits.
- `attachments`: slot attachment overrides by slot name, `{ [slot]: placeholder | null }` (`null` hides the slot). Applied with `skeleton.setAttachment` after the skin's setup pose and reapplied when the skin changes; animations that key a slot still override it.
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

`resolveSkin(data, names)` returns the same runtime `Skin` the sprite uses (default skin, a single skin, or a new combined skin) for imperative use with `mesh.skeleton.setSkin`. Removing an overlay track mixes it out to an empty animation, so slots and bones it keyed return to the setup pose.

Declarative `animation`/`queue` changes override track 0, and `tracks` own tracks 1…n. An imperative animation persists until the relevant declarative props change. Higher tracks remain available through the handle or the raw mesh/state. Removing the `animation` prop resets to the setup pose. Invalid animation/skin names are reported by the runtime; wrap standalone scenes in an error boundary.

Three 0.184 is pinned as the shared peer because the installed Spine runtime declares `<0.185`. The material is unlit and preserves the runtime's atlas blending parameters. This wrapper uses ordinary R3F mesh hit testing; it does not expose per-slot hit regions.

See [Spine Runtimes licensing](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/LICENSE) and the included `LICENSE.spine-runtimes`. The supplied example assets and the runtime retain their upstream terms.
