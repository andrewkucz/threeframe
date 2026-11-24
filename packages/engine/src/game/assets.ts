import { textureAsset, type Asset } from "@threeframe/core";
import { spriteView, type GamePackage } from "@threeframe/game";
import { spineAsset, type SpineAsset } from "@threeframe/spine";
import type { Texture } from "three";

/** Render assets for a package's characters and backdrops, created once per package. */
export interface GameAssets {
  /** A character's sprite, in one of its views (the first, or the sprite itself, by default). */
  sprite(characterId: string, view?: string): SpineAsset | null;
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
    sprite(id, view) {
      const character = manifest.characters?.[id];
      const shown = character?.sprite && spriteView(character.sprite, view);
      const key = `${id}\n${shown?.skeleton ?? ""}`;
      if (!sprites.has(key)) {
        sprites.set(
          key,
          character?.sprite && shown
            ? spineAsset({
                ...character.sprite,
                skeleton: shown.skeleton,
                atlas: shown.atlas,
                source,
                skin: character.skin,
                attachments: character.attachments,
                colors: character.colors,
              })
            : null,
        );
      }
      return sprites.get(key)!;
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
        ...Object.entries(manifest.characters ?? {}).flatMap(([id, character]) => [
          assets.sprite(id),
          ...(character.sprite?.views ?? []).map((view) => assets.sprite(id, view.name)),
        ]),
        ...Object.keys(manifest.backdrops ?? {}).map((id) => assets.backdrop(id)),
      ].filter((asset): asset is Asset<any> => !!asset);
      return [...new Map(list.map((asset) => [asset.key, asset])).values()];
    },
  };
  cache.set(pkg, assets);
  return assets;
}
