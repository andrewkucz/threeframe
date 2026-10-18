import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AssetStore, type Asset } from "./assets";

const AssetsContext = createContext<AssetStore | null>(null);

/** Defers final disposal through React StrictMode's effect replay. */
export function useDisposable<T>(value: T, dispose: (value: T) => void) {
  const active = useRef(new Map<T, number>());
  const disposeRef = useRef(dispose);
  disposeRef.current = dispose;
  useEffect(() => {
    const leases = active.current;
    leases.set(value, (leases.get(value) ?? 0) + 1);
    return () => {
      leases.set(value, (leases.get(value) ?? 1) - 1);
      queueMicrotask(() => {
        if (leases.get(value) === 0) {
          leases.delete(value);
          disposeRef.current(value);
        }
      });
    };
  }, [value]);
}

export function useOwnedAssetStore() {
  const [store] = useState(() => new AssetStore());
  useDisposable(store, (value) => value.dispose());
  return store;
}

export function AssetProvider({ store, children }: { store: AssetStore; children: ReactNode }) {
  return <AssetsContext.Provider value={store}>{children}</AssetsContext.Provider>;
}

export function useAssetStore() {
  const store = useContext(AssetsContext);
  if (!store) throw new Error("Asset components must be inside an AssetProvider.");
  return store;
}

export function useAsset<T>(asset: Asset<T>) {
  return useAssetStore().read(asset);
}
export function useAssetProgress(store: AssetStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
