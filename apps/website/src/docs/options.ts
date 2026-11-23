import type { RevealMode } from "@threeframe/core";
import { options, type ControlSpec, type ControlValue } from "./Controls";
import {
  choiceMarkerFormats,
  formatChoiceMarker,
  resolveDialoguePreset,
  type ChoiceMarkerFormat,
  type DialoguePreset,
  type DialoguePresetName,
} from "@threeframe/ink";
import { defaultNarrativeGameLabels } from "@threeframe/engine";
import type { PropDoc } from "./examples";

const sampleChoice = { index: 0, text: "", tags: [] };

export interface PlayerSettings {
  paused: boolean;
  scene: string;
  preset: string;
  reveal: string;
  speed: number;
  fastSkip: boolean;
  font: string;
  fontSize: number;
  placement: string;
  nameplate: string;
  accent: string;
  controls: boolean;
  keyboard: boolean;
  unstyled: boolean;
  continueLabel: string;
  hintLabel: string;
}
type PlayerDialogueKey =
  | "reveal"
  | "speed"
  | "fastSkip"
  | "font"
  | "fontSize"
  | "placement"
  | "nameplate"
  | "accent";
/** What the dialogue controls show for a preset: its values, falling back to package defaults. */
export type PlayerPreset = string | DialoguePreset;
export function playerPresetValues(source: PlayerPreset): Pick<PlayerSettings, PlayerDialogueKey> {
  const preset =
    typeof source === "string"
      ? resolveDialoguePreset((source || undefined) as DialoguePresetName | undefined)
      : source;
  const nameplate = preset.nameplate;
  return {
    reveal: preset.reveal ?? "character",
    speed: preset.speed ?? 36,
    fastSkip: preset.allowFastSkip ?? true,
    font: preset.theme?.fontFamily ?? "Georgia, serif",
    fontSize: preset.theme?.fontSize ?? 25,
    placement: (preset.position?.[1] ?? -1) > 0 ? "top" : "bottom",
    nameplate: nameplate === false ? "hidden" : (nameplate?.placement ?? "inside"),
    accent: preset.theme?.accentColor ?? "#eabd78",
  };
}
export const playerDefaults: PlayerSettings = {
  paused: false,
  scene: "",
  preset: "",
  ...playerPresetValues(""),
  controls: true,
  keyboard: true,
  unstyled: false,
  continueLabel: defaultNarrativeGameLabels.continue,
  hintLabel: defaultNarrativeGameLabels.keyboardHint,
};
/** `dialogue` prop: the preset by name plus only the controls changed from that preset. */
export function playerDialogueProps(
  settings: PlayerSettings,
  custom?: DialoguePreset,
): DialoguePreset & { preset?: DialoguePresetName | DialoguePreset } {
  const source: PlayerPreset = custom ?? settings.preset;
  const base = playerPresetValues(source);
  const changed = (key: PlayerDialogueKey) => settings[key] !== base[key];
  const theme = {
    ...(changed("font") ? { fontFamily: settings.font } : {}),
    ...(changed("fontSize") ? { fontSize: settings.fontSize } : {}),
    ...(changed("accent") ? { accentColor: settings.accent } : {}),
  };
  return {
    ...(custom
      ? { preset: custom }
      : settings.preset && settings.preset !== "threeframe"
        ? { preset: settings.preset as DialoguePresetName }
        : {}),
    ...(changed("reveal") ? { reveal: settings.reveal as RevealMode } : {}),
    ...(changed("speed") ? { speed: settings.speed } : {}),
    ...(changed("fastSkip") ? { allowFastSkip: settings.fastSkip } : {}),
    ...(changed("placement")
      ? {
          position: (settings.placement === "top" ? [0, 215, 100] : [0, -220, 100]) as [
            number,
            number,
            number,
          ],
        }
      : {}),
    ...(changed("nameplate")
      ? {
          nameplate:
            settings.nameplate === "hidden"
              ? (false as const)
              : { placement: settings.nameplate as "inside" | "border" | "outside" },
        }
      : {}),
    ...(Object.keys(theme).length ? { theme } : {}),
  };
}
/** Top-level NarrativeGame props from the player controls, omitting defaults. */
export function playerGameProps(settings: PlayerSettings) {
  const labels = {
    ...(settings.continueLabel !== playerDefaults.continueLabel
      ? { continue: settings.continueLabel }
      : {}),
    ...(settings.hintLabel !== playerDefaults.hintLabel
      ? { keyboardHint: settings.hintLabel }
      : {}),
  };
  return {
    ...(settings.controls ? {} : { controls: false }),
    ...(settings.keyboard ? {} : { keyboard: false as const }),
    ...(settings.unstyled ? { unstyled: true } : {}),
    ...(Object.keys(labels).length ? { labels } : {}),
  };
}
export const playerControls: ControlSpec<PlayerSettings>[] = [
  {
    key: "paused",
    name: "paused",
    group: "Playback",
    kind: "toggle",
    type: "boolean",
    defaultValue: "false",
    description: "Pause dialogue and character animations.",
  },
  {
    key: "scene",
    name: "scene",
    group: "Playback",
    kind: "select",
    options: [
      { value: "", label: "Follow Ink tags" },
      { value: "valley", label: "valley" },
      { value: "tower", label: "tower" },
    ],
    type: "string | undefined",
    defaultValue: "undefined",
    description: "Override the scene, or let Ink direct it.",
  },
  {
    key: "reveal",
    name: "dialogue.reveal",
    group: "Dialogue",
    kind: "select",
    options: options("character", "word", "line", "instant"),
    type: "RevealMode",
    defaultValue: '"character"',
    description: "Reveal characters, words, or wrapped lines.",
  },
  {
    key: "speed",
    name: "dialogue.speed",
    group: "Dialogue",
    kind: "range",
    min: 0,
    max: 100,
    unit: "/ sec",
    type: "number",
    defaultValue: "36",
    description: "Reveal units per second; 0 is instant.",
  },
  {
    key: "fastSkip",
    name: "dialogue.allowFastSkip",
    group: "Dialogue",
    kind: "toggle",
    type: "boolean",
    defaultValue: "true",
    description: "Allow a click to finish printing this page.",
  },
  {
    key: "font",
    name: "dialogue.theme.fontFamily",
    group: "Dialogue",
    kind: "select",
    options: options("Georgia, serif", "Lora", "system-ui", "monospace"),
    type: "string",
    defaultValue: '"Georgia, serif"',
    description: "Use a CSS family name. Lora is preloaded.",
  },
  {
    key: "fontSize",
    name: "dialogue.theme.fontSize",
    group: "Dialogue",
    kind: "range",
    min: 16,
    max: 38,
    unit: "units",
    type: "number",
    defaultValue: "25",
    description: "Design units; changing size repaginates text.",
  },
  {
    key: "accent",
    name: "dialogue.theme.accentColor",
    group: "Dialogue",
    kind: "color",
    type: "CSS color",
    defaultValue: '"#eabd78"',
    description: "Nameplates, markers, and hover borders (the keeper keeps its own color).",
  },
  {
    key: "placement",
    name: "dialogue.position",
    group: "Dialogue",
    kind: "select",
    options: options("bottom", "top"),
    type: "[x, y, z]",
    defaultValue: "scaled to the design",
    description: "Bottom maps to −220 Y; top maps to 215 Y.",
  },
  {
    key: "nameplate",
    name: "dialogue.nameplate",
    group: "Dialogue",
    kind: "select",
    options: options("inside", "border", "outside", "hidden"),
    type: "DialogueNameplateOptions | false",
    defaultValue: '{ placement: "inside" }',
    description: "Name as a text row, an edge badge, a badge above, or hidden.",
  },
  {
    key: "controls",
    name: "controls",
    group: "Player UI",
    kind: "toggle",
    type: "boolean",
    defaultValue: "true",
    description: "Visible DOM controls. Off keeps them for screen readers.",
  },
  {
    key: "keyboard",
    name: "keyboard",
    group: "Player UI",
    kind: "toggle",
    type: "NarrativeGameKeyboard | false",
    defaultValue: "{}",
    description: "Space/Enter advance; number keys choose.",
  },
  {
    key: "unstyled",
    name: "unstyled",
    group: "Player UI",
    kind: "toggle",
    type: "boolean",
    defaultValue: "false",
    description: "Drop built-in styles; style parts with classNames.",
  },
  {
    key: "continueLabel",
    name: "labels.continue",
    group: "Player UI",
    kind: "text",
    type: "string",
    defaultValue: '"Continue"',
    description: "Continue button text.",
  },
  {
    key: "hintLabel",
    name: "labels.keyboardHint",
    group: "Player UI",
    kind: "text",
    type: "string",
    defaultValue: '"Space to continue · Number keys to choose"',
    description: "Hint beside the controls.",
  },
];
export const playerReference: PropDoc[] = [
  {
    name: "definition",
    type: "GameDefinition",
    defaultValue: "required",
    description:
      "Story, scenes, characters, and assets. Keep its identity stable; replacing it restarts playback.",
  },
  {
    name: "definition.backgroundColor / characterDefaults",
    type: "string / { position, scale }",
    defaultValue: '"#142632" / [0, -200, 0], 0.6',
    description: "Fallback clear color and placement for scenes and characters that omit them.",
  },
  {
    name: "definition.scenes[id]",
    type: "SceneDefinition",
    defaultValue: "—",
    description:
      "background, backdrop (any Backdrop prop: fit, align, offset, tint, opacity…), color, and character placements.",
  },
  {
    name: "definition.characters / placements",
    type: "CharacterDefinition / CharacterPlacement",
    defaultValue: "—",
    description:
      "Both accept every SpineSprite look prop (animation, skin, tint, flip, tracks, queue, mixes…). Layering: definition, placement, Ink tags, then characterOverrides.",
  },
  {
    name: "dialogue.preset",
    type: "DialoguePresetName | DialoguePreset",
    defaultValue: "undefined",
    description:
      "The same presets as DialogueBox, or a custom object (import one exported from the Dialogue page). Dialogue controls show its values and override them.",
  },
  ...playerControls.filter((spec) => spec.key !== "continueLabel" && spec.key !== "hintLabel"),
  {
    name: "dialogue",
    type: "InkDialogue props",
    defaultValue: "{}",
    description:
      "Every DialogueBox presentation prop, including preset. Layers: layout scaled to the design size, then the preset, then these props.",
    example: 'dialogue={{ preset: "noir", theme: { accentColor: "#ffd166" } }}',
  },
  {
    name: "dialogue.speakers",
    type: "Record<string, SpeakerStyle>",
    defaultValue: "{}",
    description: "Map speaker tags to names, accent colors, and per-speaker part overrides.",
    example: 'scout: { name: "The traveler", color: "#eabd78" }',
  },
  {
    name: "labels",
    type: "Partial<NarrativeGameLabels>",
    defaultValue: "defaultNarrativeGameLabels",
    description:
      "Every DOM string: continue, reveal, printing, ended, playAgain, paused, keyboardHint, narrator, choice(choice, n), loading, loadingProgress(loaded, total), error, retry, webglRequired.",
  },
  {
    name: "classNames / styles",
    type: "Partial<Record<NarrativeGameSlot, …>>",
    defaultValue: "{}",
    description:
      "Per-part class names and inline styles for root, canvas, controls, button, hint, status, loading, and error.",
  },
  {
    name: "keyboard",
    type: "{ advance?: string[]; choiceKeys?: boolean } | false",
    defaultValue: '{ advance: ["Space", "Enter"], choiceKeys: true }',
    description: "KeyboardEvent.code values that advance, and whether 1–9 choose.",
  },
  {
    name: "characterOverrides",
    type: "Record<string, CharacterOverrides>",
    defaultValue: "undefined",
    description: "Live per-character SpineSprite props that win over the definition and Ink tags.",
  },
  {
    name: "renderLoading / renderError",
    type: "(progress) => node / (error, retry) => node",
    defaultValue: "built-in",
    description: "Replace the loading and error views entirely.",
  },
  {
    name: "onEvent",
    type: "(event) => void",
    defaultValue: "undefined",
    description: "Receive line, choice, tag, end, reset, and restore events.",
  },
  {
    name: "configureStory",
    type: "(story) => void",
    defaultValue: "undefined",
    description: "Bind external Ink functions before the first passage plays.",
  },
  {
    name: "ref",
    type: "NarrativeGameHandle",
    defaultValue: "undefined",
    description: "Advance, choose, restart, save, restore, or access the InkController.",
  },
];

