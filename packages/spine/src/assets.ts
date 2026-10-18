import {
  AssetManager,
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  type SkeletonData,
  type TextureAtlas,
} from "@esotericsoftware/spine-threejs";
import type { Asset } from "@threeframe/core";

export interface SpineSource {
  skeleton: string;
  atlas: string;
  format?: "json" | "binary";
  scale?: number;
}
export interface SpineAssetData {
  data: SkeletonData;
  manager: AssetManager;
}

export function spineAsset({
  skeleton,
  atlas,
  format = "json",
  scale = 1,
}: SpineSource): Asset<SpineAssetData> {
  return {
    key: `spine:${format}:${scale}:${skeleton}:${atlas}`,
    async load(signal) {
      const manager = new AssetManager();
      // Both must settle before disposing: the atlas also owns asynchronous page textures.
      const results = await Promise.allSettled([
        manager.loadTextureAtlasAsync(atlas),
        format === "binary" ? manager.loadBinaryAsync(skeleton) : manager.loadJsonAsync(skeleton),
      ]);
      try {
        signal.throwIfAborted();
        for (const result of results)
          if (result.status === "rejected") throw new Error(String(result.reason));
        const attachmentLoader = new AtlasAttachmentLoader(manager.require(atlas) as TextureAtlas);
        let data: SkeletonData;
        if (format === "binary") {
          const reader = new SkeletonBinary(attachmentLoader);
          reader.scale = scale;
          data = reader.readSkeletonData(manager.require(skeleton) as Uint8Array);
        } else {
          const json = manager.require(skeleton) as { skeleton?: { spine?: string } };
          if (!json.skeleton?.spine?.startsWith("4.3."))
            throw new Error(
              `Spine 4.3 exports are required; got ${json.skeleton?.spine ?? "unknown"}.`,
            );
          const reader = new SkeletonJson(attachmentLoader);
          reader.scale = scale;
          data = reader.readSkeletonData(json);
        }
        return { data, manager };
      } catch (error) {
        manager.dispose();
        throw error;
      }
    },
    dispose: ({ manager }) => manager.dispose(),
  };
}
