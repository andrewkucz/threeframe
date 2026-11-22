import { describe, expect, it } from "vite-plus/test";
import {
  choiceMarkerFormats,
  formatChoiceMarker,
  resolveDialogueStyle,
} from "../src/dialogueStyle";
import {
  defineDialoguePreset,
  dialoguePresets,
  mergeDialogueOptions,
  resolveDialoguePreset,
} from "../src/presets";

describe("dialogue presets", () => {
  it("ships ten JSON-serializable presets that resolve to concrete styles", () => {
    const entries = Object.entries(dialoguePresets);
    expect(entries).toHaveLength(10);
    for (const [, preset] of entries) {
      expect(JSON.parse(JSON.stringify(preset))).toEqual(preset);
      expect(() => resolveDialogueStyle(preset)).not.toThrow();
    }
  });

  it("resolves names and objects, and rejects unknown names", () => {
    expect(resolveDialoguePreset("noir")).toBe(dialoguePresets.noir);
    const custom = defineDialoguePreset({ width: 500 });
    expect(resolveDialoguePreset(custom)).toBe(custom);
    expect(resolveDialoguePreset(undefined)).toEqual({});
    expect(() => resolveDialoguePreset("nope" as "noir")).toThrow('Unknown dialogue preset "nope"');
  });
});

describe("mergeDialogueOptions", () => {
  it("merges nested parts key by key, with later layers winning", () => {
    const merged = mergeDialogueOptions(
      { theme: { accentColor: "#111", radius: 4 }, choiceMenu: { hover: { color: "#222" } } },
      { theme: { radius: 8 }, choiceMenu: { hover: { markerColor: "#333" } } },
    );
    expect(merged).toEqual({
      theme: { accentColor: "#111", radius: 8 },
      choiceMenu: { hover: { color: "#222", markerColor: "#333" } },
    });
  });

  it("replaces arrays, functions, and false, and lets an object re-enable a hidden part", () => {
    const page = (p: number) => String(p);
    const merged = mergeDialogueOptions<Record<string, unknown>>(
      { position: [0, 1, 2], panel: false, nameplate: { placement: "border" }, labels: {} },
      { position: [5, 5, 5], panel: { radius: 3 }, nameplate: false, labels: { page } },
    );
    expect(merged.position).toEqual([5, 5, 5]);
    expect(merged.panel).toEqual({ radius: 3 });
    expect(merged.nameplate).toBe(false);
    expect((merged.labels as { page: unknown }).page).toBe(page);
  });

  it("ignores undefined and never mutates its inputs", () => {
    const base: { theme: { radius?: number } } = { theme: { radius: 4 } };
    const merged = mergeDialogueOptions(base, { theme: { radius: undefined } }, undefined);
    expect(merged).toEqual({ theme: { radius: 4 } });
    expect(merged.theme).not.toBe(base.theme);
  });
});

describe("choice marker formats", () => {
  const choice = { index: 0, text: "", tags: [] };
  it("formats named styles and custom functions", () => {
    expect(choiceMarkerFormats.letters(27)).toBe("AA");
    expect(choiceMarkerFormats.roman(14)).toBe("XIV");
    expect(formatChoiceMarker("padded", 3, choice)).toBe("03");
    expect(formatChoiceMarker((n) => `#${n}`, 2, choice)).toBe("#2");
  });
});