export type DialogueSettings = Record<string, ControlValue>;
/**
 * Dialogue controls are keyed by their prop path (`choiceMenu.placement`), so one table drives the
 * controls, the live props, and the copyable JSX. `packageDefault` is the API default; values equal
 * to it are left out of the generated props. A toggle whose key is a part path (`nameplate`)
 * controls that part's presence: `false` hides the part and every control beneath it.
 */
export interface DialogueControl extends ControlSpec<DialogueSettings> {
  initial: ControlValue;
  packageDefault?: ControlValue;
  /** Not a DialogueBox prop: example-only settings the page interprets itself. */
  meta?: boolean;
  presence?: boolean;
  /** Converts a control value into a prop value. */
  toProp?: (value: ControlValue) => unknown;
  /** Converts a prop value back into a control value; undefined means it cannot be shown. */
  fromProp?: (value: unknown) => ControlValue | undefined;
}
const alignOptions = options("start", "center", "end");
export const dialogueControls: DialogueControl[] = [
  {
    key: "mode",
    name: "Example component",
    group: "Source",
    kind: "select",
    meta: true,
    initial: "text",
    options: [
      { value: "text", label: "DialogueBox · plain text" },
      { value: "ink", label: "InkStory · Ink script" },
    ],
    type: "example option",
    defaultValue: "DialogueBox",
    description: "Switch component; each keeps its own source.",
  },
  {
    key: "speaker",
    name: "speaker",
    group: "Source",
    kind: "select",
    meta: true,
    initial: "scout",
    options: [...options("scout", "keeper", "narrator"), { value: "", label: "null (narration)" }],
    type: "string | null",
    defaultValue: "null",
    description: "Key into speakers. null shows labels.narrator.",
  },
  {
    key: "choices",
    name: "choices",
    group: "Source",
    kind: "select",
    meta: true,
    initial: "none",
    options: [
      { value: "none", label: "None" },
      { value: "two", label: "Two choices" },
      { value: "six", label: "Six choices (paged)" },
    ],
    type: "NarrativeChoice[]",
    defaultValue: "[]",
    description: "Shown after the final text page.",
  },
  {
    key: "previewBackground",
    name: "Preview background",
    group: "Source",
    kind: "color",
    meta: true,
    initial: "#ffffff",
    type: "example option",
    defaultValue: "—",
    description: "Stage color behind the dialogue; the grid follows it.",
  },
  {
    key: "reveal",
    name: "reveal",
    group: "Playback",
    kind: "select",
    initial: "character",
    packageDefault: "character",
    options: options("character", "word", "line", "instant"),
    type: "RevealMode",
    defaultValue: '"character"',
    description: "Print in characters, words, or wrapped lines.",
  },
  {
    key: "speed",
    name: "speed",
    group: "Playback",
    kind: "range",
    min: 0,
    max: 100,
    unit: "/ sec",
    initial: 36,
    packageDefault: 36,
    type: "number",
    defaultValue: "36",
    description: "Units per second; 0 reveals the full page.",
  },
  {
    key: "allowFastSkip",
    name: "allowFastSkip",
    group: "Playback",
    kind: "toggle",
    initial: true,
    packageDefault: true,
    type: "boolean",
    defaultValue: "true",
    description: "Click during printing to reveal the page.",
  },
  {
    key: "position",
    name: "position[1]",
    group: "Layout",
    kind: "range",
    min: -260,
    max: 260,
    step: 5,
    initial: -220,
    packageDefault: -220,
    toProp: (value) => [0, value, 100],
    fromProp: (value) =>
      Array.isArray(value) && value[0] === 0 && value[2] === 100 && typeof value[1] === "number"
        ? value[1]
        : undefined,
    type: "[x, y, z]",
    defaultValue: "[0, -220, 100]",
    description: "Panel center Y. Above 0, an auto menu flips below.",
  },
  {
    key: "width",
    name: "width",
    group: "Layout",
    kind: "range",
    min: 440,
    max: 1160,
    step: 10,
    initial: 1120,
    packageDefault: 1120,
    type: "number",
    defaultValue: "1120",
    description: "Panel width in scene units; controls wrapping.",
  },
  {
    key: "height",
    name: "height",
    group: "Layout",
    kind: "range",
    min: 120,
    max: 320,
    step: 5,
    initial: 210,
    packageDefault: 210,
    type: "number",
    defaultValue: "210",
    description: "Panel height; overflow becomes another page.",
  },
  {
    key: "padding",
    name: "padding",
    group: "Layout",
    kind: "range",
    min: 0,
    max: 56,
    initial: 28,
    packageDefault: 28,
    type: "DialoguePadding",
    defaultValue: "28",
    description: "Inner spacing. Also accepts [y, x] or [top, right, bottom, left].",
  },
  {
    key: "theme.fontFamily",
    name: "theme.fontFamily",
    group: "Theme tokens",
    kind: "select",
    initial: "Georgia, serif",
    packageDefault: "Georgia, serif",
    options: options("Lora", "Georgia, serif", "system-ui", "monospace"),
    type: "string",
    defaultValue: '"Georgia, serif"',
    description: "Body and choice text. Lora is preloaded.",
  },
  {
    key: "theme.fontSize",
    name: "theme.fontSize",
    group: "Theme tokens",
    kind: "range",
    min: 16,
    max: 38,
    initial: 25,
    packageDefault: 25,
    type: "number",
    defaultValue: "25",
    description: "Body size; choice text defaults to 85% of it.",
  },
  {
    key: "theme.lineHeight",
    name: "theme.lineHeight",
    group: "Theme tokens",
    kind: "range",
    min: 1,
    max: 2,
    step: 0.05,
    unit: "×",
    initial: 1.5,
    packageDefault: 1.5,
    type: "number",
    defaultValue: "1.5",
    description: "Body line height; repaginates text.",
  },
  {
    key: "theme.radius",
    name: "theme.radius",
    group: "Theme tokens",
    kind: "range",
    min: 0,
    max: 32,
    initial: 14,
    packageDefault: 14,
    type: "number",
    defaultValue: "14",
    description: "Panel radius; choices and badges cap it at 10 and 8.",
  },
  {
    key: "theme.borderWidth",
    name: "theme.borderWidth",
    group: "Theme tokens",
    kind: "range",
    min: 0,
    max: 6,
    step: 0.5,
    initial: 1.5,
    packageDefault: 1.5,
    type: "number",
    defaultValue: "1.5",
    description: "Border for the panel, choices, and badge. 0 removes it.",
  },
  {
    key: "theme.accentColor",
    name: "theme.accentColor",
    group: "Theme tokens",
    kind: "color",
    initial: "#eabd78",
    packageDefault: "#eabd78",
    type: "CSS color",
    defaultValue: '"#eabd78"',
    description: "Choice markers, hover borders, pager, and unstyled speakers.",
  },
  {
    key: "theme.textColor",
    name: "theme.textColor",
    group: "Theme tokens",
    kind: "color",
    initial: "#f3eee2",
    packageDefault: "#f3eee2",
    type: "CSS color",
    defaultValue: '"#f3eee2"',
    description: "Body and choice text.",
  },
  {
    key: "theme.mutedColor",
    name: "theme.mutedColor",
    group: "Theme tokens",
    kind: "color",
    initial: "#abb7be",
    packageDefault: "#abb7be",
    type: "CSS color",
    defaultValue: '"#abb7be"',
    description: "Prompt and page counter.",
  },
  {
    key: "theme.background",
    name: "theme.background",
    group: "Theme tokens",
    kind: "color",
    initial: "rgba(15, 24, 33, 0.96)",
    packageDefault: "rgba(15, 24, 33, 0.96)",
    type: "CSS color",
    defaultValue: '"rgba(15, 24, 33, 0.96)"',
    description: "Panel, badge, and pager fill; CSS alpha is supported.",
  },
  {
    key: "theme.borderColor",
    name: "theme.borderColor",
    group: "Theme tokens",
    kind: "color",
    initial: "#50606b",
    packageDefault: "#50606b",
    type: "CSS color",
    defaultValue: '"#50606b"',
    description: "Panel and idle choice borders.",
  },
  {
    key: "theme.choiceBackground",
    name: "theme.choiceBackground",
    group: "Theme tokens",
    kind: "color",
    initial: "#182d3a",
    packageDefault: "#182d3a",
    type: "CSS color",
    defaultValue: '"#182d3a"',
    description: "Idle choice fill.",
  },
  {
    key: "theme.choiceHoverBackground",
    name: "theme.choiceHoverBackground",
    group: "Theme tokens",
    kind: "color",
    initial: "#2b4756",
    packageDefault: "#2b4756",
    type: "CSS color",
    defaultValue: '"#2b4756"',
    description: "Hovered choice fill.",
  },
  {
    key: "panel",
    name: "panel",
    group: "Panel & body",
    kind: "toggle",
    presence: true,
    initial: true,
    type: "DialogueSurfaceStyle | false",
    defaultValue: "{}",
    description: "false removes the fill and border; text stays clickable.",
  },
  {
    key: "body.textAlign",
    name: "body.textAlign",
    group: "Panel & body",
    kind: "select",
    initial: "start",
    packageDefault: "start",
    options: alignOptions,
    type: "DialogueAlign",
    defaultValue: '"start"',
    description: "Lines align by their full width, so printing never drifts.",
  },
  {
    key: "body.fontStyle",
    name: "body.fontStyle",
    group: "Panel & body",
    kind: "select",
    initial: "normal",
    packageDefault: "normal",
    options: options("normal", "italic"),
    type: '"normal" | "italic"',
    defaultValue: '"normal"',
    description: "Any text style field also works per speaker.",
  },
  {
    key: "nameplate",
    name: "nameplate",
    group: "Nameplate",
    kind: "toggle",
    presence: true,
    initial: true,
    type: "DialogueNameplateOptions | false",
    defaultValue: "{}",
    description: "false hides the speaker name everywhere.",
  },
  {
    key: "nameplate.placement",
    name: "nameplate.placement",
    group: "Nameplate",
    kind: "select",
    initial: "inside",
    packageDefault: "inside",
    options: options("inside", "border", "outside"),
    type: '"inside" | "border" | "outside"',
    defaultValue: '"inside"',
    description: "A text row, a badge on the top edge, or a badge above.",
  },
  {
    key: "nameplate.align",
    name: "nameplate.align",
    group: "Nameplate",
    kind: "select",
    initial: "start",
    packageDefault: "start",
    options: alignOptions,
    type: "DialogueAlign",
    defaultValue: '"start"',
    description: "Aligned within the panel's padding.",
  },
  {
    key: "nameplate.fontSize",
    name: "nameplate.fontSize",
    group: "Nameplate",
    kind: "range",
    min: 10,
    max: 28,
    initial: 15,
    packageDefault: 15,
    type: "number",
    defaultValue: "15",
    description: "Inside placement reserves a matching row.",
  },
  {
    key: "nameplate.textTransform",
    name: "nameplate.textTransform",
    group: "Nameplate",
    kind: "select",
    initial: "uppercase",
    packageDefault: "uppercase",
    options: options("uppercase", "none", "lowercase"),
    type: '"none" | "uppercase" | "lowercase"',
    defaultValue: '"uppercase"',
    description: "Applied to the speaker's display name.",
  },
  {
    key: "prompt",
    name: "prompt",
    group: "Prompt & page counter",
    kind: "toggle",
    presence: true,
    initial: true,
    type: "DialoguePromptOptions | false",
    defaultValue: "{}",
    description: "The reveal / continue / choose hint.",
  },
  {
    key: "prompt.align",
    name: "prompt.align",
    group: "Prompt & page counter",
    kind: "select",
    initial: "start",
    packageDefault: "start",
    options: alignOptions,
    type: "DialogueAlign",
    defaultValue: '"start"',
    description: "Keep it apart from the counter's alignment.",
  },
  {
    key: "pageCounter",
    name: "pageCounter",
    group: "Prompt & page counter",
    kind: "toggle",
    presence: true,
    initial: true,
    type: "DialoguePageCounterOptions | false",
    defaultValue: "{}",
    description: "Shown for multi-page passages.",
  },
  {
    key: "pageCounter.align",
    name: "pageCounter.align",
    group: "Prompt & page counter",
    kind: "select",
    initial: "end",
    packageDefault: "end",
    options: alignOptions,
    type: "DialogueAlign",
    defaultValue: '"end"',
    description: "Footer space is reserved while either part is on.",
  },
  {
    key: "pageCounter.showWhenSinglePage",
    name: "pageCounter.showWhenSinglePage",
    group: "Prompt & page counter",
    kind: "toggle",
    initial: false,
    packageDefault: false,
    type: "boolean",
    defaultValue: "false",
    description: "Show “1 / 1” for short passages.",
  },
  {
    key: "choiceMenu",
    name: "choiceMenu",
    group: "Choice menu",
    kind: "toggle",
    presence: true,
    initial: true,
    type: "DialogueChoiceMenuOptions | false",
    defaultValue: "{}",
    description: "false keeps choices selectable only through your own UI.",
  },
  {
    key: "choiceMenu.placement",
    name: "choiceMenu.placement",
    group: "Choice menu",
    kind: "select",
    initial: "auto",
    packageDefault: "auto",
    options: options("auto", "above", "below"),
    type: '"auto" | "above" | "below"',
    defaultValue: '"auto"',
    description: "Auto stacks toward the scene center.",
  },
  {
    key: "choiceMenu.width",
    name: "choiceMenu.width",
    group: "Choice menu",
    kind: "select",
    initial: "panel",
    packageDefault: "panel",
    options: options("panel", "400", "600", "800"),
    toProp: (value) => (value === "panel" ? value : Number(value)),
    fromProp: (value) =>
      value === "panel" || typeof value === "number" ? String(value) : undefined,
    type: 'number | "panel"',
    defaultValue: '"panel"',
    description: "Menu width; columns share it.",
  },
  {
    key: "choiceMenu.align",
    name: "choiceMenu.align",
    group: "Choice menu",
    kind: "select",
    initial: "center",
    packageDefault: "center",
    options: alignOptions,
    type: "DialogueAlign",
    defaultValue: '"center"',
    description: "Menu position against a wider panel.",
  },
  {
    key: "choiceMenu.columns",
    name: "choiceMenu.columns",
    group: "Choice menu",
    kind: "range",
    min: 1,
    max: 3,
    initial: 1,
    packageDefault: 1,
    type: "number",
    defaultValue: "1",
    description: "Rows share the tallest item's height.",
  },
  {
    key: "choiceMenu.perPage",
    name: "choiceMenu.perPage",
    group: "Choice menu",
    kind: "range",
    min: 1,
    max: 6,
    initial: 3,
    packageDefault: 3,
    type: "number",
    defaultValue: "3",
    description: "Larger lists get a pager. Try six choices.",
  },
  {
    key: "choiceMenu.gap",
    name: "choiceMenu.gap",
    group: "Choice menu",
    kind: "range",
    min: 0,
    max: 24,
    initial: 8,
    packageDefault: 8,
    type: "number",
    defaultValue: "8",
    description: "Between choices, rows, and the pager.",
  },
  {
    key: "choiceMenu.margin",
    name: "choiceMenu.margin",
    group: "Choice menu",
    kind: "range",
    min: 0,
    max: 48,
    initial: 12,
    packageDefault: 12,
    type: "number",
    defaultValue: "12",
    description: "Between the panel (or its badge) and the menu.",
  },
  {
    key: "choiceMenu.minHeight",
    name: "choiceMenu.minHeight",
    group: "Choice menu",
    kind: "range",
    min: 24,
    max: 96,
    initial: 50,
    packageDefault: 50,
    type: "number",
    defaultValue: "50",
    description: "Wrapped labels grow beyond it.",
  },
  {
    key: "choiceMenu.textAlign",
    name: "choiceMenu.textAlign",
    group: "Choice menu",
    kind: "select",
    initial: "start",
    packageDefault: "start",
    options: alignOptions,
    type: "DialogueAlign",
    defaultValue: '"start"',
    description: "Within the space after the marker.",
  },
  {
    key: "choiceMenu.marker",
    name: "choiceMenu.marker",
    group: "Choice menu",
    kind: "toggle",
    presence: true,
    initial: true,
    type: "DialogueChoiceMarkerOptions | false",
    defaultValue: "{}",
    description: "The number column; text uses labels.choiceMarker.",
  },
  {
    key: "choiceMenu.pager",
    name: "choiceMenu.pager",
    group: "Choice menu",
    kind: "toggle",
    presence: true,
    initial: true,
    type: "DialogueChoicePagerOptions | false",
    defaultValue: "{}",
    description: "false leaves later pages to ref.choose().",
  },
  {
    key: "labels.narrator",
    name: "labels.narrator",
    group: "Labels",
    kind: "text",
    initial: "Narrator",
    packageDefault: "Narrator",
    type: "string | null",
    defaultValue: '"Narrator"',
    description: "Nameplate for speaker null. Empty hides it.",
    toProp: (value) => value || null,
    fromProp: (value) => (value === null ? "" : typeof value === "string" ? value : undefined),
  },
  {
    key: "labels.reveal",
    name: "labels.reveal",
    group: "Labels",
    kind: "text",
    initial: "",
    packageDefault: "",
    type: "string",
    defaultValue: '""',
    description: "Prompt while printing, when a click reveals the page.",
  },
  {
    key: "labels.printing",
    name: "labels.printing",
    group: "Labels",
    kind: "text",
    initial: "",
    packageDefault: "",
    type: "string",
    defaultValue: '""',
    description: "Prompt while printing with allowFastSkip off.",
  },
  {
    key: "labels.nextPage",
    name: "labels.nextPage",
    group: "Labels",
    kind: "text",
    initial: "Click to continue  ›",
    packageDefault: "Click to continue  ›",
    type: "string",
    defaultValue: '"Click to continue  ›"',
    description: "Prompt when more pages of the passage follow.",
  },
  {
    key: "labels.continue",
    name: "labels.continue",
    group: "Labels",
    kind: "text",
    initial: "Click to continue  ›",
    packageDefault: "Click to continue  ›",
    type: "string",
    defaultValue: '"Click to continue  ›"',
    description: "Prompt when the passage ends without choices. Empty hides it.",
  },
  {
    key: "labels.paused",
    name: "labels.paused",
    group: "Labels",
    kind: "text",
    initial: "Paused",
    packageDefault: "Paused",
    type: "string",
    defaultValue: '"Paused"',
    description: "Prompt while the paused prop is true.",
  },
  {
    key: "labels.choose",
    name: "labels.choose",
    group: "Labels",
    kind: "text",
    initial: "Make your choice",
    packageDefault: "Make your choice",
    type: "string",
    defaultValue: '"Make your choice"',
    description: "Prompt while choices are open.",
  },
  {
    key: "labels.choiceMarker",
    name: "labels.choiceMarker",
    group: "Labels",
    kind: "select",
    initial: "padded",
    packageDefault: "padded",
    options: Object.keys(choiceMarkerFormats).map((value) => ({
      value,
      label: `${value} · ${[1, 2, 3].map((n) => formatChoiceMarker(value as ChoiceMarkerFormat, n, sampleChoice)).join(" ")}`,
    })),
    type: "ChoiceMarkerFormat | (n, choice) => string",
    defaultValue: '"padded"',
    description: "Named format, or pass your own function in code.",
  },
];
export const dialogueDefaults: DialogueSettings = Object.fromEntries(
  dialogueControls.map((spec) => [spec.key, spec.initial]),
);
/** A control is hidden when any part above it is toggled off. */
export function dialogueControlVisible(key: string, settings: DialogueSettings) {
  const path = key.split(".");
  return path.slice(0, -1).every((_, i) => settings[path.slice(0, i + 1).join(".")] !== false);
}
/**
 * Builds DialogueBox props from the controls, keeping only values that differ from `base`
 * (the package defaults, or a preset's settings when the page passes that preset by name).
 */
