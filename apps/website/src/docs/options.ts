import type { RevealMode } from "@threeframe/core";
import { options, type ControlSpec } from "./Controls";
import type { PropDoc } from "./examples";

export interface PlayerSettings {
  paused: boolean;
  reveal: RevealMode;
  speed: number;
  fastSkip: boolean;
  font: string;
  fontSize: number;
  placement: string;
  accent: string;
  scene: string;
}
export const playerDefaults: PlayerSettings = {
  paused: false,
  reveal: "character",
  speed: 36,
  fastSkip: true,
  font: "Lora",
  fontSize: 25,
  placement: "bottom",
  accent: "#eabd78",
  scene: "",
};
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
    key: "reveal",
    name: "dialogue.reveal",
    group: "Playback",
    kind: "select",
    options: options("character", "word", "line", "instant"),
    type: "RevealMode",
    defaultValue: '"character"',
    description: "Reveal characters, words, or wrapped lines.",
  },
  {
    key: "speed",
    name: "dialogue.speed",
    group: "Playback",
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
    group: "Playback",
    kind: "toggle",
    type: "boolean",
    defaultValue: "true",
    description: "Allow a click to finish printing this page.",
  },
  {
    key: "font",
    name: "dialogue.theme.fontFamily",
    group: "Appearance",
    kind: "select",
    options: options("Lora", "system-ui", "monospace"),
    type: "string",
    defaultValue: '"Georgia, serif"',
    description: "Use a CSS family name. Lora is preloaded.",
  },
  {
    key: "fontSize",
    name: "dialogue.theme.fontSize",
    group: "Appearance",
    kind: "range",
    min: 18,
    max: 38,
    unit: "units",
    type: "number",
    defaultValue: "25",
    description: "Design units; changing size repaginates text.",
  },
  {
    key: "placement",
    name: "dialogue.position",
    group: "Appearance",
    kind: "select",
    options: options("bottom", "top"),
    type: "[x, y, z]",
    defaultValue: "[0, -220.32, 100]",
    description: "Bottom maps to −220 Y; top maps to 215 Y.",
  },
  {
    key: "accent",
    name: "dialogue.theme.accent",
    group: "Appearance",
    kind: "color",
    type: "string",
    defaultValue: '"#eabd78"',
    description: "Choice accent; also applied to the traveler’s label.",
  },
  {
    key: "scene",
    name: "scene",
    group: "Scene",
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
];
export const playerReference: PropDoc[] = [
  {
    name: "definition",
    type: "GameDefinition",
    defaultValue: "required",
    description:
      "Story, scenes, characters, and assets. Keep its identity stable; replacing it restarts playback.",
  },
  ...playerControls,
  {
    name: "dialogue.speakers",
    type: "Record<string, SpeakerStyle>",
    defaultValue: "{}",
    description: "Map speaker tags to names, label colors, and optional fonts.",
    example: 'scout: { name: "The traveler", color: "#eabd78" }',
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

export interface DialogueSettings {
  mode: string;
  reveal: RevealMode;
  speed: number;
  fastSkip: boolean;
  choices: boolean;
  speaker: string;
  width: number;
  height: number;
  padding: number;
  fontSize: number;
  background: string;
  color: string;
  radius: number;
}
export const dialogueDefaults: DialogueSettings = {
  mode: "text",
  reveal: "character",
  speed: 38,
  fastSkip: true,
  choices: false,
  speaker: "scout",
  width: 1060,
  height: 230,
  padding: 30,
  fontSize: 26,
  background: "#101d26",
  color: "#f3eee2",
  radius: 14,
};
export const dialogueControls: ControlSpec<DialogueSettings>[] = [
  {
    key: "mode",
    name: "Example component",
    group: "Source",
    kind: "select",
    options: [
      { value: "text", label: "DialogueBox · plain text" },
      { value: "ink", label: "InkStory · Ink script" },
    ],
    type: "example option",
    defaultValue: "DialogueBox",
    description: "Switch component; each keeps its own source.",
  },
  {
    key: "reveal",
    name: "reveal",
    group: "Playback",
    kind: "select",
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
    type: "number",
    defaultValue: "36",
    description: "Units per second; 0 reveals the full page.",
  },
  {
    key: "fastSkip",
    name: "allowFastSkip",
    group: "Playback",
    kind: "toggle",
    type: "boolean",
    defaultValue: "true",
    description: "Click during printing to reveal the page.",
  },
  {
    key: "choices",
    name: "choices",
    group: "Content",
    kind: "toggle",
    type: "NarrativeChoice[]",
    defaultValue: "[]",
    description: "Add two choices after the final text page.",
  },
  {
    key: "speaker",
    name: "speaker",
    group: "Content",
    kind: "select",
    options: options("scout", "keeper", "narrator"),
    type: "string | null",
    defaultValue: "null",
    description: "Select a label from the speakers dictionary.",
  },
  {
    key: "width",
    name: "width",
    group: "Layout",
    kind: "range",
    min: 440,
    max: 1160,
    step: 10,
    type: "number",
    defaultValue: "1120",
    description: "Panel width in scene units; controls wrapping.",
  },
  {
    key: "height",
    name: "height",
    group: "Layout",
    kind: "range",
    min: 160,
    max: 310,
    step: 5,
    type: "number",
    defaultValue: "210",
    description: "Panel height; overflow becomes another page.",
  },
  {
    key: "padding",
    name: "padding",
    group: "Layout",
    kind: "range",
    min: 12,
    max: 48,
    type: "number",
    defaultValue: "30",
    description: "Inner spacing around the label and text.",
  },
  {
    key: "fontSize",
    name: "theme.fontSize",
    group: "Appearance",
    kind: "range",
    min: 18,
    max: 38,
    type: "number",
    defaultValue: "25",
    description: "Font size in scene units, before camera scaling.",
  },
  {
    key: "radius",
    name: "theme.radius",
    group: "Appearance",
    kind: "range",
    min: 0,
    max: 32,
    type: "number",
    defaultValue: "14",
    description: "Panel corner radius in scene units.",
  },
  {
    key: "background",
    name: "theme.background",
    group: "Appearance",
    kind: "color",
    type: "CSS color",
    defaultValue: "rgba(15, 24, 33, 0.96)",
    description: "Dialogue container fill; CSS alpha is supported.",
  },
  {
    key: "color",
    name: "theme.color",
    group: "Appearance",
    kind: "color",
    type: "CSS color",
    defaultValue: '"#f3eee2"',
    description: "Dialogue text color.",
  },
];
export const dialogueReference: PropDoc[] = [
  {
    name: "text / source",
    type: "string",
    defaultValue: "required",
    description:
      "DialogueBox takes text; InkStory takes raw Ink or compiled JSON. Edit the source under the example.",
  },
  ...dialogueControls,
  {
    name: "speakers",
    type: "Record<string, SpeakerStyle>",
    defaultValue: "{}",
    description: "Custom label names, colors, and canvas font shorthand per speaker.",
  },
  {
    name: "position",
    type: "[x, y, z]",
    defaultValue: "[0, -220, 100]",
    description: "Scene coordinates; Y points upward. This example places the box at −180 Y.",
  },
  {
    name: "theme.fontFamily",
    type: "string",
    defaultValue: '"Georgia, serif"',
    description: "This example uses Lora. Load a fontAsset before measuring custom fonts.",
  },
  {
    name: "choicesPerPage",
    type: "number",
    defaultValue: "3",
    description: "Large decision trees get previous/next choice controls.",
  },
  {
    name: "onAdvance / onChoose",
    type: "callbacks",
    defaultValue: "undefined",
    description:
      "Handle completed passages and selections in DialogueBox; InkStory routes them to Ink.",
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
  scale: number;
  tint: string;
  opacity: number;
}
export const spineDefaults: SpineSettings = {
  format: "json",
  animation: "idle",
  loop: true,
  paused: false,
  timeScale: 1,
  mixDuration: 0.2,
  flipX: false,
  scale: 0.8,
  tint: "#ffffff",
  opacity: 1,
};
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
    key: "format",
    name: "spineAsset.format",
    group: "Asset",
    kind: "select",
    options: options("json", "binary"),
    type: '"json" | "binary"',
    defaultValue: '"json"',
    description: "Load a .json or .skel file; both use Spine 4.3.",
  },
];
export const spineReference: PropDoc[] = [
  {
    name: "asset",
    type: "Asset<SpineAssetData>",
    defaultValue: "required",
    description:
      "Skeleton and atlas descriptor from spineAsset; atlas page textures are loaded automatically.",
  },
  ...spineControls,
  {
    name: "position",
    type: "[x, y, z]",
    defaultValue: "[0, 0, 0]",
    description: "Standard R3F group coordinates. The example uses [0, −270, 0].",
  },
  {
    name: "skin",
    type: "string",
    defaultValue: "default skin",
    description: "Switch to a named skeleton skin without recreating the asset.",
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
];

export interface SceneSettings {
  backdrop: string;
  cameraFit: "contain" | "cover";
  fit: "contain" | "cover" | "stretch";
  opacity: number;
  width: number;
  height: number;
}
export const sceneDefaults: SceneSettings = {
  backdrop: "valley",
  cameraFit: "contain",
  fit: "cover",
  opacity: 1,
  width: 960,
  height: 540,
};
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
    options: options("cover", "contain", "stretch"),
    type: "cover | contain | stretch",
    defaultValue: '"cover"',
    description: "Size the image relative to the backdrop bounds.",
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
];
