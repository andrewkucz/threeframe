import {
  SkeletonMesh,
  type AnimationStateListener,
  type TrackEntry,
} from "@esotericsoftware/spine-threejs";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useAsset, useDisposable, type Asset } from "@threeframe/core";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { MeshBasicMaterial } from "three";
import type { SpineAppearance, SpineAssetData, SpineRig } from "./assets";
import { applySlotTints, slotTints, type SpineColors } from "./colors";
import { hiddenSlots, resolveSkin } from "./skins";

export interface SpineSpriteHandle {
  mesh: SkeletonMesh;
  play: (animation: string, loop?: boolean, track?: number) => TrackEntry;
  queue: (animation: string, loop?: boolean, delay?: number, track?: number) => TrackEntry;
  clear: (track?: number, mix?: number) => void;
}
/** An animation blended above the base animation. Entries play on tracks 1, 2, … in order. */
export interface SpineTrack {
  animation: string;
  loop?: boolean;
  /** Blend weight from 0 to 1. */
  alpha?: number;
  timeScale?: number;
}
/** An animation queued after the base animation. */
export interface SpineQueuedAnimation {
  animation: string;
  loop?: boolean;
  /** Seconds after the previous entry starts; 0 queues it for when the previous one completes. */
  delay?: number;
}
/** Material settings, applied when the skeleton mesh is created. */
export interface SpineMaterialOptions {
  alphaTest?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  toneMapped?: boolean;
  /** Spine's two-color tint (dark color) support. */
  twoColorTint?: boolean;
}
export interface SpineSpriteProps extends Omit<ThreeElements["group"], "ref"> {
  /** A `spineAsset`, whose `skin`/`attachments` are used when the props are omitted. */
  asset: Asset<SpineAssetData> & SpineAppearance & SpineRig;
  /* Animation */
  /** Base animation on track 0. Omit to show the setup pose. */
  animation?: string;
  loop?: boolean;
  /** Played once each after `animation`, in order. */
  queue?: readonly SpineQueuedAnimation[];
  /** Extra animations blended above the base on tracks 1, 2, …, e.g. a blink or aim. */
  tracks?: readonly SpineTrack[];
  paused?: boolean;
  timeScale?: number;
  /** Default blend time in seconds when animations change. */
  mixDuration?: number;
  /** Per-transition blend times, as `[from, to, seconds]`. */
  mixes?: readonly (readonly [from: string, to: string, seconds: number])[];
  /* Appearance */
  /**
   * One skin, or several combined in order (for mix-and-match outfits). Defaults to the asset's
   * `skin`, then the default skin; pass `[]` for the default skin explicitly.
   */
  skin?: string | readonly string[];
  /**
   * Slot attachment overrides by slot name, applied over the skin's setup pose: an attachment
   * (placeholder) name to show, or `null` to hide the slot. Animations keying a slot still win.
   * Defaults to the asset's `attachments`; pass `{}` for none.
   */
  attachments?: Readonly<Record<string, string | null>>;
  /**
   * Colors by the asset's color group (e.g. `{ hair: "#c1b01c" }`) or by slot name, replacing the
   * slots' setup colors. Defaults to the asset's `colors`; animations keying a slot's color win.
   */
  colors?: SpineColors;
  flipX?: boolean;
  flipY?: boolean;
  tint?: string;
  opacity?: number;
  material?: SpineMaterialOptions;
  /* Events */
  listener?: AnimationStateListener;
  onReady?: (handle: SpineSpriteHandle) => void;
}

