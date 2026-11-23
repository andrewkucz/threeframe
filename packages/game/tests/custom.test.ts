import { describe, expect, it } from "vite-plus/test";
import {
  checkCustomScene,
  lineStory,
  resolveSceneProps,
  type CustomSceneType,
} from "../src/custom";
import { formatDirective, parseDirective } from "../src/directives";
import { createManifest, validateManifest, type GameManifest } from "../src/manifest";
import { packageFromFiles } from "../src/package";
import { memoryPersister } from "../src/saves";
import { GameSession, type GameEvent } from "../src/session";
import { InkController } from "@threeframe/ink";

const lockpick: CustomSceneType = {
  id: "lockpick",
  name: "Lockpicking",
  props: {
    pins: { type: "number", default: 4, min: 1, max: 8 },
    helper: { type: "character", optional: true },
  },
  outcomes: ["won", "lost"],
  externals: ["reveal_pin()", "pins_left()"],
  knots: ["intro", "hint"],
};

const manifest: GameManifest = createManifest({
  id: "custom-demo",
  title: "Custom demo",
  state: {
    variables: {
      picks: { type: "number", default: 3, min: 0 },
      trust: { type: "number", default: 2 },
      opened: { type: "boolean", default: false },
    },
  },
  characters: { ada: { name: "Ada", sprite: { skeleton: "ada.json", atlas: "ada.atlas" } } },
  gameOverWhen: "trust <= 0",
  levels: [
    {
      id: "one",
      scenes: [
        {
          id: "lock",
          kind: "custom",
          component: "lockpick",
          script: "lock.ink",
          props: { pins: 12, helper: "ada" },
          cast: [{ id: "ada", at: "left" }],
          outcomes: {
            won: { set: { opened: true }, next: "inside" },
            lost: { add: { trust: -1 }, next: "outside" },
          },
        },
        { id: "outside", script: "outside.ink" },
        { id: "inside", script: "inside.ink" },
      ],
    },
    { id: "two", scenes: [{ id: "bare", kind: "custom", component: "lockpick" }] },
  ],
});

const files = {
  "lock.ink": `=== intro ===
The lock is old. # speaker:ada
>>> anim ada smile
Only {pins_left()} pins. # speaker:ada
-> DONE
=== hint ===
* [Ask for a hint]
  ~ reveal_pin()
  ~ trust += 1
  Try the third one. # speaker:ada
* [Give up]
  >>> end_scene lost
- -> DONE
`,
  "outside.ink": "Locked out.\n-> END\n",
  "inside.ink": 'Inside, {outcome("lock")}.\n-> END\n',
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await tick();
  expect(check()).toBe(true);
};

function setup(customScenes: CustomSceneType[] = [lockpick]) {
  const session = new GameSession(packageFromFiles(manifest, files), {
    saves: { persister: memoryPersister() },
    customScenes,
  });
  const events: GameEvent[] = [];
  session.onEvent((event) => events.push(event));
  return { session, events };
}

/** Advances the conversation on screen until it ends, choosing `choice` at menus. */
async function readTalk(session: GameSession, choice = 0) {
  const id = session.getSnapshot().custom?.talkId;
  for (let i = 0; i < 50; i++) {
    const custom = session.getSnapshot().custom;
    const talk = custom?.talk;
    if (!talk || custom.talkId !== id) return;
    const story = talk.getSnapshot();
    if (story.status === "choice") talk.choose(story.choices[choice].index);
    else if (story.status !== "waiting") talk.advance();
    await tick();
  }
}

