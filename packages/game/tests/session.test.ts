import { memorySource } from "@threeframe/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createManifest, validateManifest, type GameManifest } from "../src/manifest";
import { createGameArchive, loadGamePackage, packageFromFiles } from "../src/package";
import { AUTOSAVE_SLOT, SaveStore, memoryPersister, parseSave } from "../src/saves";
import { GameSession, type GameEvent } from "../src/session";

const manifest: GameManifest = createManifest({
  id: "demo",
  title: "Demo",
  version: "1.0.0",
  state: {
    variables: {
      coins: { type: "number", default: 0, min: 0, max: 100 },
      lives: { type: "number", default: 2 },
      brave: { type: "boolean", default: false },
    },
  },
  characters: {
    ada: {
      name: "Ada",
      skin: ["body/ada", "clothes/top/shirt1"],
      outfits: { gala: { skin: ["body/ada", "dress"], colors: { hair: "#000000" } } },
      colors: { skin: "#f5d8ab" },
      sprite: {
        skeleton: "ada.json",
        atlas: "ada.atlas",
        colorGroups: {
          skin: { slots: ["body"] },
          hair: { slots: ["hair"], presets: { blonde: "#c1b01c" } },
        },
      },
    },
  },
  backdrops: {
    hall: { type: "color", color: "#222" },
    yard: { type: "gradient", colors: ["#123", "#456"] },
  },
  gameOverWhen: "lives <= 0",
  credits: { title: "Thanks", sections: [{ lines: ["Made by someone"] }] },
  levels: [
    {
      id: "one",
      title: "Level One",
      scenes: [
        {
          id: "intro",
          title: "Intro",
          script: "one/intro.ink",
          backdrop: "hall",
          cast: [{ id: "ada", at: "left" }],
        },
        { id: "yard", script: "one/yard.ink" },
      ],
      completeWhen: "coins >= 50",
    },
    { id: "two", scenes: [{ id: "finale", script: "two/finale.ink" }] },
  ],
});

const files = {
  "ada.json": "{}",
  "ada.atlas": "",
  "one/intro.ink": `Hello. # speaker:ada # wear ada clothes/top/tank2
>>> backdrop yard duration=0
>>> color ada hair=blonde skin=reset eyes=3a7
~ coins += 5
Coins: {coins}. Done? {completed("intro")}
* [Be brave]
  ~ brave = true
  >>> add coins 10
  Brave!
* [Lose a life]
  ~ lives -= 1
  Ouch.
- -> END
`,
  "one/yard.ink": `In the yard with {coins} coins.
>>> wait 2 wait
After waiting.
-> END
`,
  "two/finale.ink": `>>> outfit ada gala
The end.
>>> end_game good
Unreachable.
`,
};

function setup(extra: Partial<ConstructorParameters<typeof GameSession>[1]> = {}) {
  const persister = memoryPersister();
  const pkg = packageFromFiles(manifest, files);
  const session = new GameSession(pkg, { saves: { persister }, ...extra });
  const events: GameEvent[] = [];
  session.onEvent((event) => events.push(event));
  return { session, events, persister };
}
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 1));
  expect(check()).toBe(true);
};
const text = (session: GameSession) => session.getSnapshot().controller?.getSnapshot().text;

afterEach(() => {
  vi.useRealTimers();
});

