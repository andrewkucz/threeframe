import type { AnimationState, TrackEntry } from "@esotericsoftware/spine-threejs";

/**
 * Animations a track plays on its way from one animation to another, in order: poses to pass
 * through (uncrossing the arms before putting them behind the back) or transition animations
 * (`run-to-idle`).
 */
export type SpineTransition = readonly [from: string, to: string, via: readonly string[]];

/** The animations to play before `to` when a track switches from `from`. */
export function transitionPath(
  transitions: readonly SpineTransition[] | undefined,
  from: string | undefined,
  to: string,
): readonly string[] {
  if (!from || from === to) return [];
  return transitions?.find(([a, b]) => a === from && b === to)?.[2] ?? [];
}

/**
 * Sets `animation` on a track, first playing any `transitions` from the animation the track is
 * playing now. Each step is fully mixed in and played to its end before the next one starts.
 * Returns the entry for `animation`.
 */
export function playAnimation(
  state: AnimationState,
  track: number,
  animation: string,
  loop = true,
  transitions?: readonly SpineTransition[],
): TrackEntry {
  const via = transitionPath(transitions, state.getTrack(track)?.animation?.name, animation);
  if (!via.length) return state.setAnimation(track, animation, loop);
  let entry = state.setAnimation(track, via[0], false);
  for (const [i, name] of [...via.slice(1), animation].entries()) {
    const duration = entry.animationEnd - entry.animationStart;
    // Delays count from the previous entry's start; a tiny one stands in for 0, which Spine reads
    // as "when the previous entry completes, minus the mix".
    const delay = Math.max(entry.mixDuration, duration, 1e-4);
    entry = state.addAnimation(track, name, i === via.length - 1 ? loop : false, delay);
  }
  return entry;
}
