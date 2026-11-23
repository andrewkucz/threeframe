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

/** Appearance a `SpineSprite` starts with when it doesn't set its own. */
export interface SpineAppearance {
  /** Skin name, or several combined in order. Omit for the default skin. */
  skin?: string | readonly string[];
  /** Slot attachment overrides by slot name; `null` hides the slot. */
  attachments?: Readonly<Record<string, string | null>>;
}
export interface SpineSource extends SpineAppearance {
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
 * Loads skeleton data and its atlas. The appearance defaults are not part of the cache key, so
 * assets that differ only in `skin`/`attachments` share one load.
 */
export interface SpineAsset extends Asset<SpineAssetData>, SpineAppearance {}

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
}: SpineSource): SpineAsset {
  return {
    skin,
    attachments,
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
