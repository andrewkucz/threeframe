import type { DialogueBoxProps } from "./Dialogue";

/** The presentational subset of `DialogueBoxProps` a preset may set. */
export type DialoguePreset = Partial<
  Pick<
    DialogueBoxProps,
    | "reveal"
    | "speed"
    | "allowFastSkip"
    | "position"
    | "width"
    | "height"
    | "padding"
    | "resolution"
    | "theme"
    | "panel"
    | "body"
    | "nameplate"
    | "prompt"
    | "pageCounter"
    | "choiceMenu"
    | "labels"
    | "speakers"
  >
>;

/**
 * Built-in looks. Each is plain, JSON-serializable data relative to the package defaults, so it can
 * be inspected, extended with `mergeDialogueOptions`, or used as the starting point for your own.
 */
export const dialoguePresets = {
  /** Threeframe: The package defaults on a clean white stage. */
  threeframe: {},
  /** Parchment: Warm paper, ink-brown text, and an edge-mounted name badge. */
  parchment: {
    theme: {
      fontSize: 24,
      lineHeight: 1.55,
      radius: 4,
      borderWidth: 2,
      accentColor: "#9a4b2b",
      textColor: "#3b2f22",
      mutedColor: "#8a7660",
      background: "#f6eedb",
      borderColor: "#b89b6e",
      choiceBackground: "#efe2c6",
      choiceHoverBackground: "#e2cc9f",
    },
    nameplate: {
      placement: "border",
      fontSize: 14,
    },
    choiceMenu: {
      width: 800,
    },
    labels: {
      nextPage: "Turn the page  ›",
      continue: "Turn the page  ›",
      choose: "Decide",
      choiceMarker: "numbered",
    },
  },
  /** Visual novel: Full-width panel, floating name tag, centered choice list. */
  visualNovel: {
    position: [0, -230, 100],
    width: 1160,
    height: 200,
    padding: 32,
    theme: {
      fontSize: 26,
      radius: 18,
      borderWidth: 2,
      accentColor: "#ff8fb1",
      textColor: "#fbeefd",
      mutedColor: "#b9a3c9",
      background: "#1b1430",
      borderColor: "#5b3f73",
      choiceBackground: "#2a1f45",
      choiceHoverBackground: "#45306b",
    },
    nameplate: {
      placement: "outside",
      fontSize: 18,
      textTransform: "none",
    },
    choiceMenu: {
      width: 600,
      textAlign: "center",
      minHeight: 44,
      marker: false,
      margin: 24,
    },
    labels: {
      continue: "▼",
      nextPage: "▼",
    },
    prompt: {
      align: "end",
    },
    pageCounter: {
      align: "start",
    },
  },
  /** Terminal: Monospace phosphor green with square corners and command prompts. */
  terminal: {
    speed: 60,
    theme: {
      fontFamily: "monospace",
      fontSize: 22,
      lineHeight: 1.4,
      radius: 0,
      borderWidth: 1,
      accentColor: "#b6ff6a",
      textColor: "#7dff8a",
      mutedColor: "#3f9a4a",
      background: "#050a05",
      borderColor: "#1f5a27",
      choiceBackground: "#0b160c",
      choiceHoverBackground: "#143a19",
    },
    nameplate: {
      textTransform: "none",
      fontSize: 14,
    },
    pageCounter: {
      showWhenSinglePage: true,
    },
    choiceMenu: {
      minHeight: 40,
      gap: 4,
    },
    labels: {
      narrator: "SYSTEM",
      printing: "receiving…",
      nextPage: "> more_",
      continue: "> continue_",
      choose: "> select option",
      choiceMarker: "numbered",
    },
  },
  /** Subtitles: No panel, centered text, word-by-word reveal, minimal chrome. */
  subtitles: {
    reveal: "word",
    speed: 12,
    position: [0, -240, 100],
    height: 140,
    padding: 16,
    theme: {
      fontFamily: "system-ui",
      fontSize: 28,
      lineHeight: 1.3,
      borderWidth: 0,
      textColor: "#ffffff",
      accentColor: "#ffd166",
      choiceBackground: "#1a1f23",
      choiceHoverBackground: "#343d44",
    },
    panel: false,
    body: {
      textAlign: "center",
    },
    nameplate: {
      align: "center",
    },
    prompt: false,
    pageCounter: false,
    choiceMenu: {
      width: 600,
      textAlign: "center",
      marker: false,
      minHeight: 40,
      gap: 6,
    },
  },
  /** Storybook: Soft rounded card, large centered type, two-column choices. */
  storybook: {
    height: 250,
    padding: 32,
    theme: {
      fontSize: 30,
      lineHeight: 1.6,
      radius: 28,
      borderWidth: 3,
      accentColor: "#e07a5f",
      textColor: "#2d2a32",
      mutedColor: "#9b8f86",
      background: "#fff8ec",
      borderColor: "#f2cc8f",
      choiceBackground: "#fff1dc",
      choiceHoverBackground: "#fbdcb4",
    },
    body: {
      textAlign: "center",
    },
    nameplate: {
      placement: "border",
      align: "center",
      fontSize: 16,
    },
    choiceMenu: {
      columns: 2,
      width: 800,
      perPage: 4,
      gap: 12,
      minHeight: 60,
    },
    labels: {
      choiceMarker: "letters",
      continue: "The end  ✦",
      choose: "What happens next?",
    },
  },
  /** Noir: Black and white with a red accent; italic narration revealed line by line. */
  noir: {
    reveal: "line",
    speed: 2,
    theme: {
      fontSize: 24,
      radius: 0,
      borderWidth: 1,
      accentColor: "#d23c3c",
      textColor: "#e6e6e6",
      mutedColor: "#7a7a7a",
      background: "#0d0d0d",
      borderColor: "#3a3a3a",
      choiceBackground: "#161616",
      choiceHoverBackground: "#2a1414",
    },
    body: {
      fontStyle: "italic",
    },
    nameplate: {
      fontSize: 13,
    },
    choiceMenu: {
      minHeight: 42,
    },
    labels: {
      narrator: null,
      choiceMarker: "bullets",
      continue: "…",
      nextPage: "…",
      choose: "Make the call",
    },
  },
  /** Top HUD: Compact banner at the top with a three-column response grid below it. */
  topHud: {
    position: [0, 215, 100],
    width: 900,
    height: 160,
    padding: 22,
    theme: {
      fontFamily: "system-ui",
      fontSize: 22,
      lineHeight: 1.4,
      radius: 8,
      accentColor: "#5ec8f2",
      textColor: "#e8f4fa",
      mutedColor: "#7fa3b8",
      background: "#10202e",
      borderColor: "#2f5c78",
      choiceBackground: "#14324a",
      choiceHoverBackground: "#1d4a6b",
    },
    prompt: {
      align: "end",
    },
    pageCounter: {
      align: "start",
    },
    choiceMenu: {
      columns: 3,
      perPage: 6,
      gap: 6,
      minHeight: 40,
    },
    labels: {
      choose: "Choose a response",
    },
  },
  /** Chat bubble: Small rounded bubble with a sans-serif voice and left-aligned replies. */
  chatBubble: {
    reveal: "word",
    speed: 14,
    width: 640,
    height: 150,
    padding: 18,
    theme: {
      fontFamily: "system-ui",
      fontSize: 19,
      lineHeight: 1.35,
      radius: 20,
      borderWidth: 1,
      accentColor: "#7c9cff",
      textColor: "#f5f6f8",
      mutedColor: "#8b90a0",
      background: "#20232b",
      borderColor: "#343846",
      choiceBackground: "#2a2e39",
      choiceHoverBackground: "#3a4052",
    },
    nameplate: {
      placement: "outside",
      fontSize: 13,
      textTransform: "none",
    },
    pageCounter: false,
    prompt: {
      align: "end",
    },
    choiceMenu: {
      width: 400,
      align: "start",
      minHeight: 36,
      gap: 6,
      margin: 10,
      marker: false,
    },
    labels: {
      continue: "Tap to continue",
      nextPage: "Tap for more",
      choose: "Pick a reply",
    },
  },
  /** Royal fantasy: Deep violet and gold, centered text, diamond markers, and archaic labels. */
  royalFantasy: {
    theme: {
      fontSize: 26,
      radius: 6,
      borderWidth: 3,
      accentColor: "#e8c15a",
      textColor: "#f7ecd0",
      mutedColor: "#b7a37a",
      background: "#1a1033",
      borderColor: "#a3843a",
      choiceBackground: "#2a1a4d",
      choiceHoverBackground: "#3e2770",
    },
    body: {
      textAlign: "center",
    },
    nameplate: {
      placement: "border",
      align: "center",
      fontSize: 17,
    },
    prompt: {
      align: "center",
    },
    pageCounter: false,
    choiceMenu: {
      textAlign: "center",
      width: 800,
    },
    labels: {
      narrator: "The Chronicle",
      choiceMarker: "bullets",
      continue: "Onward  ›",
      nextPage: "Read on  ›",
      choose: "Choose thy path",
    },
  },
} satisfies Record<string, DialoguePreset>;
export type DialoguePresetName = keyof typeof dialoguePresets;

