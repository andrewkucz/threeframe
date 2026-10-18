import {
  AssetProvider,
  SceneCanvas,
  useAssetProgress,
  useOwnedAssetStore,
  type Asset,
  type Camera2DProps,
} from "@threeframe/core";
import { Component, Suspense, useEffect, useState, type ReactNode } from "react";

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <p className="notice" role="alert">
        {this.state.error.message}
      </p>
    ) : (
      this.props.children
    );
  }
}
export function LabScene({
  assets,
  children,
  fit = "contain",
  scenePreview = false,
}: {
  assets: readonly Asset<any>[];
  children: ReactNode;
  fit?: Camera2DProps["fit"];
  scenePreview?: boolean;
}) {
  const store = useOwnedAssetStore();
  const progress = useAssetProgress(store);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    void store
      .preload(assets)
      .then(() => {
        if (active) setReady(true);
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [assets, store]);
  return (
    <div className={`lab-canvas${scenePreview ? " scene-preview" : ""}`}>
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : ready ? (
        <SceneErrorBoundary key={assets.map((asset) => asset.key).join("|")}>
          <AssetProvider store={store}>
            <SceneCanvas fit={fit}>
              <Suspense fallback={null}>{children}</Suspense>
            </SceneCanvas>
          </AssetProvider>
        </SceneErrorBoundary>
      ) : (
        <div className="loading" role="status">
          Loading assets… {Math.round(progress.progress * 100)}%
        </div>
      )}
    </div>
  );
}
