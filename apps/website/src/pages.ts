import type { ComponentType } from "react";

export interface PageHandle {
  icon?: string;
  label: string;
  package?: string;
  description: string;
}
export interface Page extends PageHandle {
  path: string;
  icon: string;
  load: () => Promise<{ default: ComponentType }>;
}

export const pages: Page[] = [
  {
    path: "narrative-game",
    icon: "story",
    label: "NarrativeGame",
    package: "engine",
    description: "Play a complete Ink story with scenes, characters, and dialogue.",
    load: () => import("./pages/NarrativeGamePage"),
  },
  {
    path: "dialogue",
    icon: "ink",
    label: "Dialogue",
    package: "ink",
    description: "Render plain text or an Ink story with configurable pacing and layout.",
    load: () => import("./pages/DialoguePage"),
  },
  {
    path: "spine-sprite",
    icon: "spine",
    label: "SpineSprite",
    package: "spine",
    description: "Load a Spine character and control its animation and appearance.",
    load: () => import("./pages/SpineSpritePage"),
  },
  {
    path: "scene-assets",
    icon: "assets",
    label: "Scene & assets",
    package: "core",
    description: "Compose an orthographic scene with cached assets and a backdrop.",
    load: () => import("./pages/SceneAssetsPage"),
  },
];
export const notFound: PageHandle = {
  label: "Page not found",
  description: "There is no component page at this address.",
};
