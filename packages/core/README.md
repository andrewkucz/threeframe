# @threeframe/core

Shared loading and 2D scene primitives. Requires React, Three, and React Three Fiber.

## Asset ownership

```tsx
const background = textureAsset("/garden.webp");
const store = new AssetStore();
await store.preload([background]);

<AssetProvider store={store}>
  <SceneCanvas width={1280} height={720} fit="contain">
    <Suspense fallback={null}>
      <Backdrop asset={background} fit="cover" />
    </Suspense>
  </SceneCanvas>
</AssetProvider>;

// After every consumer has unmounted:
store.dispose();
```

`useOwnedAssetStore()` owns/disposes a store for a React component, including StrictMode effect replay. `AssetProvider` does **not** dispose externally supplied stores. `useAsset(asset)` reads through Suspense; add an error boundary for failed reads. `useAssetProgress(store)` subscribes to a cached snapshot with `total`, `loaded`, `failed`, `progress`, and per-key entries. Progress is completed logical assets, not bytes; a Spine asset includes its atlas pages.

`load(asset)` deduplicates by key; `preload(assets)` starts independent loads together, waits for all to settle, and rejects with an `AggregateError` if anything failed. `retryFailed()` evicts failures only. After retry, call load/preload again or remount the Suspense consumer. `dispose()` aborts fetches and releases resources, including results that arrive late. A disposed store cannot be reused. Live resources are retained until store disposal so another consumer cannot lose a shared texture.

Built-in factories: `textAsset(url)`, `jsonAsset<T>(url)`, `textureAsset(url)`, `fontAsset(family, url, descriptors?)`. URLs may be relative, absolute, or cross-origin with the appropriate server CORS configuration. Custom assets use:

```ts
const audioBuffer: Asset<AudioBuffer> = {
  key: "audio:wind:v1", // include options/version; equal keys mean equal assets
  load: async (signal) => {
    const response = await fetchAsset("/wind.ogg", signal);
    return audioContext.decodeAudioData(await response.arrayBuffer());
  },
};
```

## Scene primitives

- `SceneCanvas`: R3F `Canvas` props plus design `width`, `height`, and `fit: 'contain' | 'cover'`. Defaults to a flat, orthographic, 1280×720 scene with DPR capped at 2. Use the continuous render loop when animating Spine.
- `Camera2D`: the same camera settings, for an existing Canvas. Installs its camera and restores the previous camera on unmount.
- `Backdrop`: texture asset, design dimensions, `fit: 'cover' | 'contain' | 'stretch'`, `opacity`, and `z` (default -100). Plane geometry preserves the texture's aspect ratio unless stretched. A containing camera naturally clips cover overflow.
- `CanvasPanel`: a native scene plane painted with `draw(context, width, height)`, with mesh props, dimensions, and resolution (default 2). Textures dispose on unmount and reuse their canvas between draws. Transparent text uses render ordering above scene content; callers decide pointer semantics.
- `wrapText`, `paginateText`, `graphemes`, `revealStops`: pure layout utilities. Wrapping takes an explicit measurement function, so tests and renderers can use consistent font metrics. A grapheme wider than a whole line is placed intact on its own line.

Font assets are registered with `document.fonts` before preloading finishes. Dialogue uses the same family name for measurement and drawing. Preloading avoids font swaps; dialogue also responds to browser `loadingdone` events.