export const SpineSprite = forwardRef<SpineSpriteHandle, SpineSpriteProps>(function SpineSprite(
  {
    asset,
    animation,
    loop = true,
    queue,
    tracks,
    paused = false,
    timeScale = 1,
    mixDuration = 0.2,
    mixes,
    skin = asset.skin,
    attachments = asset.attachments,
    colors = asset.colors,
    flipX = false,
    flipY = false,
    tint = "#ffffff",
    opacity = 1,
    material,
    listener,
    onReady,
    ...props
  },
  ref,
) {
  const { data } = useAsset(asset);
  const {
    alphaTest = 0.001,
    depthTest = true,
    depthWrite = false,
    toneMapped = false,
    twoColorTint = true,
  } = material ?? {};
  const mesh = useMemo(
    () =>
      new SkeletonMesh({
        skeletonData: data,
        twoColorTint,
        materialFactory: (parameters) =>
          new MeshBasicMaterial({ ...parameters, alphaTest, depthTest, depthWrite, toneMapped }),
      }),
    [data, alphaTest, depthTest, depthWrite, toneMapped, twoColorTint],
  );
  useDisposable(mesh, (value) => {
    value.state.clearListeners();
    value.dispose();
  });
  const latest = useRef({ listener, onReady });
  latest.current = { listener, onReady };
  const handle = useMemo<SpineSpriteHandle>(
    () => ({
      mesh,
      play: (name, looping = true, track = 0) => mesh.state.setAnimation(track, name, looping),
      queue: (name, looping = false, delay = 0, track = 0) =>
        mesh.state.addAnimation(track, name, looping, delay),
      clear: (track = 0, mix = 0.2) => {
        mesh.state.setEmptyAnimation(track, mix);
      },
    }),
    [mesh],
  );
  useImperativeHandle(ref, () => handle, [handle]);
  useEffect(() => {
    latest.current.onReady?.(handle);
  }, [handle]);
  useEffect(() => {
    const bridge: AnimationStateListener = {
      start: (entry) => latest.current.listener?.start?.(entry),
      interrupt: (entry) => latest.current.listener?.interrupt?.(entry),
      end: (entry) => latest.current.listener?.end?.(entry),
      dispose: (entry) => latest.current.listener?.dispose?.(entry),
      complete: (entry) => latest.current.listener?.complete?.(entry),
      event: (entry, event) => latest.current.listener?.event?.(entry, event),
    };
    mesh.state.addListener(bridge);
    return () => mesh.state.removeListener(bridge);
  }, [mesh]);
  const mixKey = JSON.stringify(mixes ?? []);
  useEffect(() => {
    const stateData = mesh.state.data;
    stateData.defaultMix = Math.max(0, mixDuration);
    stateData.animationToMixTime = {};
    for (const [from, to, seconds] of JSON.parse(mixKey) as [string, string, number][])
      stateData.setMix(from, to, Math.max(0, seconds));
  }, [mesh, mixDuration, mixKey]);
  const queueKey = JSON.stringify(queue ?? []);
  useEffect(() => {
    if (animation) {
      mesh.state.setAnimation(0, animation, loop);
      for (const entry of JSON.parse(queueKey) as SpineQueuedAnimation[])
        mesh.state.addAnimation(0, entry.animation, entry.loop ?? false, entry.delay ?? 0);
    } else {
      mesh.state.clearTrack(0);
      mesh.skeleton.setupPose();
    }
    mesh.update(0);
  }, [mesh, animation, loop, queueKey]);
  const trackKey = JSON.stringify(tracks ?? []);
  useEffect(() => {
    const parsed = JSON.parse(trackKey) as SpineTrack[];
    parsed.forEach((track, i) => {
      const entry = mesh.state.setAnimation(i + 1, track.animation, track.loop ?? true);
      entry.alpha = Math.min(1, Math.max(0, track.alpha ?? 1));
      entry.timeScale = Math.max(0, track.timeScale ?? 1);
    });
    mesh.update(0);
    return () => {
      // Mixing out to an empty animation returns keyed bones and slots to the setup pose.
      parsed.forEach((_, i) => mesh.state.setEmptyAnimation(i + 1, mesh.state.data.defaultMix));
    };
  }, [mesh, trackKey]);
  const skinKey = JSON.stringify(skin ?? null);
  const resolvedSkin = useMemo(
    () => resolveSkin(data, JSON.parse(skinKey) as string | string[] | null),
    [data, skinKey],
  );
  const attachmentKey = JSON.stringify(attachments ?? {});
  const colorKey = JSON.stringify(colors ?? {});
  const tints = useMemo(
    () => slotTints(asset.colorGroups, JSON.parse(colorKey) as SpineColors),
    [asset.colorGroups, colorKey],
  );
  // Depends on `animation` because clearing it resets the setup pose, which drops the overrides.
  useEffect(() => {
    const { skeleton } = mesh;
    skeleton.setSkin(resolvedSkin);
    skeleton.setupPoseSlots();
    for (const [slot, name] of Object.entries(
      JSON.parse(attachmentKey) as Record<string, string | null>,
    ))
      skeleton.setAttachment(slot, name);
    applySlotTints(skeleton, tints);
    // Transparent rather than detached, so animations keying the attachment can't show it.
    for (const name of hiddenSlots(asset.hides, JSON.parse(skinKey) as string[] | null)) {
      const slot = skeleton.findSlot(name);
      if (slot) slot.pose.color.a = 0;
    }
    mesh.update(0);
  }, [mesh, resolvedSkin, skinKey, asset.hides, attachmentKey, tints, animation]);
  useEffect(() => {
    mesh.skeleton.scaleX = flipX ? -1 : 1;
    mesh.skeleton.scaleY = flipY ? -1 : 1;
    mesh.skeleton.color.setFromString(tint.replace(/^#/, ""));
    mesh.skeleton.color.a = Math.min(1, Math.max(0, opacity));
    mesh.update(0);
  }, [mesh, flipX, flipY, tint, opacity]);
  useFrame((_, delta) => {
    if (!paused) mesh.update(Math.min(delta, 0.1) * Math.max(0, timeScale));
  });
  return (
    <group {...props}>
      <primitive object={mesh} dispose={null} />
    </group>
  );
});