describe("custom scene manifests", () => {
  it("validates custom scenes and outcome wiring", () => {
    expect(validateManifest(manifest)).toEqual([]);
    const broken = createManifest({
      id: "x",
      title: "X",
      state: { variables: { flag: { type: "boolean", default: false } } },
      levels: [
        {
          id: "one",
          scenes: [
            { id: "a", kind: "custom", outcomes: { won: { next: "nowhere", add: { flag: 1 } } } },
            { id: "b", kind: "custom", component: "x", outcomes: { done: { flow: "explode" } } },
            { id: "c", kind: "ink" },
          ],
        },
      ],
    } as never);
    const paths = validateManifest(broken).map((issue) => issue.path);
    expect(paths).toEqual([
      "levels.0.scenes.0.component",
      "levels.0.scenes.0.outcomes.won.next",
      "levels.0.scenes.0.outcomes.won.add.flag",
      "levels.0.scenes.1.outcomes.done.flow",
      "levels.0.scenes.2.script",
    ]);
  });

  it("checks props against the component's schema", () => {
    const scene = manifest.levels[0].scenes[0];
    expect(checkCustomScene(scene, lockpick, manifest).map((issue) => issue.path)).toEqual([
      "props.pins",
    ]);
    expect(
      checkCustomScene(
        { ...scene, props: { helper: "zed", extra: 1 }, outcomes: { escaped: {} } },
        lockpick,
        manifest,
      ).map((issue) => issue.message),
    ).toEqual([
      "Unknown character: zed",
      'Lockpicking has no setting "extra".',
      'Lockpicking never ends with "escaped" (it reports won, lost).',
    ]);
    expect(checkCustomScene(scene, undefined, manifest)[0].path).toBe("component");
    expect(resolveSceneProps(lockpick, { pins: 12 })).toEqual({ pins: 8 });
  });

  it("formats directives that parse back to the same parts", () => {
    const text = formatDirective("show", ["ada"], {
      at: "left",
      label: 'a "big" door',
      no: undefined,
    });
    expect(text).toBe('show ada at=left label="a \\"big\\" door"');
    expect(parseDirective(text)).toMatchObject({
      name: "show",
      args: ["ada"],
      options: { at: "left", label: 'a "big" door' },
    });
  });

  it("builds stories for plain lines", () => {
    const controller = new InkController(
      lineStory([{ speaker: "ada", text: "Hi {there} #1" }, { text: "Bye." }]),
    );
    controller.start();
    expect(controller.getSnapshot()).toMatchObject({ text: "Hi {there} #1", speaker: "ada" });
    controller.advance();
    expect(controller.getSnapshot()).toMatchObject({ text: "Bye.", speaker: null });
    controller.advance();
    expect(controller.getSnapshot().status).toBe("ended");
  });
});

