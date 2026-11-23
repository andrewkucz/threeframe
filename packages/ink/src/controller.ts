import { Story } from "inkjs";

export type CompiledStory = string | Record<string, unknown>;
export interface NarrativeChoice {
  index: number;
  text: string;
  tags: readonly string[];
}
export interface NarrativeSnapshot {
  revision: number;
  lineId: number;
  text: string;
  tags: readonly string[];
  speaker: string | null;
  choices: readonly NarrativeChoice[];
  /** `waiting` while an asynchronous command line runs; the previous passage stays displayed. */
  status: "idle" | "playing" | "choice" | "waiting" | "ended";
}
/**
 * A command line: Ink output starting with the command prefix (`>>>` by default), such as
 * `>>> show ada at=left`. Commands are never displayed; they run in story order between passages.
 */
export interface InkCommand {
  /** The line without its prefix, trimmed. */
  text: string;
  /** Tags on the command line itself. */
  tags: readonly string[];
}
/**
 * Runs a command. Return a promise to hold the story until it settles: the controller reports
 * `waiting` and continues on its own afterwards.
 */
export type InkCommandHandler = (command: InkCommand) => void | PromiseLike<unknown>;
export interface InkControllerOptions {
  storyId?: string;
  configure?: (story: Story) => void;
  /** Prefix that marks command lines. `false` displays every line. Defaults to `">>>"`. */
  commandPrefix?: string | false;
  /** Runs command lines; without it, commands are only reported as events and skipped. */
  onCommand?: InkCommandHandler;
}
export type NarrativeEvent =
  | { type: "line"; snapshot: NarrativeSnapshot }
  | { type: "tags"; tags: readonly string[] }
  | { type: "choice"; choice: NarrativeChoice }
  | { type: "command"; command: InkCommand }
  /** An asynchronous command failed; the story continues regardless. */
  | { type: "error"; error: Error }
  | { type: "end" }
  | { type: "reset" }
  | { type: "restore" };
export interface NarrativeSave {
  version: 1;
  storyId: string;
  ink: string;
  display: Pick<NarrativeSnapshot, "text" | "tags" | "speaker" | "status">;
}

