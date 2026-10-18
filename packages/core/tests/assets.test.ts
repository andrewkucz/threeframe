import { describe, expect, it, vi } from "vite-plus/test";
import { AssetStore, fetchAsset, type Asset } from "../src/assets";

describe("AssetStore ownership", () => {
  it("deduplicates concurrent loads and publishes stable progress snapshots", async () => {
    const store = new AssetStore();
    const asset = { key: "shared", load: vi.fn(async () => 42) };
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    const first = store.load(asset);
    const second = store.load(asset);
    expect(first).toBe(second);
    expect(store.getSnapshot()).toMatchObject({ total: 1, loaded: 0 });
    await first;
    expect(store.read(asset)).toBe(42);
    expect(asset.load).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ total: 1, loaded: 1, progress: 1 });
  });

  it("starts independent assets together and waits for all before reporting failure", async () => {
    const store = new AssetStore();
    let finish!: (value: number) => void;
    const promise = store.preload([
      {
        key: "slow",
        load: () =>
          new Promise<number>((resolve) => {
            finish = resolve;
          }),
      },
      {
        key: "bad",
        load: async () => {
          throw new Error("offline");
        },
      },
    ]);
    await Promise.resolve();
    expect(store.getSnapshot().total).toBe(2);
    finish(7);
    await expect(promise).rejects.toThrow("Some game assets");
    expect(store.getSnapshot()).toMatchObject({ loaded: 1, failed: 1 });
  });

  it("retries failures without reloading successful resources", async () => {
    const store = new AssetStore();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(12);
    const asset: Asset<number> = { key: "retry", load };
    await expect(store.load(asset)).rejects.toThrow("offline");
    expect(() => store.read(asset)).toThrow("offline");
    store.retryFailed();
    await expect(store.load(asset)).resolves.toBe(12);
    store.retryFailed();
    await store.load(asset);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("aborts pending work and disposes late results exactly once", async () => {
    const store = new AssetStore();
    let finish!: (value: number) => void;
    let signal!: AbortSignal;
    const dispose = vi.fn();
    const pending = store.load({
      key: "late",
      load: (s) => {
        signal = s;
        return new Promise<number>((resolve) => {
          finish = resolve;
        });
      },
      dispose,
    });
    await Promise.resolve();
    store.dispose();
    store.dispose();
    expect(signal.aborted).toBe(true);
    finish(9);
    await expect(pending).rejects.toThrow("cancelled");
    expect(dispose).toHaveBeenCalledExactlyOnceWith(9);
    await expect(store.load({ key: "closed", load: async () => 0 })).rejects.toThrow("disposed");
  });

  it("disposes loaded resources once and unsubscribes listeners", async () => {
    const store = new AssetStore();
    const dispose = vi.fn();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.load({ key: "texture", load: async () => 1, dispose });
    unsubscribe();
    listener.mockClear();
    store.retryFailed();
    expect(listener).not.toHaveBeenCalled();
    store.dispose();
    store.dispose();
    expect(dispose).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("reports HTTP errors with the failing URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    try {
      await expect(fetchAsset("/missing.png", new AbortController().signal)).rejects.toThrow(
        "/missing.png: HTTP 404",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