describe("custom scenes", () => {
  it("runs without starting its script and plays knots as conversations", async () => {
    const { session, events } = setup();
    await session.playScene("lock");
    const snapshot = session.getSnapshot();
    const handle = snapshot.custom!.handle;
    expect(handle.props).toEqual({ pins: 8, helper: "ada" });
    expect(snapshot.controller!.getSnapshot().status).toBe("idle");
    expect(snapshot.stage.characters.ada.visible).toBe(true);

    let left = 3;
    handle.provide("pins_left", () => left);
    const done = handle.dialogue("intro");
    await tick();
    const talk = session.getSnapshot().custom!.talk!;
    expect(talk).toBe(snapshot.controller);
    expect(talk.getSnapshot()).toMatchObject({ text: "The lock is old.", speaker: "ada" });
    expect(handle.talking).toBe(true);
    talk.advance();
    expect(talk.getSnapshot().text).toBe("Only 3 pins.");
    // Directives in knots run as usual.
    expect(session.getSnapshot().stage.characters.ada.animation).toBe("smile");
    left = 1;
    talk.advance();
    await expect(done).resolves.toBe(true);
    expect(session.getSnapshot().custom!.talk).toBeNull();
    expect(session.getSnapshot().phase).toBe("playing");
    expect(events.some((event) => event.type === "scene-end")).toBe(false);
  });

  it("queues conversations, binds externals and syncs variables", async () => {
    const { session } = setup();
    await session.playScene("lock");
    const handle = session.getSnapshot().custom!.handle;
    let revealed = 0;
    handle.provide("reveal_pin", () => {
      revealed++;
    });
    const first = handle.say("ada", ["One.", "Two."]);
    const second = handle.dialogue("hint");
    await tick();
    expect(session.getSnapshot().custom!.talk!.getSnapshot().text).toBe("One.");
    await readTalk(session);
    await expect(first).resolves.toBe(true);
    await tick();
    expect(session.getSnapshot().custom!.talk!.getSnapshot().status).toBe("choice");
    await readTalk(session, 0);
    await expect(second).resolves.toBe(true);
    expect(revealed).toBe(1);
    expect(session.getVariable("trust")).toBe(3);
  });

  it("follows outcome wiring when completed", async () => {
    const { session, events } = setup();
    await session.playScene("lock");
    session.getSnapshot().custom!.handle.complete("won", { time: 12 });
    await until(() => session.getSnapshot().scene?.id === "inside");
    expect(session.getVariable("opened")).toBe(true);
    expect(session.getSnapshot().progress.outcomes).toEqual({ lock: "won" });
    expect(session.getSnapshot().custom).toBeNull();
    expect(events.find((event) => event.type === "outcome")).toMatchObject({
      outcome: "won",
      data: { time: 12 },
    });
    await until(() => session.getSnapshot().controller?.getSnapshot().text === "Inside, won.");
  });

  it("lets the script end the scene with an outcome", async () => {
    const { session } = setup();
    await session.playScene("lock");
    const handle = session.getSnapshot().custom!.handle;
    const talk = handle.dialogue("hint");
    await tick();
    await readTalk(session, 1);
    await expect(talk).resolves.toBe(false);
    await until(() => session.getSnapshot().scene?.id === "outside");
    expect(session.getVariable("trust")).toBe(1);
    // The old handle is inert now.
    handle.setVariable("trust", 9);
    expect(session.getVariable("trust")).toBe(1);
    await expect(handle.dialogue("intro")).resolves.toBe(false);
  });

  it("loses the game when an outcome's changes trigger game over", async () => {
    const { session } = setup();
    await session.playScene("lock", { trust: 1 });
    session.getSnapshot().custom!.handle.complete("lost");
    await until(() => session.getSnapshot().phase === "game-over");
  });

  it("continues to the next scene for unwired outcomes and warns about undeclared ones", async () => {
    const { session, events } = setup();
    await session.playScene("lock");
    session.getSnapshot().custom!.handle.complete("escaped");
    await until(() => session.getSnapshot().scene?.id === "outside");
    expect(
      events.some((event) => event.type === "warning" && /undeclared/.test(event.message)),
    ).toBe(true);
  });

  it("restarts unless it saves state, and restores saved state", async () => {
    const { session } = setup();
    await session.playScene("lock");
    const handle = session.getSnapshot().custom!.handle;
    handle.setState("hover", 2);
    expect(session.createSave().scene).toBeUndefined();
    handle.setState("lock", { set: [0, 2] }, { save: true });
    void handle.directive("hide ada");
    const save = session.createSave();
    expect(save.scene).toMatchObject({ scene: "lock", custom: { lock: { set: [0, 2] } } });

    const fresh = setup().session;
    await fresh.load(JSON.parse(JSON.stringify(save)) as typeof save);
    const restored = fresh.getSnapshot().custom!.handle;
    expect(restored.restored).toBe(true);
    expect(restored.getState("lock")).toEqual({ set: [0, 2] });
    expect(restored.hasState("hover")).toBe(false);
    expect(fresh.getSnapshot().stage.characters.ada.visible).toBe(false);
  });

  it("plays without a registered component or a script", async () => {
    const { session, events } = setup([]);
    await session.playScene("bare");
    const handle = session.getSnapshot().custom!.handle;
    expect(handle.type).toBeNull();
    expect(session.getSnapshot().controller).toBeNull();
    await expect(handle.dialogue("intro")).resolves.toBe(false);
    expect(events.filter((event) => event.type === "warning")).toHaveLength(2);
    handle.complete();
    await until(() => session.getSnapshot().phase === "level-complete");
  });

  it("reports a missing knot without stopping", async () => {
    const { session, events } = setup();
    await session.playScene("lock");
    await expect(session.getSnapshot().custom!.handle.dialogue("nope")).resolves.toBe(false);
    expect(events.some((event) => event.type === "warning" && /nope/.test(event.message))).toBe(
      true,
    );
    expect(session.getSnapshot().custom!.talk).toBeNull();
  });
});