/** Identity helper that type-checks a custom preset. */
export function defineDialoguePreset<const T extends DialoguePreset>(preset: T): T {
  return preset;
}

export function resolveDialoguePreset(
  preset: DialoguePresetName | DialoguePreset | undefined,
): DialoguePreset {
  if (preset === undefined) return {};
  if (typeof preset !== "string") return preset;
  const found = (dialoguePresets as Record<string, DialoguePreset>)[preset];
  if (!found)
    throw new Error(
      `Unknown dialogue preset "${preset}". Use one of: ${Object.keys(dialoguePresets).join(", ")}.`,
    );
  return found;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
function mergeInto(base: Record<string, unknown>, layer: Record<string, unknown>) {
  const result = { ...base };
  for (const [key, value] of Object.entries(layer)) {
    if (value === undefined) continue;
    const previous = result[key];
    result[key] =
      isPlainObject(value) && isPlainObject(previous) ? mergeInto(previous, value) : value;
  }
  return result;
}
/**
 * Deep-merges dialogue options from lowest to highest priority. Nested part objects merge key by
 * key; arrays (position, padding, offsets), functions, and `false` replace what came before, and an
 * object after `false` turns a hidden part back on. `undefined` never erases a value.
 */
export function mergeDialogueOptions<T extends object>(...layers: (T | undefined)[]): T {
  let result: Record<string, unknown> = {};
  for (const layer of layers)
    if (layer) result = mergeInto(result, layer as Record<string, unknown>);
  return result as T;
}