export function dialogueProps(
  settings: DialogueSettings,
  base: DialogueSettings = packageSettings,
) {
  const props: Record<string, unknown> = {};
  const parentOf = (key: string) => {
    const path = key.split(".");
    let parent = props;
    for (const segment of path.slice(0, -1))
      parent = (parent[segment] ??= {}) as Record<string, unknown>;
    return [parent, path[path.length - 1]] as const;
  };
  for (const spec of dialogueControls) {
    const value = settings[spec.key];
    if (spec.meta || !dialogueControlVisible(spec.key, settings) || value === base[spec.key])
      continue;
    const [parent, leaf] = parentOf(spec.key);
    if (spec.presence) {
      // Turning a part back on over a preset that hid it needs an explicit (possibly empty) object.
      if (value === false) parent[leaf] = false;
      else parent[leaf] ??= {};
    } else parent[leaf] = spec.toProp ? spec.toProp(value) : value;
  }
  return props;
}

/** Example settings a preset never changes: which component, speaker, and choices to show. */
const sessionKeys = new Set(["mode", "speaker", "choices"]);
export const presetControls = dialogueControls.filter((spec) => !sessionKeys.has(spec.key));
const packageSettings: DialogueSettings = Object.fromEntries(
  presetControls.map((spec) => [spec.key, spec.packageDefault ?? spec.initial]),
);
const get = (source: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined,
      source,
    );
