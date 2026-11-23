import { describe, expect, it } from "vite-plus/test";
import { checkCondition, evaluateCondition } from "../src/conditions";
import { createDirectiveRegistry, directiveReader, parseDirective } from "../src/directives";
import { lintScript } from "../src/lint";
import { createManifest, parseManifest, validateManifest } from "../src/manifest";
import { removeSkins, resolvePosition, wearSkins } from "../src/stage";

describe("directive grammar", () => {
  it("parses positional args, options, flags, quotes and numbers", () => {
    expect(parseDirective(`show ada at=left fade=0.5 wait name="Ada Lovelace" y=-20`)).toEqual({
      name: "show",
      args: ["ada", "wait"],
      options: { at: "left", fade: 0.5, name: "Ada Lovelace", y: -20 },
      source: `show ada at=left fade=0.5 wait name="Ada Lovelace" y=-20`,
    });
    const directive = parseDirective("Fade out duration=2 wait")!;
    expect(directive.name).toBe("fade");
    const read = directiveReader(directive);
    expect([read.arg(0), read.number("duration", 1), read.flag("wait"), read.flag("loop")]).toEqual(
      ["out", 2, true, false],
    );
    expect(parseDirective("  ")).toBeNull();
  });

  it("accepts the compact tag form", () => {
    expect(parseDirective("animation:hero:walk")).toMatchObject({
      name: "animation",
      args: ["hero", "walk"],
    });
    expect(parseDirective("speaker:ada")).toMatchObject({ name: "speaker", args: ["ada"] });
    // A colon inside an option value is not the compact form.
    expect(parseDirective("music file=a:b")).toMatchObject({
      name: "music",
      options: { file: "a:b" },
    });
  });
});

describe("conditions", () => {
  const context = {
    variables: { coins: 12, lives: 0, name: "Ada", cursed: false },
    completed: (id: string) => id === "cellar",
  };
  it("evaluates expressions and the JSON form", () => {
    expect(evaluateCondition("coins >= 10 && !cursed", context)).toBe(true);
    expect(evaluateCondition("lives > 0 || completed('cellar')", context)).toBe(true);
    expect(evaluateCondition('name == "Ada" && (coins < 5 || not cursed)', context)).toBe(true);
    expect(
      evaluateCondition(
        { all: [{ var: "coins", op: ">", value: 11 }, { completed: "cellar" }] },
        context,
      ),
    ).toBe(true);
    expect(evaluateCondition({ any: [{ var: "cursed" }, { not: true }] }, context)).toBe(false);
  });
  it("reports problems for editors", () => {
    expect(() => evaluateCondition("gold > 1", context)).toThrow("Unknown variable: gold");
    expect(checkCondition("coins >= && x", ["coins"])).not.toEqual([]);
    expect(checkCondition("coins > 1 && gold", ["coins"])).toEqual(["Unknown variable: gold"]);
    expect(checkCondition({ all: ["coins > 1", { var: "lives" }] }, ["coins", "lives"])).toEqual(
      [],
    );
  });
});

describe("stage helpers", () => {
  it("wears skins by folder and removes by name or folder", () => {
    const outfit = ["body/ada", "clothes/top/shirt1", "clothes/bottom/pants1"];
    expect(wearSkins(outfit, ["clothes/top/tank2", "hat"])).toEqual([
      "body/ada",
      "clothes/bottom/pants1",
      "clothes/top/tank2",
      "hat",
    ]);
    expect(removeSkins(outfit, ["clothes/top"])).toEqual(["body/ada", "clothes/bottom/pants1"]);
    expect(removeSkins(outfit, ["clothes/"])).toEqual(["body/ada"]);
  });
  it("resolves named positions against the design width", () => {
    const manifest = createManifest({
      id: "g",
      title: "G",
      stage: { width: 1000, positions: { door: 420 } },
    });
    expect(resolvePosition(manifest, "left")).toBeCloseTo(-240);
    expect(resolvePosition(manifest, "door")).toBe(420);
    expect(resolvePosition(manifest, "-15")).toBe(-15);
    expect(() => resolvePosition(manifest, "moon")).toThrow("Unknown stage position");
  });
});

const manifest = createManifest({
  id: "demo",
  title: "Demo",
  state: { variables: { coins: { type: "number", default: 0 } } },
  characters: { ada: { name: "Ada", sprite: { skeleton: "ada.json", atlas: "ada.atlas" } } },
  backdrops: { hall: { type: "color", color: "#222" } },
  levels: [
    {
      id: "one",
      scenes: [{ id: "intro", script: "intro.ink", backdrop: "hall", cast: [{ id: "ada" }] }],
    },
  ],
});

describe("manifest validation", () => {
  it("accepts a valid manifest and checks referenced files", () => {
    expect(validateManifest(manifest)).toEqual([]);
    expect(
      validateManifest(manifest, ["ada.json", "ada.atlas"]).map((issue) => issue.path),
    ).toEqual(["levels.0.scenes.0.script"]);
  });
  it("reports structural and reference errors together", () => {
    const broken = {
      ...manifest,
      formatVersion: 9,
      state: { variables: { "bad name": { type: "number", default: "x" } } },
      levels: [
        {
          id: "one",
          scenes: [
            { id: "a", script: "a.ink", backdrop: "nope", next: "zzz", cast: [{ id: "bob" }] },
          ],
        },
        { id: "one", scenes: [{ id: "a", script: "b.ink" }] },
      ],
    };
    const paths = validateManifest(broken).map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "formatVersion",
        "state.variables.bad name",
        "levels.0.scenes.0.backdrop",
        "levels.0.scenes.0.next",
        "levels.0.scenes.0.cast.0.id",
        "levels.1.id",
        "levels.1.scenes.0.id",
      ]),
    );
    expect(() => parseManifest(broken)).toThrow("Invalid game manifest");
  });
  it("checks sprite transitions", () => {
    const withTransitions = (transitions: unknown) =>
      validateManifest({
        ...manifest,
        characters: {
          ada: { name: "Ada", sprite: { skeleton: "ada.json", atlas: "ada.atlas", transitions } },
        },
      }).map((issue) => issue.path);
    expect(withTransitions([["pose/crossed", "pose/back", ["pose/side"]]])).toEqual([]);
    expect(withTransitions([["pose/crossed", "pose/back", "pose/side"]])).toEqual([
      "characters.ada.sprite.transitions",
    ]);
    expect(withTransitions({ "pose/crossed": "pose/back" })).toEqual([
      "characters.ada.sprite.transitions",
    ]);
  });
});

describe("script lint", () => {
  it("flags unknown directives and references with line and column", () => {
    const script = [
      ">>> show ada at=left",
      ">>> show bob",
      "Hello. # backdrop void # speaker:ada",
      "// >>> explode",
      ">>> explode now",
      ">>> add coins 1",
      ">>> set gems 2",
      "A tag that is just metadata. # mood_happy",
    ].join("\n");
    const diagnostics = lintScript(script, { manifest, directives: createDirectiveRegistry() });
    expect(
      diagnostics.map(({ line, column, severity, message }) => [line, column, severity, message]),
    ).toEqual([
      [2, 5, "warning", "Unknown character: bob"],
      [3, 10, "warning", "Unknown backdrop: void"],
      [5, 5, "warning", "Unknown directive: explode"],
      [7, 5, "warning", "Unknown variable: gems"],
      [8, 32, "info", "Unknown directive: mood_happy"],
    ]);
  });
});
