import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  TextureAtlas,
  ThreeJsTexture,
  type SkeletonData,
} from "@esotericsoftware/spine-threejs";
import {
  dirname,
  fetchAsset,
  joinPath,
  sourceKey,
  useAsset,
  type Asset,
  type FileSource,
} from "@threeframe/core";
import type { SpineColorGroups, SpineColors } from "./colors";
import type { SpineFlipSkins, SpineSlotHides } from "./skins";
import type { SpineHolds, SpineTransition } from "./transitions";

/** Appearance a `SpineSprite` starts with when it doesn't set its own. */
export interface SpineAppearance {
  /** Skin name, or several combined in order. Omit for the default skin. */
  skin?: string | readonly string[];
  /** Slot attachment overrides by slot name; `null` hides the slot. */
  attachments?: Readonly<Record<string, string | null>>;
  /** Chosen colors by color group (see `colorGroups`) or slot name. */
  colors?: SpineColors;
}
/** How a skeleton's parts relate, shared by every sprite of an asset. */
export interface SpineRig {
  /** Recolorable parts, which `colors` refer to by name. */
  colorGroups?: SpineColorGroups;
  /**
   * Slots hidden while a skin is worn, by skin name or skin folder, e.g. a gag hiding the mouth:
   * `{ "accessories/gag": ["mouth"] }`. Hidden slots stay hidden during animations that only key
   * their attachment.
   */
  hides?: SpineSlotHides;
  /**
   * Skins sprites add while flipped, by the skin name or folder they go with, for parts that
   * belong to one side of the character: `{ "body/hair/bob": ["flipped/body/hair/bob"] }`.
   */
  flipSkins?: SpineFlipSkins;
  /**
   * Animations played on the way between two others on the same track, as `[from, to, via]`:
   * poses to pass through or transition animations, e.g.
   * `["pose/crossed", "pose/behind-back", ["pose/side"]]` or `["run", "idle", ["run-to-idle"]]`.
   */
  transitions?: readonly SpineTransition[];
  /**
   * Animations held while a skin is worn, by skin name or folder: while a chest rope is worn,
   * `{ "accessories/chestbind": "pose/behind-back" }` makes any `pose/…` track (or the base
   * animation, if it is one) play `pose/behind-back`, and adds that track if none plays a pose.
   */
  holds?: SpineHolds;
}
export interface SpineSource extends SpineAppearance, SpineRig {
  skeleton: string;
  atlas: string;
  format?: "json" | "binary";
  scale?: number;
  /**
   * Where `skeleton`, `atlas` and the atlas page images are read from; plain URLs by default. Page
   * images resolve relative to the atlas, so packaged or in-memory exports work unchanged.
   */
  source?: FileSource;
}
export interface SpineAssetData {
  data: SkeletonData;
  atlas: TextureAtlas;
}
/**
 * Loads skeleton data and its atlas. The appearance defaults and rig are not part of the cache key, so assets that differ only in `skin`/`attachments`/`colors` share one load.
 */
export interface SpineAsset extends Asset<SpineAssetData>, SpineAppearance, SpineRig {}

async function loadImage(blob: Blob, signal: AbortSignal) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function spineAsset({
  skeleton,
  atlas,
  format = "json",
  scale = 1,
  source,
  skin,
  attachments,
  colors,
  colorGroups,
  hides,
  flipSkins,
  transitions,
  holds,
}: SpineSource): SpineAsset {
  return {
    skin,
    attachments,
    colors,
    colorGroups,
    hides,
    flipSkins,
    transitions,
    holds,
    key: `spine:${format}:${scale}:${sourceKey(source)}${skeleton}:${atlas}`,
    async load(signal) {
      const readSkeleton = async (): Promise<string | ArrayBuffer> => {
        const response = await fetchAsset(skeleton, signal, source);
        return format === "binary" ? response.arrayBuffer() : response.text();
      };
      const [atlasText, skeletonFile] = await Promise.all([
        fetchAsset(atlas, signal, source).then((response) => response.text()),
        readSkeleton(),
      ]);
      const textureAtlas = new TextureAtlas(atlasText);
      try {
        // Pages resolve next to the atlas, like the Spine runtime's own asset manager.
        const pagePath = (name: string) =>
          source
            ? joinPath(dirname(atlas), name)
            : new URL(name, new URL(atlas, globalThis.location?.href)).href;
        await Promise.all(
          textureAtlas.pages.map(async (page) => {
            const path = pagePath(page.name);
            const blob = await (await fetchAsset(path, signal, source)).blob();
            page.setTexture(new ThreeJsTexture(await loadImage(blob, signal), page.pma));
          }),
        );
        signal.throwIfAborted();
        const attachmentLoader = new AtlasAttachmentLoader(textureAtlas);
        let data: SkeletonData;
        if (format === "binary") {
          const reader = new SkeletonBinary(attachmentLoader);
          reader.scale = scale;
          data = reader.readSkeletonData(new Uint8Array(skeletonFile as ArrayBuffer));
        } else {
          let json: { skeleton?: { spine?: string } };
          try {
            json = JSON.parse(skeletonFile as string);
          } catch (cause) {
            throw new Error(`Invalid Spine skeleton JSON: ${skeleton}`, { cause });
          }
          if (!json.skeleton?.spine?.startsWith("4.3."))
            throw new Error(
              `Spine 4.3 exports are required; got ${json.skeleton?.spine ?? "unknown"}.`,
            );
          const reader = new SkeletonJson(attachmentLoader);
          reader.scale = scale;
          data = reader.readSkeletonData(json);
        }
        return { data, atlas: textureAtlas };
      } catch (error) {
        textureAtlas.dispose();
        throw error;
      }
    },
    dispose: ({ atlas: loaded }) => loaded.dispose(),
  };
}

/** Reads a Spine asset's skeleton data through Suspense, e.g. to list its skins or animations. */
export function useSpineData(asset: Asset<SpineAssetData>): SkeletonData {
  return useAsset(asset).data;
}