const cssColor = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^)]*\)|[a-z]+)$/i;
type Checked = { value: ControlValue; note?: string } | { error: string };
/** Validates one raw prop value against a control. */
function validate(spec: DialogueControl, raw: unknown): Checked {
  const value = spec.fromProp ? spec.fromProp(raw) : raw;
  if (value === undefined) return { error: "this value cannot be shown by the demo controls" };
  switch (spec.kind) {
    case "toggle":
      return typeof value === "boolean" ? { value } : { error: "expected true or false" };
    case "range": {
      if (typeof value !== "number" || !Number.isFinite(value))
        return { error: "expected a number" };
      const clamped = Math.min(spec.max ?? value, Math.max(spec.min ?? value, value));
      return clamped === value
        ? { value }
        : { value: clamped, note: `clamped ${value} to ${clamped}` };
    }
    case "select":
      return typeof value === "string" && spec.options?.some((option) => option.value === value)
        ? { value }
        : { error: `expected one of ${spec.options?.map((option) => option.value).join(", ")}` };
    case "color":
      return typeof value === "string" && cssColor.test(value.trim())
        ? { value: value.trim() }
        : { error: "expected a CSS color" };
    default:
      return typeof value === "string" ? { value } : { error: "expected text" };
  }
}
/**
 * Converts a nested DialoguePreset (the library format) into flat control settings over the package
 * defaults. Values the controls cannot represent are reported, never silently applied.
 */
