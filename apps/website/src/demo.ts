import { fontAsset, textureAsset } from "@threeframe/core";
import { inkSourceAsset } from "@threeframe/ink";
import { spineAsset } from "@threeframe/spine";
import type { GameDefinition } from "@threeframe/engine";
import source from "./story.ink?raw";

export { source };
export const valley = textureAsset("/assets/valley.svg");
export const tower = textureAsset("/assets/tower.svg");
export const storyFont = fontAsset("Lora", "/assets/fonts/Lora.ttf");
export const spineboy = spineAsset({
  skeleton: "/assets/spineboy/spineboy-pro.json",
  atlas: "/assets/spineboy/spineboy.atlas",
});
export const spineboyBinary = spineAsset({
  skeleton: "/assets/spineboy/spineboy-pro.skel",
  atlas: "/assets/spineboy/spineboy.atlas",
  format: "binary",
});
export const speakers = {
  scout: { name: "The traveler", color: "#eabd78" },
  keeper: { name: "The keeper", color: "#99d2c4" },
  narrator: { name: "The valley", color: "#a4bbcb" },
};
export function createDemo(story = source): GameDefinition {
  return {
    id: "the-last-light",
    title: "The last light",
    story: inkSourceAsset("the-last-light", story),
    initialScene: "valley",
    assets: [storyFont],
    characters: {
      scout: { asset: spineboy, animation: "idle" },
      keeper: { asset: spineboy, animation: "idle" },
    },
    scenes: {
      valley: {
        background: valley,
        characters: [{ id: "scout", position: [-185, -190, 0], scale: 0.62 }],
      },
      tower: {
        background: tower,
        characters: [
          { id: "scout", position: [-255, -190, 0], scale: 0.6 },
          { id: "keeper", position: [280, -175, -1], scale: 0.54, flipX: true },
        ],
      },
    },
  };
}
