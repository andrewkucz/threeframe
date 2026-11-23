import { describe, expect, it } from "vite-plus/test";
import { compileInk, declareInkGlobals, inkIncludes, readInkIncludes } from "../src/compiler";
import { InkController, type InkCommand } from "../src/controller";

const source = `>>> backdrop hall
First line.
>>> wait 1 # cue
>>> show ada at=left
Second line.
-> END
`;

describe("command lines", () => {
  it("runs commands in order between passages without displaying them", async () => {
    const commands: InkCommand[] = [];
    const controller = new InkController(await compileInk(source), {
      onCommand: (command) => {
        commands.push(command);
      },
    });
    controller.start();
    expect(controller.getSnapshot().text).toBe("First line.");
    expect(commands.map((command) => command.text)).toEqual(["backdrop hall"]);
    controller.advance();
    expect(controller.getSnapshot().text).toBe("Second line.");
    expect(commands.map((command) => command.text)).toEqual([
      "backdrop hall",
      "wait 1",
      "show ada at=left",
    ]);
    expect(commands[1].tags).toEqual(["cue"]);
    expect(controller.getSnapshot().tags).toEqual([]);
  });

  it("holds the story while an asynchronous command runs, then continues on its own", async () => {
    let release = () => {};
    const controller = new InkController(await compileInk(source), {
      onCommand: (command) =>
        command.text.startsWith("wait")
          ? new Promise<void>((resolve) => (release = resolve))
          : undefined,
    });
    controller.start();
    controller.advance();
    expect(controller.getSnapshot()).toMatchObject({ status: "waiting", text: "First line." });
    controller.advance(); // ignored while waiting
    expect(controller.getSnapshot().status).toBe("waiting");
    release();
    await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({ status: "playing", text: "Second line." });
  });

  it("resumes a save taken mid-command after the command", async () => {
    const compiled = await compileInk(source);
    const first = new InkController(compiled, { onCommand: () => new Promise(() => {}) });
    first.start(); // waits on `backdrop hall`
    const save = first.save();
    expect(save.display.status).toBe("waiting");
    const second = new InkController(compiled);
    second.restore(save);
    expect(second.getSnapshot().text).toBe("First line.");
  });

  it("can be disabled or use another prefix", async () => {
    const plain = new InkController(await compileInk(source), { commandPrefix: false });
    plain.start();
    expect(plain.getSnapshot().text).toBe(">>> backdrop hall");
    const custom = new InkController(await compileInk("@ hello\nText.\n"), { commandPrefix: "@" });
    custom.start();
    expect(custom.getSnapshot().text).toBe("Text.");
  });
});

describe("compiler helpers", () => {
  it("declares host globals once, after the author's text", async () => {
    const story = "VAR coins = 1\n{coins} {lives} {visited(1)}\n-> END\n";
    const declared = declareInkGlobals(story, {
      variables: { coins: 0, lives: 3, name: 'A "hero"' },
      externals: ["visited(id)"],
    });
    expect(declared.startsWith(story)).toBe(true);
    expect(declared).not.toMatch(/VAR coins = 0/);
    expect(declared).toContain("VAR lives = 3");
    expect(declared).toContain('VAR name = "A \\"hero\\""');
    const controller = new InkController(await compileInk(declared), {
      configure: (inkStory) => inkStory.BindExternalFunction("visited", () => 7),
    });
    controller.start();
    expect(controller.getSnapshot().text).toBe("1 3 7");
  });

  it("resolves every INCLUDE relative to the main file, like ink", async () => {
    const files: Record<string, string> = {
      "story/chapters/one.ink": "INCLUDE shared.ink\n=== one ===\nOne {shared}.\n-> END\n",
      "story/shared.ink": "VAR shared = 5\n",
    };
    const main = "INCLUDE chapters/one.ink\n-> one\n";
    expect(inkIncludes(main)).toEqual(["chapters/one.ink"]);
    const includes = await readInkIncludes(main, "story/main.ink", async (path) => {
      if (!(path in files)) throw new Error(`missing ${path}`);
      return files[path];
    });
    expect(Object.keys(includes).sort()).toEqual(["story/chapters/one.ink", "story/shared.ink"]);
    const controller = new InkController(
      await compileInk(main, { includes, filename: "story/main.ink" }),
    );
    controller.start();
    expect(controller.getSnapshot().text).toBe("One 5.");
  });
});