export function flattenDialoguePreset(
  preset: Record<string, unknown>,
  stage = "#ffffff",
): { settings: DialogueSettings; warnings: string[] } {
  const settings: DialogueSettings = { ...packageSettings, previewBackground: stage };
  const warnings: string[] = [];
  const handled = new Set<string>();
  for (const spec of presetControls) {
    if (spec.meta) continue;
    const raw = get(preset, spec.key);
    if (raw === undefined) continue;
    handled.add(spec.key);
    if (spec.presence) {
      if (raw === false) settings[spec.key] = false;
      else if (raw && typeof raw === "object") settings[spec.key] = true;
      else warnings.push(`${spec.key}: expected an object or false; using the default.`);
      continue;
    }
    const checked = validate(spec, raw);
    if ("error" in checked) warnings.push(`${spec.key}: ${checked.error}; using the default.`);
    else {
      settings[spec.key] = checked.value;
      if (checked.note) warnings.push(`${spec.key}: ${checked.note}.`);
    }
  }
  // Report anything set in the preset that no control covers.
  const walk = (value: unknown, path: string) => {
    if (path && handled.has(path)) {
      const spec = presetControls.find((item) => item.key === path);
      if (!spec?.presence || value === false) return;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
    } else if (path) warnings.push(`${path}: not adjustable in this demo; ignored.`);
  };
  walk(preset, "");
  return { settings, warnings };
}
export function presetMatches(settings: DialogueSettings, preset: DialogueSettings) {
  return presetControls.every((spec) => settings[spec.key] === preset[spec.key]);
}
/** Exports the library format: paste `preset` straight into `<DialogueBox preset={…} />`. */
export function exportDialoguePreset(settings: DialogueSettings, name: string) {
  return JSON.stringify(
    { name, stage: settings.previewBackground, preset: dialogueProps(settings) },
    null,
    2,
  );
}
/** Accepts exported JSON (`{ name, stage, preset }`) or a bare DialoguePreset object. */
export function parseDialoguePreset(source: string): {
  name: string | null;
  settings: DialogueSettings;
  warnings: string[];
} {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Expected a preset object.");
  const record = data as Record<string, unknown>;
  const wrapped = record.preset && typeof record.preset === "object";
  const preset = (wrapped ? record.preset : record) as Record<string, unknown>;
  const stage =
    wrapped && typeof record.stage === "string" && cssColor.test(record.stage)
      ? record.stage
      : undefined;
  const { settings, warnings } = flattenDialoguePreset(preset, stage);
  return {
    name: wrapped && typeof record.name === "string" ? record.name : null,
    settings,
    warnings,
  };
}
/** Grid line colors that stay subtle on any stage color. */
export function gridColors(background: string): [center: string, lines: string] {
  const hex = /^#?([0-9a-f]{6})$/i.exec(background)?.[1] ?? "ffffff";
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.5;
  const mix = (amount: number) =>
    `#${rgb
      .map((channel) => Math.round(channel + ((light ? 0 : 255) - channel) * amount))
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  return light ? [mix(0.22), mix(0.09)] : [mix(0.25), mix(0.08)];
}

const text = "DialogueTextStyle";
export const dialogueReference: PropDoc[] = [
  {
    name: "preset",
    type: "DialoguePresetName | DialoguePreset",
    defaultValue: "undefined",
    description:
      "A built-in look (threeframe, parchment, visualNovel, terminal, subtitles, storybook, noir, topHud, chatBubble, royalFantasy) or your own preset object. Every other prop deep-merges over it. Presets are plain JSON: Export in the Presets panel gives you one.",
    example: 'preset="noir" theme={{ accentColor: "#ffd166" }}',
  },
  {
    name: "text / source",
    type: "string",
    defaultValue: "required",
    description:
      "DialogueBox takes text; InkStory takes raw Ink or compiled JSON. Edit the source under the example.",
  },
  {
    name: "speaker",
    type: "string | null",
    defaultValue: "null",
    description: "Key into speakers. Unknown keys display as-is; null shows labels.narrator.",
  },
  {
    name: "speakers",
    type: "Record<string, SpeakerStyle>",
    defaultValue: "{}",
    description:
      "Per speaker: name, accent color (nameplate text and badge border), and nameplate, body, or panel overrides layered above the component props.",
    example: 'keeper: { name: "The keeper", color: "#99d2c4", body: { fontStyle: "italic" } }',
  },
  {
    name: "choices",
    type: "NarrativeChoice[]",
    defaultValue: "[]",
    description: "Shown after the final page finishes printing.",
  },
  {
    name: "reveal",
    type: "RevealMode",
    defaultValue: '"character"',
    description: "character, word, line (wrapped visual lines), or instant.",
  },
  {
    name: "speed",
    type: "number",
    defaultValue: "36",
    description: "Reveal units per second; 0 reveals the full page.",
  },
  {
    name: "allowFastSkip",
    type: "boolean",
    defaultValue: "true",
    description: "A click during printing reveals this page, not the next one.",
  },
  {
    name: "paused",
    type: "boolean",
    defaultValue: "false",
    description: "Pause printing and ignore player actions; the prompt shows labels.paused.",
  },
  {
    name: "initialPlayback",
    type: "DialoguePlayback",
    defaultValue: "undefined",
    description: "Page and UTF-16 reveal offset applied on mount, from ref.save().",
  },
  {
    name: "position",
    type: "[x, y, z]",
    defaultValue: "[0, -220, 100]",
    description:
      "Panel center in scene units; Y points up. Also decides the auto choice placement.",
  },
  {
    name: "width / height",
    type: "number",
    defaultValue: "1120 / 210",
    description: "Panel size. Width controls wrapping; overflow becomes another page.",
  },
  {
    name: "padding",
    type: "DialoguePadding",
    defaultValue: "28",
    description: "number, [vertical, horizontal], or [top, right, bottom, left].",
  },
  {
    name: "resolution",
    type: "number",
    defaultValue: "2",
    description: "Canvas pixels per scene unit for every dialogue texture.",
  },
  {
    name: "theme",
    type: "Partial<DialogueTheme>",
    defaultValue: "defaultDialogueTheme",
    description:
      "Shared tokens. Every part reads its defaults from these, so one token restyles everything that uses it.",
  },
  {
    name: "theme.fontFamily / uiFontFamily",
    type: "string",
    defaultValue: '"Georgia, serif" / "system-ui, sans-serif"',
    description:
      "Story text (body, choices) and interface text (nameplate, prompt, counter, markers, pager). Load a fontAsset before measuring custom fonts.",
  },
  {
    name: "theme.fontSize / lineHeight",
    type: "number",
    defaultValue: "25 / 1.5",
    description: "Body metrics. Choice text defaults to 85% of fontSize.",
  },
  {
    name: "theme.textColor / mutedColor / accentColor",
    type: "CSS color",
    defaultValue: '"#f3eee2" / "#abb7be" / "#eabd78"',
    description:
      "Story text; prompt and counter; nameplate, markers, hover border, and pager. A speaker's color replaces the accent for its nameplate.",
  },
  {
    name: "theme.background / borderColor / borderWidth / radius",
    type: "CSS color / number",
    defaultValue: '"rgba(15, 24, 33, 0.96)" / "#50606b" / 1.5 / 14',
    description:
      "Panel surface. The badge and pager share the background; choices and badges cap the radius at 10 and 8.",
  },
  {
    name: "theme.choiceBackground / choiceHoverBackground",
    type: "CSS color",
    defaultValue: '"#182d3a" / "#2b4756"',
    description: "Idle and hovered choice fills.",
  },
  {
    name: "panel",
    type: "DialogueSurfaceStyle | false",
    defaultValue: "theme surface",
    description:
      "background, borderColor, borderWidth, radius. false draws no surface; the area stays clickable.",
  },
  {
    name: "body",
    type: `${text} & { textAlign }`,
    defaultValue: "theme text",
    description: "Passage text style. Alignment uses each full line so printing never drifts.",
  },
  {
    name: "nameplate",
    type: "DialogueNameplateOptions | false",
    defaultValue: '{ placement: "inside" }',
    description:
      "placement (inside, border, outside), align, gap, offset [x, y], plus text style. Badges (border, outside) also take surface and padding. Choice menus above the panel clear the badge automatically.",
    example: 'nameplate={{ placement: "border", align: "center", surface: { radius: 99 } }}',
  },
  {
    name: "prompt",
    type: "DialoguePromptOptions | false",
    defaultValue: '{ align: "start" }',
    description:
      "The reveal / continue / choose / paused hint: align, gap above the footer row, plus text style (12px uppercase muted).",
  },
  {
    name: "pageCounter",
    type: "DialoguePageCounterOptions | false",
    defaultValue: '{ align: "end" }',
    description:
      "Same options as prompt, plus showWhenSinglePage. Footer height is reserved while either part is enabled.",
  },
  {
    name: "choiceMenu",
    type: "DialogueChoiceMenuOptions | false",
    defaultValue: "{}",
    description:
      "Layout, item style, marker, and pager. Text style fields style the choice labels. false hides the menu; ref.choose() still works.",
  },
  {
    name: "choiceMenu layout",
    type: "placement · align · width · offset · margin · gap · columns · perPage",
    defaultValue: '"auto" · "center" · "panel" · [0, 0] · 12 · 8 · 1 · 3',
    description:
      "auto stacks above a panel in the lower half of the scene and below one in the upper half. Choices always read top to bottom.",
  },
  {
    name: "choiceMenu item",
    type: "padding · minHeight · textAlign · surface",
    defaultValue: '[12, 30] · 50 · "start" · choice tokens',
    description: "Each choice is its own clickable surface; wrapped labels grow past minHeight.",
  },
  {
    name: "choiceMenu.hover",
    type: "{ color, markerColor, surface }",
    defaultValue: "hover tokens",
    description: "Hover styles exclude metrics, so hovering never shifts the layout.",
  },
  {
    name: "choiceMenu.marker / pager",
    type: "options | false",
    defaultValue: "{}",
    description:
      "Marker: text style, gap, fixed width (defaults to the widest marker). Pager: text style, height, surface; click its left or right half.",
  },
  {
    name: text,
    type: "fontFamily · fontSize · fontWeight · fontStyle · color · lineHeight · letterSpacing · textTransform",
    defaultValue: "per part",
    description:
      "Shared by body, nameplate, prompt, pageCounter, choiceMenu, marker, and pager. Font metrics repaginate text.",
  },
  {
    name: "labels",
    type: "Partial<DialogueLabels>",
    defaultValue: "defaultDialogueLabels",
    description:
      "Every drawn string in one place for localization: narrator; prompts for each state (reveal, printing, nextPage, continue, choose, paused); page(p, n), choiceMarker(n, choice), choicePage(p, n), previousChoices, nextChoices. An empty prompt label hides the prompt in that state.",
    example: 'labels={{ continue: "Tap ›", page: (p, n) => `${p}/${n}` }}',
  },
  {
    name: "onAdvance / onChoose",
    type: "callbacks",
    defaultValue: "undefined",
    description:
      "Handle completed passages and selections in DialogueBox; InkStory routes them to Ink.",
  },
  {
    name: "onDisplayChange / onPrintComplete",
    type: "callbacks",
    defaultValue: "undefined",
    description:
      "Page, printing, and choice changes (not every character); once per completed page.",
  },
  {
    name: "ref",
    type: "DialogueHandle",
    defaultValue: "undefined",
    description: "advance(), skip(), choose(index), and save(). Skip respects allowFastSkip.",
  },
];

export interface SpineSettings {
  format: string;
  animation: string;
  loop: boolean;
  paused: boolean;
  timeScale: number;
  mixDuration: number;
  flipX: boolean;
  flipY: boolean;
  scale: number;
  tint: string;
  opacity: number;
  track: string;
  trackAlpha: number;
  followUp: string;
  /** Example-only: the stage color behind the preview. */
  previewBackground: string;
}
export const spineDefaults: SpineSettings = {
  format: "json",
  animation: "idle",
  loop: true,
  paused: false,
  timeScale: 1,
  mixDuration: 0.2,
  flipX: false,
  flipY: false,
  scale: 0.8,
  tint: "#ffffff",
  opacity: 1,
  track: "",
  trackAlpha: 1,
  followUp: "",
  previewBackground: "#ffffff",
};
/** SpineSprite props from the controls; optional features appear only when used. */
export function spineProps(settings: SpineSettings) {
  const {
    format: _format,
    previewBackground: _previewBackground,
    track,
    trackAlpha,
    followUp,
    flipY,
    ...rest
  } = settings;
  return {
    ...rest,
    ...(flipY ? { flipY } : {}),
    ...(track ? { tracks: [{ animation: track, alpha: trackAlpha }] } : {}),
    ...(followUp
      ? { queue: [{ animation: followUp }, { animation: settings.animation, loop: settings.loop }] }
      : {}),
  };
}
export const spineControls: ControlSpec<SpineSettings>[] = [
  {
    key: "animation",
    name: "animation",
    group: "Animation",
    kind: "select",
    options: options("idle", "walk", "run", "jump"),
    type: "string",
    defaultValue: "undefined",
    description: "Animation name from the loaded skeleton.",
  },
  {
    key: "timeScale",
    name: "timeScale",
    group: "Animation",
    kind: "range",
    min: 0,
    max: 2,
    step: 0.1,
    unit: "×",
    type: "number",
    defaultValue: "1",
    description: "Playback rate; 0 freezes animation time.",
  },
  {
    key: "mixDuration",
    name: "mixDuration",
    group: "Animation",
    kind: "range",
    min: 0,
    max: 1,
    step: 0.1,
    unit: "sec",
    type: "number",
    defaultValue: "0.2",
    description: "Blend duration when switching animations.",
  },
  {
    key: "loop",
    name: "loop",
    group: "Animation",
    kind: "toggle",
    type: "boolean",
    defaultValue: "true",
    description: "Repeat the selected animation.",
  },
  {
    key: "paused",
    name: "paused",
    group: "Animation",
    kind: "toggle",
    type: "boolean",
    defaultValue: "false",
    description: "Stop frame updates without resetting the pose.",
  },
  {
    key: "scale",
    name: "scale",
    group: "Appearance",
    kind: "range",
    min: 0.3,
    max: 0.9,
    step: 0.01,
    type: "number",
    defaultValue: "1",
    description: "R3F group scale; each sprite stays independent.",
  },
  {
    key: "opacity",
    name: "opacity",
    group: "Appearance",
    kind: "range",
    min: 0.1,
    max: 1,
    step: 0.1,
    type: "number",
    defaultValue: "1",
    description: "Multiply the skeleton’s alpha.",
  },
  {
    key: "tint",
    name: "tint",
    group: "Appearance",
    kind: "color",
    type: "hex color",
    defaultValue: '"#ffffff"',
    description: "Multiply the skeleton’s color.",
  },
  {
    key: "flipX",
    name: "flipX",
    group: "Appearance",
    kind: "toggle",
    type: "boolean",
    defaultValue: "false",
    description: "Mirror the character horizontally.",
  },
  {
    key: "track",
    name: "tracks",
    group: "Tracks & queue",
    kind: "select",
    options: [
      { value: "", label: "None" },
      { value: "aim", label: "aim (track 1)" },
      { value: "shoot", label: "shoot (track 1)" },
    ],
    type: "SpineTrack[]",
    defaultValue: "[]",
    description: "Blend another animation above the base, e.g. aim while walking.",
  },
  {
    key: "trackAlpha",
    name: "tracks[0].alpha",
    group: "Tracks & queue",
    kind: "range",
    min: 0,
    max: 1,
    step: 0.05,
    type: "number",
    defaultValue: "1",
    description: "Blend weight of the overlay track.",
  },
  {
    key: "followUp",
    name: "queue",
    group: "Tracks & queue",
    kind: "select",
    options: [
      { value: "", label: "None" },
      { value: "jump", label: "jump, then back to base" },
      { value: "shoot", label: "shoot, then back to base" },
    ],
    type: "SpineQueuedAnimation[]",
    defaultValue: "[]",
    description: "Played after the current loop, in order.",
  },
  {
    key: "flipY",
    name: "flipY",
    group: "Appearance",
    kind: "toggle",
    type: "boolean",
    defaultValue: "false",
    description: "Mirror the character vertically.",
  },
  {
    key: "format",
    name: "spineAsset.format",
    group: "Asset",
    kind: "select",
    options: options("json", "binary"),
    type: '"json" | "binary"',
    defaultValue: '"json"',
    description: "Load a .json or .skel file; both use Spine 4.3.",
  },
  {
    key: "previewBackground",
    name: "Preview background",
    group: "Preview",
    kind: "color",
    type: "example option",
    defaultValue: "—",
    description: "Stage color behind the sprite; the grid follows it.",
  },
];
export const spineReference: PropDoc[] = [
  {
    name: "asset",
    type: "SpineAsset",
    defaultValue: "required",
    description:
      "Skeleton and atlas descriptor from spineAsset; atlas page textures are loaded automatically. Its skin and attachments are the defaults for those props.",
  },
  ...spineControls.filter((spec) => spec.key !== "previewBackground"),
  {
    name: "position",
    type: "[x, y, z]",
    defaultValue: "[0, 0, 0]",
    description: "Standard R3F group coordinates. The example uses [0, −270, 0].",
  },
  {
    name: "listener",
    type: "AnimationStateListener",
    defaultValue: "undefined",
    description: "Listen for start, complete, event, interrupt, end, and dispose.",
  },
  {
    name: "ref",
    type: "SpineSpriteHandle",
    defaultValue: "undefined",
    description: "play, queue, clear, or access the raw mesh and animation state.",
  },
  {
    name: "mixes",
    type: "[from, to, seconds][]",
    defaultValue: "[]",
    description: "Per-transition blend times that override mixDuration.",
    example: 'mixes={[["walk", "run", 0.4], ["run", "idle", 0.1]]}',
  },
  {
    name: "skin",
    type: "string | string[]",
    defaultValue: "asset.skin ?? default skin",
    description: "Several names combine into one skin, in order, for mix-and-match outfits.",
  },
  {
    name: "attachments",
    type: "Record<string, string | null>",
    defaultValue: "asset.attachments ?? {}",
    description:
      "Slot attachment overrides by slot name, applied over the skin's setup pose; null hides the slot.",
    example: 'attachments={{ mouth: "frown", hat: null }}',
  },
  {
    name: "colors",
    type: "Record<string, string>",
    defaultValue: "asset.colors ?? {}",
    description:
      "Colors by the asset's color group (or slot name), tinting the slots with a multiply or, for groups with gradient shading, Spine's two-color tint.",
    example: 'colors={{ hair: "#c1b01c", skin: "#f3c98b" }}',
  },
  {
    name: "material",
    type: "SpineMaterialOptions",
    defaultValue: "{ alphaTest: 0.001, depthTest: true, depthWrite: false }",
    description:
      "alphaTest, depthTest, depthWrite, toneMapped, twoColorTint. Changing it rebuilds the mesh.",
  },
];

export interface SceneSettings {
  backdrop: string;
  cameraFit: "contain" | "cover";
  fit: "contain" | "cover" | "stretch" | "none";
  opacity: number;
  width: number;
  height: number;
  scale: number;
  alignX: number;
  alignY: number;
  tint: string;
  flipX: boolean;
  zoom: number;
  centerX: number;
  centerY: number;
  background: string;
}
export const sceneDefaults: SceneSettings = {
  backdrop: "valley",
  cameraFit: "contain",
  fit: "cover",
  opacity: 1,
  width: 960,
  height: 540,
  scale: 1,
  alignX: 0,
  alignY: 0,
  tint: "#ffffff",
  flipX: false,
  zoom: 1,
  centerX: 0,
  centerY: 0,
  background: "#14232c",
};
/** Backdrop props from the controls, omitting package defaults. */
export function sceneBackdropProps(settings: SceneSettings) {
  return {
    fit: settings.fit,
    opacity: settings.opacity,
    width: settings.width,
    height: settings.height,
    ...(settings.scale !== 1 ? { scale: settings.scale } : {}),
    ...(settings.alignX || settings.alignY
      ? { align: [settings.alignX, settings.alignY] as [number, number] }
      : {}),
    ...(settings.tint !== "#ffffff" ? { tint: settings.tint } : {}),
    ...(settings.flipX ? { flipX: true } : {}),
  };
}
/** SceneCanvas camera props from the controls, omitting package defaults. */
export function sceneCameraProps(settings: SceneSettings) {
  return {
    fit: settings.cameraFit,
    background: settings.background,
    ...(settings.zoom !== 1 ? { zoom: settings.zoom } : {}),
    ...(settings.centerX || settings.centerY
      ? { center: [settings.centerX, settings.centerY] as [number, number] }
      : {}),
  };
}
export const sceneControls: ControlSpec<SceneSettings>[] = [
  {
    key: "backdrop",
    name: "asset",
    group: "Backdrop",
    kind: "select",
    options: options("valley", "tower"),
    type: "Asset<Texture>",
    defaultValue: "required",
    description: "Texture descriptor created with textureAsset(url).",
  },
  {
    key: "fit",
    name: "fit",
    group: "Backdrop",
    kind: "select",
    options: options("cover", "contain", "stretch", "none"),
    type: "cover | contain | stretch | none",
    defaultValue: '"cover"',
    description: "Size the image relative to the bounds; none keeps its natural size.",
  },
  {
    key: "scale",
    name: "scale",
    group: "Backdrop",
    kind: "range",
    min: 0.5,
    max: 2,
    step: 0.05,
    unit: "×",
    type: "number",
    defaultValue: "1",
    description: "Multiply the fitted size.",
  },
  {
    key: "alignX",
    name: "align[0]",
    group: "Backdrop",
    kind: "range",
    min: -1,
    max: 1,
    step: 0.1,
    type: "[x, y]",
    defaultValue: "[0, 0]",
    description: "-1 shows the left edge of a cropped image; 1 the right.",
  },
  {
    key: "alignY",
    name: "align[1]",
    group: "Backdrop",
    kind: "range",
    min: -1,
    max: 1,
    step: 0.1,
    type: "[x, y]",
    defaultValue: "[0, 0]",
    description: "-1 bottom, 1 top. Try fit contain with a tall bound.",
  },
  {
    key: "tint",
    name: "tint",
    group: "Backdrop",
    kind: "color",
    type: "CSS color",
    defaultValue: '"#ffffff"',
    description: "Multiply the image color, e.g. for dusk.",
  },
  {
    key: "flipX",
    name: "flipX",
    group: "Backdrop",
    kind: "toggle",
    type: "boolean",
    defaultValue: "false",
    description: "Mirror the image horizontally.",
  },
  {
    key: "width",
    name: "width",
    group: "Backdrop",
    kind: "range",
    min: 640,
    max: 1280,
    step: 20,
    type: "number",
    defaultValue: "1280",
    description: "Backdrop bounds in scene units.",
  },
  {
    key: "height",
    name: "height",
    group: "Backdrop",
    kind: "range",
    min: 360,
    max: 720,
    step: 20,
    type: "number",
    defaultValue: "720",
    description: "Change the aspect ratio to compare fit modes.",
  },
  {
    key: "opacity",
    name: "opacity",
    group: "Backdrop",
    kind: "range",
    min: 0,
    max: 1,
    step: 0.1,
    type: "number",
    defaultValue: "1",
    description: "Blend with the scene’s background color.",
  },
  {
    key: "cameraFit",
    name: "SceneCanvas.fit",
    group: "Camera",
    kind: "select",
    options: options("contain", "cover"),
    type: "contain | cover",
    defaultValue: '"contain"',
    description: "Fit the 1280 × 720 design space to this viewport.",
  },
  {
    key: "zoom",
    name: "SceneCanvas.zoom",
    group: "Camera",
    kind: "range",
    min: 0.5,
    max: 3,
    step: 0.1,
    unit: "×",
    type: "number",
    defaultValue: "1",
    description: "Multiply the fitted scale.",
  },
  {
    key: "centerX",
    name: "SceneCanvas.center[0]",
    group: "Camera",
    kind: "range",
    min: -500,
    max: 500,
    step: 10,
    type: "[x, y]",
    defaultValue: "[0, 0]",
    description: "Pan: the design point at the viewport center.",
  },
  {
    key: "centerY",
    name: "SceneCanvas.center[1]",
    group: "Camera",
    kind: "range",
    min: -300,
    max: 300,
    step: 10,
    type: "[x, y]",
    defaultValue: "[0, 0]",
    description: "Positive Y pans up.",
  },
  {
    key: "background",
    name: "SceneCanvas.background",
    group: "Camera",
    kind: "color",
    type: "CSS color",
    defaultValue: "transparent",
    description: "Clear color; omit to show the page behind the canvas.",
  },
];
export const sceneReference: PropDoc[] = [
  ...sceneControls,
  {
    name: "SceneCanvas.width / height",
    type: "number",
    defaultValue: "1280 / 720",
    description: "Orthographic design dimensions. The origin is centered, with positive Y upward.",
  },
  {
    name: "z",
    type: "number",
    defaultValue: "-100",
    description: "Backdrop depth; larger values place objects closer to the camera.",
  },
  {
    name: "AssetStore.preload",
    type: "(assets) => Promise<void>",
    defaultValue: "—",
    description: "Load a manifest in parallel; duplicate keys share one promise.",
  },
  {
    name: "AssetStore.retryFailed",
    type: "() => void",
    defaultValue: "—",
    description: "Clear failed records, then call load/preload again. Ready assets remain cached.",
  },
  {
    name: "useOwnedAssetStore",
    type: "hook",
    defaultValue: "—",
    description: "Own a cache for this component and dispose resources when it unmounts.",
  },
  {
    name: "Backdrop offset / flipY / renderOrder",
    type: "[x, y] / boolean / number",
    defaultValue: "[0, 0] / false / undefined",
    description: "Translate after alignment, mirror vertically, or control draw order.",
  },
  {
    name: "SceneCanvas.near / far",
    type: "number",
    defaultValue: "0.1 / 2000",
    description: "Depth range; the camera sits midway so z = 0 is always visible.",
  },
  {
    name: "CanvasPanel opacity / pixelated / depthTest",
    type: "number / boolean / boolean",
    defaultValue: "1 / false / false",
    description:
      "Native canvas UI: fade it, use nearest-neighbor sampling for pixel art, or let closer objects hide it.",
  },
];
