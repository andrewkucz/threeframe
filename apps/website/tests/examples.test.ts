import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vite-plus/test";
import { transformWithOxc } from "vite-plus";
import {
  code,
  componentExample,
  gameSetup,
  jsx,
  printValue,
  sceneHost,
  sharedAssets,
  spineAssets,
} from "../src/docs/examples";
import { dialoguePresets as libraryPresets } from "@threeframe/ink";
import { dialoguePresets, presetSettings } from "../src/docs/dialoguePresets";
import {
  dialogueControlVisible,
  dialogueDefaults,
  dialogueProps,
  exportDialoguePreset,
  flattenDialoguePreset,
  gridColors,
  parseDialoguePreset,
  presetControls,
} from "../src/docs/options";

// Compile and execute the generated JSX with a tiny element factory. This checks
// the values a consumer actually receives after copying a snippet into an app.
async function propsFromExample(props: Record<string, unknown>) {
  const source = componentExample("", jsx("Demo", props));
  const result = await transformWithOxc(source, "Example.tsx", {
    jsx: { runtime: "classic", pragma: "element" },
  });
  return runInNewContext(
    `${result.code.replace("export default ", "")}\nExample();`,
    { element: (_component: unknown, attributes: unknown) => attributes, Demo: () => null },
    { timeout: 1000 },
  );
}

describe("copyable component examples", () => {
  it("preserves numeric, boolean, optional and nested control values", async () => {
    const props = {
      paused: false,
      speed: 0,
      scene: undefined,
      choices: [],
      theme: { fontFamily: "Lora", fontSize: 27, color: "#abcdef" },
      position: [0, -220, 100],
    };
    expect(await propsFromExample(props)).toEqual(props);
  });

  it.each([
    'A "quoted" line & a <tag> {with braces}.',
    "first\nsecond\r\nthird\tindented\u0000end",
    "A slash \\ and a literal \\n. 🌙",
    '</code><script>alert("never executed")</script>',
  ])("preserves editable dialogue text: %s", async (text) => {
    expect(await propsFromExample({ text })).toEqual({ text });
  });

  it("keeps explicit expressions executable while treating user text as data", async () => {
    const props = await propsFromExample({
      onChoose: code("(index) => index + 1"),
      text: "() => alert(1)",
    });
    expect(props.onChoose(3)).toBe(4);
    expect(props.text).toBe("() => alert(1)");
  });

  it("quotes object keys that are not valid identifiers", async () => {
    const theme = { "1st-speaker": { name: "First" }, "with space": "#fff" };
    expect(await propsFromExample({ theme })).toEqual({ theme });
    expect(() => printValue(() => null)).toThrow("serializable");
  });

  it("produces valid setup modules for all component hosts and asset formats", async () => {
    for (const source of [
      sharedAssets,
      spineAssets(false),
      spineAssets(true),
      gameSetup,
      sceneHost(),
      sceneHost({ font: false }),
      sceneHost({ background: "grid" }),
      sceneHost({ background: "tower", font: false }),
      sceneHost({ background: false, font: false, fit: "cover" }),
    ]) {
      const result = await transformWithOxc(source, "Setup.tsx");
      expect(result.code).toBeTruthy();
    }
  });
});

describe("dialogue controls", () => {
  it("start at the package defaults, so the default example passes no styling props", () => {
    expect(dialogueProps(dialogueDefaults)).toEqual({});
  });

  it("collapses hidden parts to false and hides their controls", () => {
    const settings = {
      ...dialogueDefaults,
      choiceMenu: false,
      "choiceMenu.columns": 2,
      "nameplate.placement": "border",
    };
    const props = dialogueProps(settings);
    expect(props.choiceMenu).toBe(false);
    expect(props.nameplate).toEqual({ placement: "border" });
    expect(dialogueControlVisible("choiceMenu.columns", settings)).toBe(false);
    expect(dialogueControlVisible("choiceMenu", settings)).toBe(true);
  });

  it("diffs against a preset, re-enabling parts the preset hid", () => {
    const base = presetSettings("subtitles");
    const props = dialogueProps({ ...base, panel: true, "theme.fontSize": 25 }, base);
    expect(props).toEqual({ panel: {}, theme: { fontSize: 25 } });
  });

  it("emits copyable JSX for named marker formats", async () => {
    const settings = { ...dialogueDefaults, "labels.choiceMarker": "letters" };
    const props = await propsFromExample(dialogueProps(settings));
    expect(props.labels.choiceMarker).toBe("letters");
  });
});

describe("dialogue presets", () => {
  it("lists every library preset once", () => {
    expect(dialoguePresets.map((preset) => preset.id).sort()).toEqual(
      Object.keys(libraryPresets).sort(),
    );
  });

  it.each(Object.entries(libraryPresets))(
    "%s is fully representable by the controls and round-trips exactly",
    (id, preset) => {
      const { settings, warnings } = flattenDialoguePreset(preset as Record<string, unknown>);
      expect(warnings).toEqual([]);
      expect(Object.keys(settings).sort()).toEqual(presetControls.map((spec) => spec.key).sort());
      // Controls → props reproduces the library preset, so the preview is the real preset.
      expect(dialogueProps(settings)).toEqual(preset);
      const exported = parseDialoguePreset(exportDialoguePreset(settings, id));
      expect(exported.warnings).toEqual([]);
      expect(exported.name).toBe(id);
      expect(exported.settings).toEqual(settings);
    },
  );

  it("imports bare presets, reporting invalid and unsupported values", () => {
    const result = parseDialoguePreset(
      JSON.stringify({
        width: 5000,
        theme: { accentColor: 42, radius: 3 },
        nameplate: { placement: "border", surface: { radius: 99 } },
        bogus: 1,
      }),
    );
    expect(result.name).toBeNull();
    expect(result.settings.width).toBe(1160);
    expect(result.settings["theme.radius"]).toBe(3);
    expect(result.settings["theme.accentColor"]).toBe(dialogueDefaults["theme.accentColor"]);
    expect(result.settings["nameplate.placement"]).toBe("border");
    expect(result.settings.mode).toBeUndefined();
    expect(result.warnings).toHaveLength(4);
    expect(() => parseDialoguePreset("{ nope")).toThrow("Invalid JSON");
    expect(() => parseDialoguePreset("[]")).toThrow("object");
  });

  it("keeps grid lines subtle on light and dark stages", () => {
    expect(gridColors("#ffffff")[0]).not.toBe("#ffffff");
    expect(gridColors("#000000")[0]).not.toBe("#000000");
  });
});
