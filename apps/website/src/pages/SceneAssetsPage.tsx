import {
  AssetProvider,
  Backdrop,
  SceneCanvas,
  jsonAsset,
  useAssetProgress,
  useOwnedAssetStore,
} from "@threeframe/core";
import { Suspense, useEffect, useState } from "react";
import { tower, valley } from "../demo";
import { Controls } from "../docs/Controls";
import { Disclosure, DocsExample, Preview } from "../docs/DocsExample";
import { code, jsx } from "../docs/examples";
import { sceneControls, sceneDefaults, sceneReference } from "../docs/options";
import { Icon } from "../ui";

const sceneAssets = [valley, tower];
export default function SceneAssetsPage() {
  const [generation, setGeneration] = useState(0);
  return <AssetSession key={generation} reset={() => setGeneration(generation + 1)} />;
}
function AssetSession({ reset }: { reset: () => void }) {
  const store = useOwnedAssetStore();
  const progress = useAssetProgress(store);
  const [settings, setSettings] = useState(sceneDefaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void store
      .preload(sceneAssets)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [store]);
  const backdrop = {
    fit: settings.fit,
    opacity: settings.opacity,
    width: settings.width,
    height: settings.height,
  };
  const backdropCode = jsx("Backdrop", { asset: code("background"), ...backdrop });
  const usage = `import { Suspense } from "react";
import { AssetProvider, Backdrop, SceneCanvas, textureAsset, useOwnedAssetStore } from "@threeframe/core";

const background = textureAsset("/assets/${settings.backdrop}.svg");

export default function Example() {
  const store = useOwnedAssetStore();
  return (
    <div style={{ aspectRatio: "16 / 10" }}>
      <AssetProvider store={store}>
        <SceneCanvas width={1280} height={720} fit="${settings.cameraFit}">
          <color attach="background" args={["#14232c"]} />
          <Suspense fallback={null}>
${backdropCode
  .split("\n")
  .map((line) => `            ${line}`)
  .join("\n")}
          </Suspense>
        </SceneCanvas>
      </AssetProvider>
    </div>
  );
}`;
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          label="Scene preview"
          actions={
            <button className="text-button" onClick={reset}>
              <Icon name="reset" size={14} />
              Reload assets
            </button>
          }
          footer={
            <>
              <span className="preview-caption">Design space 1280 × 720 · viewport 16:10</span>
              <span className="asset-count">
                {progress.loaded}/{progress.total} assets ready
              </span>
            </>
          }
        >
          <div className="lab-canvas scene-preview">
            {ready ? (
              <AssetProvider store={store}>
                <SceneCanvas fit={settings.cameraFit}>
                  <color attach="background" args={["#14232c"]} />
                  <Suspense fallback={null}>
                    <Backdrop
                      asset={settings.backdrop === "valley" ? valley : tower}
                      {...backdrop}
                    />
                  </Suspense>
                </SceneCanvas>
              </AssetProvider>
            ) : (
              <div className="loading" role="status">
                Loading scene assets…
              </div>
            )}
          </div>
        </Preview>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <DocsExample
          usage={usage}
          setup={[
            {
              name: "Asset preloading",
              source:
                'import { AssetStore, textureAsset } from "@threeframe/core";\n\nconst store = new AssetStore();\nconst background = textureAsset("/assets/valley.svg");\n\nawait store.preload([background]);\n// Pass store to AssetProvider.\n// When all consumers have unmounted:\nstore.dispose();',
            },
          ]}
          reference={sceneReference}
          note="This example owns its canvas, so render Example directly in your app. Put valley.svg and tower.svg in public/assets, or change the URLs. The live preview preloads both backgrounds."
          recipes={[
            {
              name: "Loading and recovery",
              source:
                "const progress = useAssetProgress(store);\nconsole.log(progress.loaded, progress.total, progress.failed);\n\n// Clear failed records, then retry the original descriptor.\nstore.retryFailed();\nawait store.preload(assets);",
            },
          ]}
        />
        <Disclosure title="Asset loading & errors">
          <div className="resource-actions">
            <button
              className="small-button"
              onClick={() =>
                void store.preload(sceneAssets).catch((reason: unknown) => setError(String(reason)))
              }
            >
              Preload again
            </button>
            <button
              className="small-button"
              onClick={() =>
                void store
                  .load(jsonAsset("/assets/missing-demo-asset.json"))
                  .catch((reason: unknown) => setError(String(reason)))
              }
            >
              Try a missing asset
            </button>
            <button
              className="small-button"
              onClick={() => {
                store.retryFailed();
                setError("");
              }}
            >
              Clear failed loads
            </button>
            <button className="small-button" onClick={reset}>
              Dispose & reload
            </button>
          </div>
          <progress
            aria-label="Asset loading progress"
            value={progress.loaded}
            max={Math.max(1, progress.total)}
          />
          <div className="asset-list">
            {progress.entries.map((entry) => (
              <div key={entry.key}>
                <code>{entry.key}</code>
                <span className={`status-pill ${entry.status}`}>{entry.status}</span>
              </div>
            ))}
          </div>
        </Disclosure>
      </div>
      <Controls
        specs={sceneControls}
        values={settings}
        onChange={(key, value) => setSettings((previous) => ({ ...previous, [key]: value }))}
        onReset={() => setSettings(sceneDefaults)}
      />
    </div>
  );
}
