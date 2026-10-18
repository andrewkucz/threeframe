import { describe, expect, it } from "vite-plus/test";
import { applyStageTags, collectGameAssets, initialStage, type GameDefinition } from "../src/stage";

const story = { key: "story", load: async () => "{}" };
const game: GameDefinition = {
  id: "test",
  title: "Test",
  story,
  initialScene: "forest",
  scenes: { forest: {}, tower: {} },
  characters: {
    hero: {
      asset: {
        key: "hero",
        load: async () => {
          throw new Error("Unused in this test");
        },
      },
    },
  },
  assets: [story],
};
describe("stage composition", () => {
  it("applies ordered scene and character cues without mutating previous state", () => {
    const previous = initialStage(game);
    const next = applyStageTags(game, previous, [
      "speaker:hero",
      "scene:tower",
      "animation:hero:walk",
      "hide:hero",
    ]);
    expect(next).toEqual({
      scene: "tower",
      characters: { hero: { animation: "walk", visible: false } },
    });
    expect(previous).toEqual({ scene: "forest", characters: {} });
    expect(applyStageTags(game, next, ["show:hero"]).characters.hero.visible).toBe(true);
  });
  it("reports unknown references and deduplicates the complete asset manifest", () => {
    expect(() => applyStageTags(game, initialStage(game), ["scene:missing"])).toThrow(
      "Unknown scene",
    );
    expect(() => applyStageTags(game, initialStage(game), ["hide:missing"])).toThrow(
      "Unknown character",
    );
    expect(() => collectGameAssets({ ...game, initialScene: "missing" })).toThrow("Initial scene");
    expect(collectGameAssets(game).map((asset) => asset.key)).toEqual(["story", "hero"]);
  });
});
