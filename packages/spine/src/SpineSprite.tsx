import {
  SkeletonMesh,
  type AnimationStateListener,
  type TrackEntry,
} from "@esotericsoftware/spine-threejs";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useAsset, useDisposable, type Asset } from "@threeframe/core";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { MeshBasicMaterial } from "three";
import type { SpineAssetData } from "./assets";

export interface SpineSpriteHandle {
  mesh: SkeletonMesh;
  play: (animation: string, loop?: boolean, track?: number) => TrackEntry;
  queue: (animation: string, loop?: boolean, delay?: number, track?: number) => TrackEntry;
  clear: (track?: number, mix?: number) => void;
}
export interface SpineSpriteProps extends Omit<ThreeElements["group"], "ref"> {
  asset: Asset<SpineAssetData>;
  animation?: string;
  loop?: boolean;
  paused?: boolean;
  timeScale?: number;
  mixDuration?: number;
  skin?: string;
  flipX?: boolean;
  tint?: string;
  opacity?: number;
  listener?: AnimationStateListener;
  onReady?: (handle: SpineSpriteHandle) => void;
}

export const SpineSprite = forwardRef<SpineSpriteHandle, SpineSpriteProps>(function SpineSprite(
  {
    asset,
    animation,
    loop = true,
    paused = false,
    timeScale = 1,
    mixDuration = 0.2,
    skin,
    flipX = false,
    tint = "#ffffff",
    opacity = 1,
    listener,
    onReady,
    ...props
  },
  ref,
) {
  const { data } = useAsset(asset);
  const mesh = useMemo(
    () =>
      new SkeletonMesh({
        skeletonData: data,
        materialFactory: (parameters) =>
          new MeshBasicMaterial({
            ...parameters,
            depthWrite: false,
            alphaTest: 0.001,
            toneMapped: false,
          }),
      }),
    [data],
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
  useEffect(() => {
    mesh.state.data.defaultMix = Math.max(0, mixDuration);
  }, [mesh, mixDuration]);
  useEffect(() => {
    if (animation) mesh.state.setAnimation(0, animation, loop);
    else {
      mesh.state.clearTracks();
      mesh.skeleton.setupPose();
    }
    mesh.update(0);
  }, [mesh, animation, loop]);
  useEffect(() => {
    if (skin) mesh.skeleton.setSkin(skin);
    else mesh.skeleton.setSkin(data.defaultSkin);
    mesh.skeleton.setupPoseSlots();
    mesh.update(0);
  }, [mesh, data, skin]);
  useEffect(() => {
    mesh.skeleton.scaleX = flipX ? -1 : 1;
    mesh.skeleton.color.setFromString(tint.replace(/^#/, ""));
    mesh.skeleton.color.a = Math.min(1, Math.max(0, opacity));
    mesh.update(0);
  }, [mesh, flipX, tint, opacity]);
  useFrame((_, delta) => {
    if (!paused) mesh.update(Math.min(delta, 0.1) * Math.max(0, timeScale));
  });
  return (
    <group {...props}>
      <primitive object={mesh} dispose={null} />
    </group>
  );
});
