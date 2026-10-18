/** Serializes values, never evaluates user-authored code. */
class Expression {
  value: string;
  constructor(value: string) {
    this.value = value;
  }
}
export const code = (value: string) => new Expression(value);

export function printValue(value: unknown, depth = 0): string {
  if (value instanceof Expression) return value.value;
  if (value === undefined) return "undefined";
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    if (value.every((entry) => entry === null || typeof entry !== "object"))
      return `[${value.map((entry) => printValue(entry, depth)).join(", ")}]`;
    return `[\n${value.map((entry) => `${"  ".repeat(depth + 1)}${printValue(entry, depth + 1)}`).join(",\n")}\n${"  ".repeat(depth)}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return `{\n${entries.map(([key, entry]) => `${"  ".repeat(depth + 1)}${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${printValue(entry, depth + 1)}`).join(",\n")}\n${"  ".repeat(depth)}}`;
  }
  throw new Error("Example values must be serializable; use code() for explicit expressions.");
}

export function jsx(component: string, props: Record<string, unknown>) {
  const attributes = Object.entries(props).map(([key, value]) => {
    // JSX attribute literals do not interpret JavaScript escape sequences.
    const literal =
      typeof value === "string" &&
      JSON.stringify(value) === `"${value}"` &&
      !/[&<>{}]/u.test(value);
    return `  ${key}=${literal ? JSON.stringify(value) : `{${printValue(value, 1)}}`}`;
  });
  return `<${component}\n${attributes.join("\n")}\n/>`;
}

export function componentExample(imports: string, body: string) {
  return `${imports}\n\nexport default function Example() {\n  return (\n${body
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")}\n  );\n}`;
}

export interface ExampleFile {
  name: string;
  source: string;
  language?: "tsx" | "ink";
}
export interface PropDoc {
  name: string;
  type: string;
  defaultValue: string;
  description: string;
  example?: string;
}

export const sharedAssets = `import { fontAsset, textureAsset } from "@threeframe/core";

export const valley = textureAsset("/assets/valley.svg");
export const tower = textureAsset("/assets/tower.svg");
export const storyFont = fontAsset("Lora", "/assets/fonts/Lora.ttf");
export const speakers = {
  scout: { name: "The traveler", color: "#eabd78" },
  keeper: { name: "The keeper", color: "#99d2c4" },
  narrator: { name: "The valley", color: "#a4bbcb" },
};`;

export function spineAssets(binary: boolean) {
  return `${sharedAssets}\n\nimport { spineAsset } from "@threeframe/spine";\n\nexport const spineboy = spineAsset(${printValue({ skeleton: `/assets/spineboy/spineboy-pro.${binary ? "skel" : "json"}`, atlas: "/assets/spineboy/spineboy.atlas", format: binary ? "binary" : "json" })});`;
}

export function sceneHost({
  background = true,
  font = true,
  fit = "contain",
}: { background?: boolean; font?: boolean; fit?: "contain" | "cover" } = {}) {
  return `import { Suspense } from "react";
import { AssetProvider, SceneCanvas, useOwnedAssetStore${background ? ", Backdrop" : ""}${font ? ", useAsset" : ""} } from "@threeframe/core";
${background || font ? `import { ${[background && "valley", font && "storyFont"].filter(Boolean).join(", ")} } from "./assets";\n` : ""}import Example from "./Example";

function Scene() {${font ? "\n  useAsset(storyFont); // Wait for the font before measuring text." : ""}
  return (
    <>
      ${background ? "<Backdrop asset={valley} />\n      " : ""}<Example />
    </>
  );
}

export default function App() {
  const store = useOwnedAssetStore();
  return (
    <div style={{ aspectRatio: "16 / 9" }}>
      <AssetProvider store={store}>
        <SceneCanvas width={1280} height={720} fit="${fit}">
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </SceneCanvas>
      </AssetProvider>
    </div>
  );
}`;
}

export const gameSetup = `${spineAssets(false)}

import { inkSourceAsset } from "@threeframe/ink";
import type { GameDefinition } from "@threeframe/engine";
import source from "./story.ink?raw";

export const game: GameDefinition = {
  id: "the-last-light",
  title: "The last light",
  story: inkSourceAsset("the-last-light", source),
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
};`;
