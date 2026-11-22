import { Backdrop, type Asset, type BackdropProps } from "@threeframe/core";
import { SpineSprite, type SpineAssetData, type SpineSpriteProps } from "@threeframe/spine";
import type { CompiledStory } from "@threeframe/ink";
import type { Texture } from "three";

export type CharacterOverrides = Pick<
  SpineSpriteProps,
  | "animation"
  | "loop"
  | "paused"
  | "timeScale"
  | "flipX"
  | "flipY"
  | "skin"
  | "opacity"
  | "tint"
  | "visible"
  | "mixDuration"
  | "mixes"
  | "tracks"
  | "queue"
  | "material"
  | "renderOrder"
>;
/** A character's look everywhere it appears; placements override it per scene. */
export interface CharacterDefinition extends CharacterOverrides {
  asset: Asset<SpineAssetData>;
}
export interface CharacterPlacement extends CharacterOverrides {
  id: string;
  position?: [number, number, number];
  scale?: number;
  /** Z rotation in radians. */
  rotation?: number;
}
export interface SceneDefinition {
  background?: Asset<Texture>;
  /** Fit, opacity, alignment, tint, and offset for this scene's background image. */
  backdrop?: Omit<BackdropProps, "asset">;
  /** Clear color behind the scene; defaults to the definition's `backgroundColor`. */
  color?: string;
  characters?: readonly CharacterPlacement[];
}
export interface GameDefinition {
  id: string;
  title: string;
  story: Asset<CompiledStory>;
  initialScene: string;
  scenes: Readonly<Record<string, SceneDefinition>>;
  characters?: Readonly<Record<string, CharacterDefinition>>;
  assets?: readonly Asset<any>[];
  width?: number;
  height?: number;
  /** Clear color for scenes without their own `color`. */
  backgroundColor?: string;
  /** Position and scale for placements that omit them. */
  characterDefaults?: { position?: [number, number, number]; scale?: number };
}
export interface StageState {
  scene: string;
  characters: Record<string, CharacterOverrides>;
}
export const initialStage = (game: GameDefinition): StageState => ({
  scene: game.initialScene,
  characters: {},
});

/** Unknown tags remain available to consumers through Ink events. */
export function applyStageTags(
  game: GameDefinition,
  previous: StageState,
  tags: readonly string[],
): StageState {
  let next = previous;
  for (const tag of tags) {
    const [command, ...parts] = tag.split(":").map((part) => part.trim());
    const id = parts[0];
    if (command === "scene") {
      if (!game.scenes[id]) throw new Error(`Unknown scene in Ink tag: ${id}`);
      next = { ...next, scene: id };
    } else if (["animation", "show", "hide"].includes(command)) {
      if (!game.characters?.[id]) throw new Error(`Unknown character in Ink tag: ${id}`);
      if (command === "animation" && !parts[1])
        throw new Error(`Missing animation in Ink tag: ${tag}`);
      next = {
        ...next,
        characters: {
          ...next.characters,
          [id]: {
            ...next.characters[id],
            ...(command === "animation"
              ? { animation: parts.slice(1).join(":") }
              : { visible: command === "show" }),
          },
        },
      };
    }
  }
  return next;
}

export function collectGameAssets(game: GameDefinition): Asset<any>[] {
  if (!game.scenes[game.initialScene])
    throw new Error(`Initial scene does not exist: ${game.initialScene}`);
  for (const scene of Object.values(game.scenes)) {
    for (const character of scene.characters ?? []) {
      if (!game.characters?.[character.id]) throw new Error(`Undefined character: ${character.id}`);
    }
  }
  const assets = [
    game.story,
    ...(game.assets ?? []),
    ...Object.values(game.scenes).flatMap((scene) => (scene.background ? [scene.background] : [])),
    ...Object.values(game.characters ?? {}).map((character) => character.asset),
  ];
  return [...new Map(assets.map((asset) => [asset.key, asset])).values()];
}

export function GameStage({
  definition,
  state,
  paused = false,
  scene: overrideScene,
  characterOverrides,
}: {
  definition: GameDefinition;
  state: StageState;
  paused?: boolean;
  scene?: string;
  characterOverrides?: Readonly<Record<string, CharacterOverrides>>;
}) {
  const scene = definition.scenes[overrideScene ?? state.scene];
  if (!scene) throw new Error(`Unknown game scene: ${overrideScene ?? state.scene}`);
  return (
    <group>
      <color attach="background" args={[scene.color ?? definition.backgroundColor ?? "#142632"]} />
      {scene.background && (
        <Backdrop
          width={definition.width}
          height={definition.height}
          {...scene.backdrop}
          asset={scene.background}
        />
      )}
      {scene.characters?.map(({ id, position, scale, rotation, ...placement }) => {
        const { asset, ...character } = definition.characters![id];
        // Lowest to highest: definition, scene placement, Ink tags, live overrides.
        const override = characterOverrides?.[id];
        return (
          <SpineSprite
            key={id}
            asset={asset}
            position={position ?? definition.characterDefaults?.position ?? [0, -200, 0]}
            scale={scale ?? definition.characterDefaults?.scale ?? 0.6}
            rotation-z={rotation ?? 0}
            {...character}
            {...placement}
            {...state.characters[id]}
            {...override}
            paused={paused || override?.paused || placement.paused || character.paused}
          />
        );
      })}
    </group>
  );
}
