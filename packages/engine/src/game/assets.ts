import { textureAsset, type Asset } from "@threeframe/core";
import type { GamePackage } from "@threeframe/game";
import { spineAsset, type SpineAsset } from "@threeframe/spine";
import type { Texture } from "three";

/** Render assets for a package's characters and backdrops, created once per package. */
export interface GameAssets {
  sprite(characterId: string): SpineAsset | null;
  backdrop(backdropId: string): Asset<Texture> | null;
  /** Every renderable asset in the package, deduplicated, for preloading. */
  all(): Asset<unknown>[];
}

const cache = new WeakMap<GamePackage, GameAssets>();

export function gameAssets(pkg: GamePackage): GameAssets {
  const cached = cache.get(pkg);
  if (cached) return cached;
  const { manifest, source } = pkg;
  const sprites = new Map<string, SpineAsset | null>();
  const textures = new Map<string, Asset<Texture> | null>();
  const assets: GameAssets = {
    sprite(id) {
      if (!sprites.has(id)) {
        const character = manifest.characters?.[id];
        sprites.set(
          id,
          character?.sprite
            ? spineAsset({
                ...character.sprite,
                source,
                skin: character.skin,
                attachments: character.attachments,
              })
            : null,
        );
      }
      return sprites.get(id)!;
    },
    backdrop(id) {
      if (!textures.has(id)) {
        const backdrop = manifest.backdrops?.[id];
        textures.set(id, backdrop?.type === "image" ? textureAsset(backdrop.image, source) : null);
      }
      return textures.get(id)!;
    },
    all() {
      const list = [
        ...Object.keys(manifest.characters ?? {}).map((id) => assets.sprite(id)),
        ...Object.keys(manifest.backdrops ?? {}).map((id) => assets.backdrop(id)),
      ].filter((asset): asset is Asset<any> => !!asset);
      return [...new Map(list.map((asset) => [asset.key, asset])).values()];
    },
  };
  cache.set(pkg, assets);
  return assets;
}
