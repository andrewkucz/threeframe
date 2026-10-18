import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { compileInk } from "../src/compiler";
import { InkController, type NarrativeEvent } from "../src/controller";

const source = `VAR courage = 0
Hello traveler. # speaker:guide # scene:valley
Pick a road.
* [The mountain]
    ~ courage += 1
    -> mountain
* [The river]
    -> river
=== mountain ===
You climbed. Courage: {courage}. # speaker:guide
-> END
=== river ===
You sailed.
-> END
`;
let compiled: string;
beforeAll(async () => {
  compiled = await compileInk(source);
});

describe("InkController", () => {
  it("starts idempotently, surfaces tags, and waits for explicit input", () => {
    const controller = new InkController(compiled);
    const events: NarrativeEvent[] = [];
    controller.onEvent((event) => events.push(event));
    controller.start();
    controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      text: "Hello traveler.",
      speaker: "guide",
      lineId: 1,
      status: "playing",
    });
    expect(events.map((event) => event.type)).toEqual(["tags", "line"]);
    expect(controller.getSnapshot().tags).toContain("scene:valley");
  });

  it("branches, observes variables, rejects unavailable choices, and ends once", () => {
    const controller = new InkController(compiled);
    const observer = vi.fn();
    const end = vi.fn();
    controller.onEvent((event) => {
      if (event.type === "end") end();
    });
    controller.observeVariable("courage", observer);
    controller.start();
    controller.advance();
    expect(controller.getSnapshot().choices.map((choice) => choice.text)).toEqual([
      "The mountain",
      "The river",
    ]);
    controller.advance();
    expect(controller.getSnapshot().text).toBe("Pick a road.");
    expect(() => controller.choose(8)).toThrow("not available");
    controller.choose(0);
    expect(controller.getSnapshot().text).toBe("You climbed. Courage: 1.");
    expect(observer).toHaveBeenCalledWith("courage", 1);
    controller.advance();
    controller.advance();
    expect(controller.getSnapshot().status).toBe("ended");
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("restores displayed text, choices and runtime state without skipping a line", () => {
    const first = new InkController(compiled);
    first.start();
    first.advance();
    const save = first.save();
    first.choose(0);
    const second = new InkController(compiled);
    second.restore(JSON.parse(JSON.stringify(save)));
    expect(second.getSnapshot().text).toBe("Pick a road.");
    expect(second.getSnapshot().choices).toHaveLength(2);
    expect(second.getVariable("courage")).toBe(0);
    second.choose(1);
    expect(second.getSnapshot().text).toBe("You sailed.");
  });

  it("restores a terminal passage before acknowledging the end", () => {
    const controller = new InkController(compiled);
    controller.start();
    controller.advance();
    controller.choose(1);
    const save = controller.save();
    controller.advance();
    controller.restore(save);
    expect(controller.getSnapshot().status).toBe("playing");
    expect(controller.getSnapshot().text).toBe("You sailed.");
    controller.advance();
    expect(controller.getSnapshot().status).toBe("ended");
  });

  it("rejects incompatible saves before mutating the runtime", async () => {
    const controller = new InkController(compiled);
    controller.start();
    const other = new InkController(await compileInk("Different story.\n-> END"));
    expect(() => controller.restore(other.save())).toThrow("different story");
    expect(() => controller.restore({ ...controller.save(), ink: "not json" })).toThrow();
    expect(controller.getSnapshot().text).toBe("Hello traveler.");
    controller.advance();
    expect(controller.getSnapshot().choices).toHaveLength(2);
  });

  it("restarts variables and jumps to named knots", () => {
    const controller = new InkController(compiled);
    controller.setVariable("courage", 12);
    controller.jump("mountain");
    expect(controller.getSnapshot().text).toContain("12");
    controller.restart();
    expect(controller.getVariable("courage")).toBe(0);
    expect(controller.getSnapshot().text).toBe("Hello traveler.");
  });

  it("binds external functions before continuation and evaluates Ink functions", async () => {
    const json = await compileInk(
      "EXTERNAL twice(x)\nValue: {twice(4)}\n-> END\n=== function plus(x) ===\n~ return x + 1\n",
    );
    const callback = vi.fn((x: number) => x * 2);
    const controller = new InkController(json, {
      configure: (story) => story.BindExternalFunction("twice", callback),
    });
    controller.start();
    expect(controller.getSnapshot().text).toBe("Value: 8");
    expect(controller.evaluate("plus", [9])).toBe(10);
    expect(callback).toHaveBeenCalledWith(4);
  });

  it("supports choice-only starts and stops before displaying a decision", async () => {
    const controller = new InkController(await compileInk("* [Begin]\n  Started.\n  -> END"));
    controller.start();
    expect(controller.getSnapshot()).toMatchObject({ text: "", status: "choice" });
    controller.choose(0);
    expect(controller.getSnapshot().text).toBe("Started.");
  });

  it("reports compilation diagnostics", async () => {
    await expect(compileInk("-> missing_knot")).rejects.toThrow("missing_knot");
  });
});