function fingerprint(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

/** The complete inkjs runtime stays available as `story` for advanced integrations. */
export class InkController {
  readonly story: Story;
  readonly storyId: string;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: NarrativeEvent) => void>();
  private commandPrefix: string | false;
  /** Replaceable so hosts can wire commands after construction. */
  onCommand: InkCommandHandler | undefined;
  /** Bumped whenever pending command continuations become stale (restart, restore, jump). */
  private generation = 0;
  private snapshot: NarrativeSnapshot = {
    revision: 0,
    lineId: 0,
    text: "",
    tags: [],
    speaker: null,
    choices: [],
    status: "idle",
  };

  constructor(compiled: CompiledStory, options: InkControllerOptions = {}) {
    this.commandPrefix = options.commandPrefix ?? ">>>";
    this.onCommand = options.onCommand;
    this.story = typeof compiled === "string" ? new Story(compiled) : new Story(compiled);
    this.storyId =
      options.storyId ??
      fingerprint(typeof compiled === "string" ? compiled : JSON.stringify(compiled));
    options.configure?.(this.story);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  onEvent = (listener: (event: NarrativeEvent) => void) => {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  };
  private emit(event: NarrativeEvent) {
    this.eventListeners.forEach((listener) => listener(event));
  }
  private choices(): NarrativeChoice[] {
    return this.story.currentChoices.map((choice) => ({
      index: choice.index,
      text: choice.text.trim(),
      tags: choice.tags ?? [],
    }));
  }
  private update(value: Partial<NarrativeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...value, revision: this.snapshot.revision + 1 };
    this.listeners.forEach((listener) => listener());
  }

  start = () => {
    if (this.snapshot.status === "idle") this.advance();
  };

  advance = () => {
    const { status } = this.snapshot;
    if (status === "ended" || status === "waiting" || this.story.currentChoices.length) return;
    this.continueStory([]);
  };

  /** Whether a line is a command line under the current prefix. */
  isCommand(line: string) {
    return this.commandPrefix !== false && line.trimStart().startsWith(this.commandPrefix);
  }

  private continueStory(tags: string[]) {
    let text = "";
    let steps = 0;
    while (this.story.canContinue && !text) {
      if (++steps > 10000) throw new Error("Ink produced too many empty lines in one advance.");
      const line = (this.story.Continue() ?? "").trim();
      const lineTags = this.story.currentTags ?? [];
      if (this.commandPrefix !== false && line.startsWith(this.commandPrefix)) {
        const command = { text: line.slice(this.commandPrefix.length).trim(), tags: [...lineTags] };
        this.emit({ type: "command", command });
        const pending = this.onCommand?.(command);
        if (pending && typeof pending.then === "function") {
          const generation = this.generation;
          this.update({ status: "waiting" });
          const resume = () => {
            if (generation === this.generation && this.snapshot.status === "waiting")
              this.continueStory(tags);
          };
          pending.then(resume, (reason: unknown) => {
            this.emit({
              type: "error",
              error: reason instanceof Error ? reason : new Error(String(reason)),
            });
            resume();
          });
          return;
        }
        continue;
      }
      text = line;
      tags.push(...lineTags);
    }
    const speakerTag = tags.findLast((tag) => tag.startsWith("speaker:"));
    const choices = this.choices();
    const status = text ? "playing" : choices.length ? "choice" : "ended";
    this.update({
      text,
      tags,
      speaker: speakerTag ? speakerTag.slice(8).trim() || null : null,
      choices,
      status,
      lineId: this.snapshot.lineId + 1,
    });
    if (tags.length) this.emit({ type: "tags", tags });
    if (text) this.emit({ type: "line", snapshot: this.snapshot });
    if (status === "ended") this.emit({ type: "end" });
  }

  choose = (index: number) => {
    const choice = this.choices().find((value) => value.index === index);
    if (!choice) throw new Error(`Choice ${index} is not available.`);
    if (this.snapshot.status === "waiting") return;
    this.story.ChooseChoiceIndex(index);
    this.emit({ type: "choice", choice });
    this.advance();
  };

  jump = (path: string) => {
    this.generation++;
    this.story.ChoosePathString(path);
    this.update({ status: "playing" });
    this.advance();
  };
  restart = () => {
    this.generation++;
    this.story.ResetState();
    this.update({ status: "idle", text: "", tags: [], choices: [], speaker: null });
    this.emit({ type: "reset" });
    this.start();
  };
  getVariable(name: string) {
    return this.story.variablesState.$(name);
  }
  setVariable(name: string, value: Parameters<Story["variablesState"]["$"]>[1]) {
    this.story.variablesState.$(name, value);
    this.update({});
  }
  observeVariable(name: string, observer: (name: string, value: unknown) => void) {
    this.story.ObserveVariable(name, observer);
    return () => this.story.RemoveVariableObserver(observer, name);
  }
  bindExternal(name: string, callback: (...args: any[]) => any, lookaheadSafe = false) {
    this.story.BindExternalFunction(name, callback, lookaheadSafe);
    return () => this.story.UnbindExternalFunction(name);
  }
  evaluate(name: string, args: unknown[] = []) {
    const result: unknown = this.story.EvaluateFunction(name, args);
    this.update({});
    return result;
  }
  /** Call after mutating the raw runtime if subscribed views need refreshing. */
  refresh = () => {
    this.update({ choices: this.choices() });
  };

  save = (): NarrativeSave => ({
    version: 1,
    storyId: this.storyId,
    ink: this.story.state.ToJson(),
    display: {
      text: this.snapshot.text,
      tags: [...this.snapshot.tags],
      speaker: this.snapshot.speaker,
      status: this.snapshot.status,
    },
  });

  restore = (save: NarrativeSave) => {
    if (
      save?.version !== 1 ||
      save.storyId !== this.storyId ||
      typeof save.ink !== "string" ||
      typeof save.display?.text !== "string" ||
      !Array.isArray(save.display.tags) ||
      !save.display.tags.every((tag) => typeof tag === "string") ||
      !(save.display.speaker === null || typeof save.display.speaker === "string") ||
      !["idle", "playing", "choice", "waiting", "ended"].includes(save.display.status)
    ) {
      throw new Error("This save is invalid or belongs to a different story.");
    }
    this.generation++;
    const previous = this.story.state.ToJson();
    try {
      this.story.state.LoadJson(save.ink);
    } catch (error) {
      this.story.state.LoadJson(previous);
      throw error;
    }
    this.update({
      ...save.display,
      tags: [...save.display.tags],
      choices: this.choices(),
      lineId: this.snapshot.lineId + 1,
    });
    this.emit({ type: "restore" });
    // A save taken while a command ran resumes after it; the command itself already happened.
    if (save.display.status === "waiting") this.continueStory([]);
  };
}
