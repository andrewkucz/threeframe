import { useDisposable } from "@threeframe/core";
import {
  GameSession,
  type GamePackage,
  type GameSessionOptions,
  type SaveSlotInfo,
  type SaveStore,
  type StageState,
} from "@threeframe/game";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** The session's current snapshot, re-rendering on every change. */
export function useGameSnapshot(session: GameSession) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/**
 * A session for a package, created once per package and disposed after unmount. Options are read
 * when the session is created.
 */
export function useGameSession(pkg: GamePackage, options?: GameSessionOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [state, setState] = useState(() => ({ pkg, session: new GameSession(pkg, options) }));
  let current = state;
  if (state.pkg !== pkg) {
    current = { pkg, session: new GameSession(pkg, latest.current) };
    setState(current);
  }
  useDisposable(current.session, (session) => session.dispose());
  return current.session;
}

/** Save slots with their saves, refreshed whenever a slot changes. `null` while loading. */
export function useSaveSlots(store: SaveStore | null) {
  const version = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getVersion ?? zero,
    store?.getVersion ?? zero,
  );
  const [slots, setSlots] = useState<SaveSlotInfo[] | null>(null);
  useEffect(() => {
    if (!store) return setSlots([]);
    let active = true;
    void store.list().then((list) => {
      if (active) setSlots(list);
    });
    return () => {
      active = false;
    };
  }, [store, version]);
  return slots;
}
const noopSubscribe = () => () => {};
const zero = () => 0;

export interface StageAudioOptions {
  muted?: boolean;
  /** Master volume, 0–1. */
  volume?: number;
}

/** Plays the stage's music and one-shot `sound` effects from the package. */
export function useStageAudio(
  pkg: GamePackage,
  stage: StageState,
  { muted = false, volume = 1 }: StageAudioOptions = {},
) {
  const urls = useRef(new Map<string, Promise<string>>());
  const music = useRef<{ path: string; audio: HTMLAudioElement } | null>(null);
  const seen = useRef(stage.effectId - 1);
  const master = muted ? 0 : Math.max(0, Math.min(1, volume));
  const masterRef = useRef(master);
  masterRef.current = master;

  const url = (path: string) => {
    let cached = urls.current.get(path);
    if (!cached) {
      cached = pkg.source.fetch(path).then(async (response) => {
        if (!response.ok) throw new Error(`Missing audio file: ${path}`);
        return URL.createObjectURL(await response.blob());
      });
      urls.current.set(path, cached);
    }
    return cached;
  };

  useEffect(() => {
    const cache = urls.current;
    return () => {
      music.current?.audio.pause();
      music.current = null;
      for (const pending of cache.values())
        void pending.then(
          (url) => URL.revokeObjectURL(url),
          () => {},
        );
      cache.clear();
    };
  }, [pkg]);

  const { path, volume: musicVolume, fade } = stage.music;
  useEffect(() => {
    const current = music.current;
    if (current?.path === path) {
      current.audio.volume = musicVolume * masterRef.current;
      return;
    }
    if (current) fadeTo(current.audio, 0, fade, () => current.audio.pause());
    music.current = null;
    if (!path) return;
    let cancelled = false;
    void url(path).then((src) => {
      if (cancelled) return;
      const audio = new Audio(src);
      audio.loop = true;
      audio.volume = 0;
      music.current = { path, audio };
      void audio.play().catch(() => {});
      fadeTo(audio, musicVolume * masterRef.current, fade);
    });
    return () => {
      cancelled = true;
    };
  }, [path, musicVolume, fade]);

  useEffect(() => {
    if (music.current) music.current.audio.volume = musicVolume * master;
  }, [master, musicVolume]);

  useEffect(() => {
    for (const effect of stage.effects) {
      if (effect.id <= seen.current) continue;
      seen.current = effect.id;
      if (effect.type !== "sound" || masterRef.current === 0) continue;
      const level = Number(effect.params.volume ?? 1) * masterRef.current;
      void url(String(effect.params.path)).then((src) => {
        const audio = new Audio(src);
        audio.volume = Math.max(0, Math.min(1, level));
        void audio.play().catch(() => {});
      });
    }
  }, [stage.effects]);
}

function fadeTo(audio: HTMLAudioElement, target: number, seconds: number, done?: () => void) {
  const from = audio.volume;
  const start = performance.now();
  const step = () => {
    const t = seconds > 0 ? Math.min(1, (performance.now() - start) / (seconds * 1000)) : 1;
    audio.volume = Math.max(0, Math.min(1, from + (target - from) * t));
    if (t < 1) requestAnimationFrame(step);
    else done?.();
  };
  step();
}
