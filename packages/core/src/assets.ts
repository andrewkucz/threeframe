export interface Asset<T = unknown> {
  /** A stable, globally unique key within this store. Include load options in it. */
  key: string;
  load: (signal: AbortSignal) => Promise<T>;
  dispose?: (value: T) => void;
}

export type AssetStatus = "loading" | "ready" | "error";
export interface AssetProgress {
  total: number;
  loaded: number;
  failed: number;
  progress: number;
  entries: ReadonlyArray<{ key: string; status: AssetStatus; error?: Error }>;
}

interface RecordEntry {
  asset: Asset<any>;
  status: AssetStatus;
  promise: Promise<any>;
  abort: AbortController;
  value?: unknown;
  error?: Error;
}

/** An explicitly owned cache. Dispose it after all of its consumers unmount. */
export class AssetStore {
  private records = new Map<string, RecordEntry>();
  private listeners = new Set<() => void>();
  private closed = false;
  private snapshot: AssetProgress = { total: 0, loaded: 0, failed: 0, progress: 1, entries: [] };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;

  private publish() {
    const entries = [...this.records.values()].map(({ asset, status, error }) => ({
      key: asset.key,
      status,
      error,
    }));
    const loaded = entries.filter((entry) => entry.status === "ready").length;
    const failed = entries.filter((entry) => entry.status === "error").length;
    this.snapshot = {
      total: entries.length,
      loaded,
      failed,
      progress: entries.length ? loaded / entries.length : 1,
      entries,
    };
    this.listeners.forEach((listener) => listener());
  }

  load<T>(asset: Asset<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("This AssetStore has been disposed."));
    const existing = this.records.get(asset.key);
    if (existing) return existing.promise;
    const abort = new AbortController();
    const record: RecordEntry = { asset, abort, status: "loading", promise: Promise.resolve() };
    this.records.set(asset.key, record);
    record.promise = Promise.resolve()
      .then(() => asset.load(abort.signal))
      .then((value) => {
        if (this.closed || abort.signal.aborted) {
          asset.dispose?.(value);
          throw new Error(`Asset load cancelled: ${asset.key}`);
        }
        record.value = value;
        record.status = "ready";
        this.publish();
        return value;
      })
      .catch((reason: unknown) => {
        record.status = "error";
        record.error = reason instanceof Error ? reason : new Error(String(reason));
        if (!this.closed) this.publish();
        throw record.error;
      });
    // Suspense reads may have no committed consumer yet. Keep rejections handled.
    void record.promise.catch(() => {});
    this.publish();
    return record.promise;
  }

  read<T>(asset: Asset<T>): T {
    if (this.closed) throw new Error("This AssetStore has been disposed.");
    const record = this.records.get(asset.key);
    if (!record) throw this.load(asset);
    if (record.status === "error") throw record.error;
    if (record.status === "loading") throw record.promise;
    return record.value as T;
  }

  async preload(assets: readonly Asset<any>[]) {
    const results = await Promise.allSettled(assets.map((asset) => this.load(asset)));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        `Some game assets could not be loaded: ${failures.map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason))).join("; ")}`,
      );
  }

  /** Failed loads only; live textures are never evicted underneath a scene. */
  retryFailed() {
    for (const [key, record] of this.records) {
      if (record.status === "error") this.records.delete(key);
    }
    this.publish();
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const record of this.records.values()) {
      record.abort.abort();
      if (record.status === "ready") record.asset.dispose?.(record.value);
    }
    this.records.clear();
    this.listeners.clear();
  }
}

export async function fetchAsset(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  return response;
}

export function textAsset(url: string): Asset<string> {
  return { key: `text:${url}`, load: async (signal) => (await fetchAsset(url, signal)).text() };
}

export function jsonAsset<T = unknown>(url: string): Asset<T> {
  return {
    key: `json:${url}`,
    load: async (signal) => {
      const response = await fetchAsset(url, signal);
      try {
        return (await response.json()) as T;
      } catch (cause) {
        throw new Error(`Invalid JSON asset: ${url}`, { cause });
      }
    },
  };
}
