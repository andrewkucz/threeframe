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
 * Steps the skeleton has no animation for are skipped, so skeletons that share a rig (a character
 * drawn from several angles) can share its transitions. Returns the entry for `animation`.
 */
export function playAnimation(
  state: AnimationState,
  track: number,
  animation: string,
  loop = true,
  transitions?: readonly SpineTransition[],
): TrackEntry {
  const skeleton = state.data.skeletonData;
  const via = transitionPath(transitions, state.getTrack(track)?.animation?.name, animation).filter(
    (name) => !!skeleton.findAnimation(name),
  );
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

/**
 * Animations held while a skin is worn, by skin name or skin folder: a chest rope holds the arms
 * behind the back with `{ "accessories/chestbind": "pose/behind-back" }`.
 */
export type SpineHolds = Readonly<Record<string, string>>;

/** The animations `holds` holds for the worn skins (matched by full name or by folder). */
export function heldAnimations(
  holds: SpineHolds | undefined,
  skin: string | readonly string[] | null | undefined,
): string[] {
  const names = skin == null ? [] : typeof skin === "string" ? [skin] : skin;
  const held = new Set<string>();
  for (const [key, animation] of Object.entries(holds ?? {})) {
    const folder = `${key.replace(/\/$/, "")}/`;
    if (names.some((name) => name === key || name.startsWith(folder))) held.add(animation);
  }
  return [...held];
}

/** An animation's editor folder with a trailing slash (`pose/` for `pose/crossed`), or "". */
const folderOf = (name: string) => name.slice(0, name.lastIndexOf("/") + 1);

/**
 * Applies held animations to a list of animation names (e.g. the overlay tracks): each held
 * animation replaces the animations in its folder, or is added at the end when none is playing.
 */
export function applyHolds(animations: readonly string[], held: readonly string[]): string[] {
  const result = [...animations];
  for (const animation of held) {
    const folder = folderOf(animation);
    const index = result.findIndex((name) =>
      folder ? folderOf(name) === folder : name === animation,
    );
    if (index >= 0) result[index] = animation;
    else result.push(animation);
  }
  return result;
}
