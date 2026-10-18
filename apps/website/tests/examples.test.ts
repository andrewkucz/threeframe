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
      sceneHost({ background: false, font: false, fit: "cover" }),
    ]) {
      const result = await transformWithOxc(source, "Setup.tsx");
      expect(result.code).toBeTruthy();
    }
  });
});
