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

- `animation`, `loop` (true), `mixDuration` (0.2 seconds).
- `paused` (false), `timeScale` (1); animation advances in `useFrame`, with frame deltas capped at 0.1 seconds to prevent large background-tab jumps.
- `skin`, `flipX`, `tint` (hex color), `opacity`.
- Standard R3F group props: position, scale, rotation, visibility, pointer events, etc.
- `listener`: official Spine animation callbacks (`start`, `complete`, `event`, `interrupt`, `end`, `dispose`). Callback identity changes do not restart animations.
- `onReady(handle)` and a ref exposing `mesh`, `play`, `queue`, and `clear`.

```ts
sprite.current?.play("jump", false); // track 0
sprite.current?.queue("idle", true, 0); // play after the jump
sprite.current?.play("shoot", false, 1); // independent overlay track
sprite.current?.clear(1, 0.2); // mix overlay out
```

Declarative `animation` changes override track 0. An imperative animation persists until the relevant declarative props change. Other tracks are available through the handle or the raw mesh/state. Removing the `animation` prop resets to the setup pose. Invalid animation/skin names are reported by the runtime; wrap standalone scenes in an error boundary.

Three 0.184 is pinned as the shared peer because the installed Spine runtime declares `<0.185`. The material is unlit and preserves the runtime's atlas blending parameters. This wrapper uses ordinary R3F mesh hit testing; it does not expose per-slot hit regions.

See [Spine Runtimes licensing](https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/LICENSE) and the included `LICENSE.spine-runtimes`. The supplied example assets and the runtime retain their upstream terms.