describe("GameSession", () => {
  it("plays scenes, applies directives and keeps Ink and game variables in sync", async () => {
    const { session, events } = setup();
    expect(session.getSnapshot().phase).toBe("title");
    await session.newGame();
    const snapshot = session.getSnapshot();
    expect(snapshot).toMatchObject({ phase: "playing", scene: { id: "intro" }, loading: false });
    expect(text(session)).toBe("Hello.");
    expect(snapshot.stage.backdrop.id).toBe("hall");
    expect(snapshot.stage.characters.ada).toMatchObject({
      visible: true,
      skin: ["body/ada", "clothes/top/tank2"],
      colors: { skin: "#f5d8ab" },
    });
    expect(snapshot.stage.characters.ada.x).toBeLessThan(0);

    snapshot.controller!.advance();
    expect(session.getSnapshot().stage.backdrop).toEqual({ id: "yard", duration: 0 });
    expect(session.getSnapshot().stage.characters.ada.colors).toEqual({
      hair: "#c1b01c",
      eyes: "#3a7",
    });
    expect(text(session)).toBe("Coins: 5. Done? false");
    expect(session.getSnapshot().variables.coins).toBe(5);

    session.getSnapshot().controller!.advance();
    session.getSnapshot().controller!.choose(0);
    expect(text(session)).toBe("Brave!");
    expect(session.getSnapshot().variables).toMatchObject({ coins: 15, brave: true });
    // Game-side changes reach Ink too, clamped to the variable's range.
    session.setVariable("coins", 500);
    expect(session.getSnapshot().variables.coins).toBe(100);
    expect(session.getSnapshot().controller!.getVariable("coins")).toBe(100);
    expect(events.some((event) => event.type === "variable" && event.name === "brave")).toBe(true);
  });

  it("completes levels by condition, rolls credits, and records the ending", async () => {
    const { session, events } = setup();
    await session.newGame();
    const controller = () => session.getSnapshot().controller!;
    controller().advance();
    session.setVariable("coins", 60);
    controller().advance();
    controller().choose(0);
    controller().advance(); // acknowledge the last line → END
    expect(session.getSnapshot().phase).toBe("level-complete"); // completeWhen skipped the yard
    expect(events.filter((event) => event.type === "level-complete")).toHaveLength(1);
    session.proceed();
    await until(() => text(session) === "The end.");
    // `outfit` prepares a character off stage until a `show`.
    expect(session.getSnapshot().stage.characters.ada).toMatchObject({
      visible: false,
      skin: ["body/ada", "dress"],
      // The outfit's colors apply over the character's own.
      colors: { skin: "#f5d8ab", hair: "#000000" },
    });
    controller().advance();
    await until(() => session.getSnapshot().phase === "credits");
    expect(session.getSnapshot().progress).toMatchObject({
      ending: "good",
      completedLevels: ["one", "two"],
      completedScenes: ["intro", "finale"],
    });
    session.proceed();
    expect(session.getSnapshot().phase).toBe("complete");
  });

  it("ends the game when gameOverWhen holds and retries the level from its start state", async () => {
    const { session } = setup();
    await session.newGame();
    const controller = () => session.getSnapshot().controller!;
    session.setVariable("lives", 1);
    controller().advance();
    controller().advance();
    controller().choose(1);
    expect(session.getSnapshot().phase).toBe("game-over");
    await session.retryLevel();
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", scene: { id: "intro" } });
    expect(session.getSnapshot().variables.lives).toBe(2);
  });

  it("holds the story on blocking waits, pausing the clock with the game", async () => {
    vi.useFakeTimers();
    const { session } = setup();
    const playing = session.playScene("yard");
    await vi.waitFor(() => expect(text(session)).toBe("In the yard with 0 coins."));
    await playing;
    session.getSnapshot().controller!.advance();
    expect(session.getSnapshot().controller!.getSnapshot().status).toBe("waiting");
    vi.advanceTimersByTime(1000);
    session.setPaused(true);
    vi.advanceTimersByTime(5000);
    expect(session.getSnapshot().controller!.getSnapshot().status).toBe("waiting");
    session.setPaused(false);
    await vi.advanceTimersByTimeAsync(1001);
    expect(text(session)).toBe("After waiting.");
  });

  it("saves to slots, autosaves, and restores mid-scene", async () => {
    const { session, persister } = setup();
    await session.newGame();
    const controller = () => session.getSnapshot().controller!;
    controller().advance();
    controller().advance();
    controller().choose(0);
    await until(() => persister.data.has("threeframe:demo:save:auto"));
    const save = await session.saveTo("2", "Before the yard");
    expect(save).toMatchObject({
      format: "threeframe.save",
      game: { id: "demo", version: "1.0.0" },
      label: "Before the yard",
      variables: { coins: 15, brave: true },
      scene: { level: "one", scene: "intro" },
    });
    expect(save.scene!.stage.effects).toEqual([]);

    const other = new GameSession(packageFromFiles(manifest, files), { saves: { persister } });
    expect((await other.saves!.list()).map((slot) => [slot.slot, !!slot.save])).toEqual([
      [AUTOSAVE_SLOT, true],
      ["1", false],
      ["2", true],
      ["3", false],
    ]);
    expect(await other.loadSlot("2")).toBe(true);
    expect(text(other)).toBe("Brave!");
    expect(other.getSnapshot().variables.coins).toBe(15);
    expect(other.getSnapshot().stage.backdrop.id).toBe("yard");
    // Exported text round-trips; saves for other games are refused.
    await other.load(JSON.stringify(save));
    expect(() => parseSave({ ...save, game: { id: "else" } }, manifest)).toThrow("different game");
  });

  it("falls back to the scene start when the script changed since the save", async () => {
    const { session, persister } = setup();
    await session.newGame();
    session.getSnapshot().controller!.advance();
    const save = session.createSave();
    const edited = packageFromFiles(manifest, {
      ...files,
      "one/intro.ink": "Rewritten.\n-> END\n",
    });
    const other = new GameSession(edited, { saves: { persister } });
    const warnings: string[] = [];
    other.onEvent((event) => event.type === "warning" && warnings.push(event.message));
    await other.load(save);
    expect(text(other)).toBe("Rewritten.");
    expect(warnings[0]).toMatch(/doesn't match/);
  });

  it("reports unknown directives as warnings without stopping play", async () => {
    const pkg = packageFromFiles(manifest, {
      ...files,
      "one/intro.ink": ">>> explode\nStill here.\n",
    });
    const session = new GameSession(pkg, { saves: false });
    const warnings: string[] = [];
    session.onEvent((event) => event.type === "warning" && warnings.push(event.message));
    await session.newGame();
    expect(text(session)).toBe("Still here.");
    expect(warnings).toEqual(["Unknown directive: explode"]);
  });

  it("runs custom directives and Ink externals", async () => {
    const seen: string[] = [];
    const pkg = packageFromFiles(manifest, {
      ...files,
      "one/intro.ink": ">>> confetti 3\nRolled {roll(6)}.\n",
    });
    const session = new GameSession(pkg, {
      saves: false,
      externals: { roll: (sides: number) => sides - 1 },
      directives: [
        {
          name: "confetti",
          usage: "confetti <n>",
          description: "Party.",
          run: (directive, context) => {
            seen.push(String(directive.args[0]));
            context.effect("confetti", { count: Number(directive.args[0]) });
          },
        },
      ],
    });
    await session.newGame();
    expect(text(session)).toBe("Rolled 5.");
    expect(seen).toEqual(["3"]);
    expect(session.getSnapshot().stage.effects.at(-1)).toMatchObject({
      type: "confetti",
      params: { count: 3 },
    });
  });
});

describe("sprite views", () => {
  it("shows characters from other views and turns them through the list", async () => {
    const views = [
      { name: "front" },
      { name: "side-left", skeleton: "ada-side.json", atlas: "ada-side.atlas", flip: true },
      { name: "back", skeleton: "ada-back.json", atlas: "ada-back.atlas" },
    ];
    const withViews = createManifest({
      ...manifest,
      characters: {
        ada: {
          ...manifest.characters!.ada,
          sprite: { ...manifest.characters!.ada.sprite!, views },
        },
      },
    });
    const pkg = packageFromFiles(withViews, {
      ...files,
      "ada-side.json": "{}",
      "ada-side.atlas": "",
      "ada-back.json": "{}",
      "ada-back.atlas": "",
      "one/intro.ink":
        ">>> view ada back\nOne.\n>>> turn ada right\nTwo.\n>>> turn ada left steps=2\nThree.\n",
    });
    const session = new GameSession(pkg, { saves: false });
    await session.newGame();
    const view = () => session.getSnapshot().stage.characters.ada.view;
    expect(view()).toBe("back");
    session.getSnapshot().controller!.advance();
    expect(view()).toBe("front");
    session.getSnapshot().controller!.advance();
    expect(view()).toBe("side-left");
  });

  it("validates views", () => {
    const check = (views: unknown, view?: string) =>
      validateManifest({
        ...manifest,
        characters: {
          ada: {
            ...manifest.characters!.ada,
            view,
            sprite: { ...manifest.characters!.ada.sprite!, views },
          },
        },
      }).map((issue) => issue.path);
    expect(
      check([{ name: "front" }, { name: "back", skeleton: "b.json", atlas: "b.atlas" }], "back"),
    ).toEqual([]);
    expect(check([{ name: "front" }, { name: "front" }])).toEqual([
      "characters.ada.sprite.views.1.name",
    ]);
    expect(check([{ name: "back", skeleton: "b.json" }])).toEqual([
      "characters.ada.sprite.views.0",
    ]);
    expect(check([{ name: "front" }], "back")).toEqual(["characters.ada.view"]);
  });
});

describe("game packages", () => {
  it("round-trips through a zip archive, including a wrapping folder", async () => {
    const pkg = packageFromFiles(manifest, files);
    const archive = await createGameArchive(pkg.source);
    const loaded = await loadGamePackage(archive);
    expect(loaded.manifest).toEqual(manifest);
    expect(await (await loaded.source.fetch("two/finale.ink")).text()).toBe(
      files["two/finale.ink"],
    );

    const nested = Object.fromEntries(
      [...pkg.source.files].map(([path, blob]) => [`my-game/${path}`, blob] as const),
    );
    const zipped = await createGameArchive({ ...nested, "game.json": "" });
    // Re-zip without a root manifest: only the wrapping folder has one.
    const { unzipSync, zipSync } = await import("fflate");
    const entries = unzipSync(zipped);
    delete entries["game.json"];
    const wrapped = await loadGamePackage(new Blob([new Uint8Array(zipSync(entries))]));
    expect(wrapped.manifest.id).toBe("demo");
    expect(wrapped.source.list?.()).toContain("one/intro.ink");
  });

  it("loads from any file source and rejects missing files", async () => {
    const source = memorySource({ "game.json": JSON.stringify(manifest), ...files });
    expect((await loadGamePackage(source)).manifest.id).toBe("demo");
    const incomplete = memorySource({ "game.json": JSON.stringify(manifest) });
    await expect(loadGamePackage(incomplete)).rejects.toThrow("File not found in package");
    await expect(loadGamePackage(new Uint8Array([1, 2, 3]))).rejects.toThrow("not a game package");
  });

  it("lists the latest save across slots", async () => {
    const store = new SaveStore({
      gameId: "demo",
      persister: memoryPersister(),
      slots: ["a", "b"],
    });
    const session = new GameSession(packageFromFiles(manifest, files), { saves: store });
    await session.newGame();
    await session.saveTo("a");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await session.saveTo("b");
    expect((await store.latest())?.slot).toBe("b");
    await store.delete("b");
    expect((await store.latest())?.slot).not.toBe("b");
  });
});
