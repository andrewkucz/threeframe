import { dialoguePresets as libraryPresets, type DialoguePresetName } from "@threeframe/ink";
import { flattenDialoguePreset, type DialogueSettings } from "./options";

export interface DialoguePreset {
  id: DialoguePresetName;
  name: string;
  description: string;
  /** Preview stage color; not part of the library preset. */
  stage: string;
}

/** Display metadata for the library's built-in presets (`dialoguePresets` in @threeframe/ink). */
export const dialoguePresets: DialoguePreset[] = [
  {
    id: "threeframe",
    name: "Threeframe",
    description: "The package defaults, on a clean white stage.",
    stage: "#ffffff",
  },
  {
    id: "parchment",
    name: "Parchment",
    description: "Warm paper, ink-brown text, and an edge-mounted name badge.",
    stage: "#e9dcc0",
  },
  {
    id: "visualNovel",
    name: "Visual novel",
    description: "Full-width panel, floating name tag, centered choice list.",
    stage: "#2a2140",
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "Monospace phosphor green with square corners and command prompts.",
    stage: "#000000",
  },
  {
    id: "subtitles",
    name: "Subtitles",
    description: "No panel, centered text, word-by-word reveal, minimal chrome.",
    stage: "#3d4a52",
  },
  {
    id: "storybook",
    name: "Storybook",
    description: "Soft rounded card, large centered type, two-column choices.",
    stage: "#fde8d0",
  },
  {
    id: "noir",
    name: "Noir",
    description: "Black and white with a red accent; italic narration revealed line by line.",
    stage: "#1a1a1a",
  },
  {
    id: "topHud",
    name: "Top HUD",
    description: "Compact banner at the top with a three-column response grid below it.",
    stage: "#0b1a26",
  },
  {
    id: "chatBubble",
    name: "Chat bubble",
    description: "Small rounded bubble with a sans-serif voice and left-aligned replies.",
    stage: "#e9ecf2",
  },
  {
    id: "royalFantasy",
    name: "Royal fantasy",
    description: "Deep violet and gold, centered text, diamond markers, and archaic labels.",
    stage: "#120a24",
  },
];

/** The flat control settings a built-in preset resolves to. */
export function presetSettings(id: DialoguePresetName): DialogueSettings {
  const preset = dialoguePresets.find((item) => item.id === id);
  return flattenDialoguePreset(libraryPresets[id] as Record<string, unknown>, preset?.stage)
    .settings;
}
