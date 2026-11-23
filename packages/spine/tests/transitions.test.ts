import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  Skeleton,
  SkeletonJson,
  TextureAtlas,
} from "@esotericsoftware/spine-threejs";
import { describe, expect, it } from "vite-plus/test";
import { playAnimation, transitionPath, type SpineTransition } from "../src/transitions";

// Held poses (one key, no duration) and a 0.4 second transition animation between two of them.
const hold = (value: number) => ({ bones: { arm: { rotate: [{ value }] } } });
const data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(""))).readSkeletonData({
  skeleton: { spine: "4.3.0" },
  bones: [{ name: "root" }, { name: "arm", parent: "root" }],
  animations: {
    "pose/side": hold(0),
    "pose/crossed": hold(90),
    "pose/back": hold(-45),
    "side-to-back": {
      bones: { arm: { rotate: [{}, { time: 0.4, value: -45 }] } },
    },
  },
});
const transitions: SpineTransition[] = [
  ["pose/side", "pose/back", ["side-to-back"]],
  ["pose/crossed", "pose/back", ["pose/side", "side-to-back"]],
];

const skeleton = new Skeleton(data);
function stateWith(mix: number, start: string) {
  const stateData = new AnimationStateData(data);
  stateData.defaultMix = mix;
  const state = new AnimationState(stateData);
  state.setAnimation(1, start, true);
  advance(state, 1);
  return state;
}
/** Advances and applies the state, as a sprite does every frame. */
function advance(state: AnimationState, seconds: number) {
  state.update(seconds);
  state.apply(skeleton);
}
/** The animations queued on a track, current first, with each one's delay. */
function queued(state: AnimationState, track: number) {
  const entries = [];
  for (let entry = state.getTrack(track); entry; entry = entry.next)
    entries.push({ name: entry.animation!.name, loop: entry.loop, delay: entry.delay });
  return entries;
}

describe("transitionPath", () => {
  it("lists the animations between two others, or none", () => {
    expect(transitionPath(transitions, "pose/crossed", "pose/back")).toEqual([
      "pose/side",
      "side-to-back",
    ]);
    expect(transitionPath(transitions, "pose/back", "pose/crossed")).toEqual([]);
    expect(transitionPath(transitions, undefined, "pose/back")).toEqual([]);
    expect(transitionPath(transitions, "pose/back", "pose/back")).toEqual([]);
    expect(transitionPath(undefined, "pose/side", "pose/back")).toEqual([]);
  });
});

describe("playAnimation", () => {
  it("sets the animation directly when no transition is listed", () => {
    const state = stateWith(0.2, "pose/back");
    const entry = playAnimation(state, 1, "pose/side", true, transitions);
    expect(state.getTrack(1)).toBe(entry);
    expect(queued(state, 1)).toEqual([{ name: "pose/side", loop: true, delay: 0 }]);
  });

  it("queues each step after the previous one is mixed in and has played", () => {
    const state = stateWith(0.2, "pose/crossed");
    const entry = playAnimation(state, 1, "pose/back", true, transitions);
    const steps = queued(state, 1);
    expect(steps.map(({ name, loop }) => [name, loop])).toEqual([
      ["pose/side", false],
      ["side-to-back", false],
      ["pose/back", true],
    ]);
    // A held pose waits for its mix; a transition animation for its duration.
    expect(steps[1].delay).toBeCloseTo(0.2);
    expect(steps[2].delay).toBeCloseTo(0.4);
    expect(entry.animation!.name).toBe("pose/back");
  });

  it("reaches the target after the steps play out", () => {
    const state = stateWith(0.2, "pose/side");
    playAnimation(state, 1, "pose/back", true, transitions);
    expect(state.getTrack(1)!.animation!.name).toBe("side-to-back");
    advance(state, 0.3);
    expect(state.getTrack(1)!.animation!.name).toBe("side-to-back");
    // Spine starts the next entry on the first update after the previous frame passed its delay.
    advance(state, 0.2);
    advance(state, 1 / 60);
    expect(state.getTrack(1)!.animation!.name).toBe("pose/back");
    // The transition ended on the target pose, so nothing jumps while the mix finishes.
    advance(state, 0.3);
    expect(skeleton.findBone("arm")!.pose.rotation).toBeCloseTo(-45);
  });
});
