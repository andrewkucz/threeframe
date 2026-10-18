import { Backdrop, type Asset } from "@threeframe/core";
import { SpineSprite, type SpineAssetData, type SpineSpriteProps } from "@threeframe/spine";
import type { CompiledStory } from "@threeframe/ink";
import type { Texture } from "three";

export interface CharacterDefinition {
  asset: Asset<SpineAssetData>;
  animation?: string;
  skin?: string;
}
export interface CharacterPlacement {
  id: string;
  position?: [number, number, number];
  scale?: number;
  flipX?: boolean;
  animation?: string;
}
export interface SceneDefinition {
  background?: Asset<Texture>;
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
}
export type CharacterOverrides = Pick<
  SpineSpriteProps,
  | "animation"
  | "paused"
  | "timeScale"
  | "flipX"
  | "skin"
  | "opacity"
  | "tint"
  | "visible"
  | "mixDuration"
>;
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
      <color attach="background" args={[scene.color ?? "#142632"]} />
      {scene.background && (
        <Backdrop asset={scene.background} width={definition.width} height={definition.height} />
      )}
      {scene.characters?.map((placement) => {
        const character = definition.characters![placement.id];
        return (
          <SpineSprite
            key={placement.id}
            asset={character.asset}
            position={placement.position ?? [0, -200, 0]}
            scale={placement.scale ?? 0.6}
            animation={placement.animation ?? character.animation}
            skin={character.skin}
            flipX={placement.flipX}
            {...state.characters[placement.id]}
            {...characterOverrides?.[placement.id]}
            paused={paused || characterOverrides?.[placement.id]?.paused}
          />
        );
      })}
    </group>
  );
}
