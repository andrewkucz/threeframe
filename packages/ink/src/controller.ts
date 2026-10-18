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
  status: "idle" | "playing" | "choice" | "ended";
}
export type NarrativeEvent =
  | { type: "line"; snapshot: NarrativeSnapshot }
  | { type: "tags"; tags: readonly string[] }
  | { type: "choice"; choice: NarrativeChoice }
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
  private snapshot: NarrativeSnapshot = {
    revision: 0,
    lineId: 0,
    text: "",
    tags: [],
    speaker: null,
    choices: [],
    status: "idle",
  };

  constructor(
    compiled: CompiledStory,
    options: { storyId?: string; configure?: (story: Story) => void } = {},
  ) {
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
    if (this.snapshot.status === "ended" || this.story.currentChoices.length) return;
    const tags: string[] = [];
    let text = "";
    let steps = 0;
    while (this.story.canContinue && !text) {
      if (++steps > 10000) throw new Error("Ink produced too many empty lines in one advance.");
      text = (this.story.Continue() ?? "").trim();
      tags.push(...(this.story.currentTags ?? []));
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
  };

  choose = (index: number) => {
    const choice = this.choices().find((value) => value.index === index);
    if (!choice) throw new Error(`Choice ${index} is not available.`);
    this.story.ChooseChoiceIndex(index);
    this.emit({ type: "choice", choice });
    this.advance();
  };

  jump = (path: string) => {
    this.story.ChoosePathString(path);
    this.update({ status: "playing" });
    this.advance();
  };
  restart = () => {
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
      !["idle", "playing", "choice", "ended"].includes(save.display.status)
    ) {
      throw new Error("This save is invalid or belongs to a different story.");
    }
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
  };
}
