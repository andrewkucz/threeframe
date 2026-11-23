import { useFrame } from "@react-three/fiber";
import { layoutBackdrop, useAsset, useDisposable } from "@threeframe/core";
import {
  stageCharacter,
  stageSize,
  type GamePackage,
  type StageCharacter,
  type StageEffect,
  type StageState,
} from "@threeframe/game";
import {
  SpineSprite,
  slotAttachments,
  useSpineData,
  type SpineAsset,
  type SpineSpriteHandle,
} from "@threeframe/spine";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  CanvasTexture,
  Color,
  LinearFilter,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type ShaderMaterial,
} from "three";
import { gameAssets } from "./assets";
import { Weather } from "./weather";
import { Tween, clock } from "./tween";

/** A character's live sprite on stage, for code that needs the skeleton or its position. */
export interface StageActor {
  id: string;
  /** The Spine sprite: skeleton, animation state and mesh. */
  sprite: SpineSpriteHandle;
  /** The group positioning the character, in stage design units. */
  object: Group;
}

/** The sprites a `StageView` currently shows, by character id. */
export class StageActors {
  private actors = new Map<string, StageActor>();
  private listeners = new Set<() => void>();
  private version = 0;
  get(id: string) {
    return this.actors.get(id) ?? null;
  }
  /** @internal Called by the stage as sprites mount and unmount. */
  set(id: string, actor: StageActor | null) {
    if (actor) this.actors.set(id, actor);
    else this.actors.delete(id);
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getVersion = () => this.version;
}

/** Props for a custom one-shot effect renderer, keyed by effect type in `StageView`'s `effects`. */
export interface StageEffectProps {
  effect: StageEffect;
  width: number;
  height: number;
  /** Call once the effect has finished, so it unmounts. */
  done: () => void;
}

export interface StageViewProps {
  pkg: GamePackage;
  stage: StageState;
  paused?: boolean;
  /**
   * Problems such as skins or animations a sprite doesn't have. The stage skips them rather than
   * failing, so a typo in a script never takes the game down.
   */
  onWarning?: (message: string) => void;
  /** Renderers for custom effect types (built-ins: `shake`, `flash`; `sound` is handled by audio). */
  effects?: Readonly<Record<string, ComponentType<StageEffectProps>>>;
  /** Extra scene nodes inside the camera, above characters. */
  children?: ReactNode;
  /** Receives the live sprites of on-stage characters. */
  actors?: StageActors;
}

/** Renders a `StageState`, animating every change toward it. Place inside a `SceneCanvas`. */
export function StageView({
  pkg,
  stage,
  paused = false,
  onWarning,
  effects,
  children,
  actors,
}: StageViewProps) {
  const { manifest } = pkg;
  const { width, height } = stageSize(manifest);
  const camera = useRef<Group>(null);
  const zoom = useRef(new Tween(stage.camera.zoom));
  const panX = useRef(new Tween(stage.camera.x));
  const panY = useRef(new Tween(stage.camera.y));
  const shakes = useRef<{ start: number; duration: number; strength: number }[]>([]);
  const flashes = useRef<{ start: number; duration: number; color: string }[]>([]);
  const [customEffects, setCustomEffects] = useState<StageEffect[]>([]);
  const seenEffect = useRef(stage.effectId - 1);
  const warned = useRef(new Set<string>());
  const warn = (message: string) => {
    if (warned.current.has(message)) return;
    warned.current.add(message);
    onWarning?.(message);
  };

  const { camera: target } = stage;
  useLayoutEffect(() => {
    zoom.current.set(target.zoom, target.duration, target.ease);
    panX.current.set(target.x, target.duration, target.ease);
    panY.current.set(target.y, target.duration, target.ease);
  }, [target]);

  useEffect(() => {
    const now = clock();
    const fresh = stage.effects.filter((effect) => effect.id > seenEffect.current);
    if (!fresh.length) return;
    seenEffect.current = Math.max(...fresh.map((effect) => effect.id));
    const custom: StageEffect[] = [];
    for (const effect of fresh) {
      const duration = Number(effect.params.duration ?? 0.4);
      if (effect.type === "shake")
        shakes.current.push({
          start: now,
          duration,
          strength: Number(effect.params.strength ?? 12),
        });
      else if (effect.type === "flash")
        flashes.current.push({
          start: now,
          duration,
          color: String(effect.params.color ?? "#fff"),
        });
      else if (effects?.[effect.type]) custom.push(effect);
    }
    if (custom.length) setCustomEffects((previous) => [...previous, ...custom]);
  }, [stage.effects, effects]);

  useFrame(() => {
    const group = camera.current;
    if (!group) return;
    const now = clock();
    let offsetX = 0;
    let offsetY = 0;
    shakes.current = shakes.current.filter((shake) => now - shake.start < shake.duration);
    for (const shake of shakes.current) {
      const decay = 1 - (now - shake.start) / shake.duration;
      offsetX += Math.sin(now * 91.7 + shake.start) * shake.strength * decay;
      offsetY += Math.cos(now * 77.3 + shake.start * 2) * shake.strength * decay;
    }
    const scale = Math.max(0.05, zoom.current.at(now));
    group.scale.set(scale, scale, 1);
    group.position.set(
      -panX.current.at(now) * scale + offsetX,
      -panY.current.at(now) * scale + offsetY,
      0,
    );
  });

  const characters = Object.values(stage.characters);
  return (
    <>
      <color attach="background" args={[manifest.stage?.background ?? "#101014"]} />
      <group ref={camera}>
        <Backdrops pkg={pkg} backdrop={stage.backdrop} width={width} height={height} />
        {characters.map((character) => (
          <Suspense key={character.id} fallback={null}>
            <StageActor
              pkg={pkg}
              character={character}
              paused={paused}
              width={width}
              height={height}
              warn={warn}
              actors={actors}
            />
          </Suspense>
        ))}
        {children}
      </group>
      <Weather {...stage.weather} width={width} height={height} paused={paused} />
      <Vignette {...stage.vignette} width={width} height={height} />
      <ScreenTint
        color={stage.overlay.color}
        opacity={stage.overlay.opacity}
        duration={stage.overlay.duration}
        flashes={flashes}
        width={width}
        height={height}
      />
      {customEffects.map((effect) => {
        const Effect = effects?.[effect.type];
        return Effect ? (
          <Effect
            key={effect.id}
            effect={effect}
            width={width}
            height={height}
            done={() =>
              setCustomEffects((previous) => previous.filter((entry) => entry !== effect))
            }
          />
        ) : null;
      })}
    </>
  );
}

// Characters ---------------------------------------------------------------------------------------

function StageActor({
  pkg,
  character,
  paused,
  width,
  height,
  warn,
  actors,
}: {
  pkg: GamePackage;
  character: StageCharacter;
  paused: boolean;
  width: number;
  height: number;
  warn: (message: string) => void;
  actors?: StageActors;
}) {
  const asset = gameAssets(pkg).sprite(character.id);
  if (!asset) return null;
  return (
    <SpriteActor
      asset={asset}
      pkg={pkg}
      character={character}
      paused={paused}
      width={width}
      height={height}
      warn={warn}
      actors={actors}
    />
  );
}

export interface CharacterSpriteProps extends Partial<Omit<StageCharacter, "id" | "motion">> {
  pkg: GamePackage;
  /** A manifest character with a sprite. */
  id: string;
  paused?: boolean;
  onWarning?: (message: string) => void;
  /** Called with the sprite once it is ready. */
  onReady?: (actor: StageActor) => void;
}

/**
 * A manifest character drawn outside the stage state, e.g. by a custom scene: the same sprite,
 * skins, outfits and animation handling as on stage, at a position you control. `x` and `y` are
 * design units; `y` is the baseline and defaults to the character's.
 */
export function CharacterSprite({
  pkg,
  id,
  paused = false,
  onWarning,
  onReady,
  ...overrides
}: CharacterSpriteProps) {
  const { width, height } = stageSize(pkg.manifest);
  const key = JSON.stringify(overrides);
  const character = useMemo(
    () => stageCharacter(pkg.manifest, id, JSON.parse(key) as Partial<StageCharacter>),
    [pkg, id, key],
  );
  const asset = gameAssets(pkg).sprite(id);
  const latest = useRef(onReady);
  latest.current = onReady;
  const relay = useMemo(() => {
    const registry = new StageActors();
    registry.subscribe(() => {
      const actor = registry.get(id);
      if (actor) latest.current?.(actor);
    });
    return registry;
  }, [id]);
  if (!asset) {
    onWarning?.(`${id} has no sprite.`);
    return null;
  }
  return (
    <Suspense fallback={null}>
      <SpriteActor
        asset={asset}
        pkg={pkg}
        character={character}
        paused={paused}
        width={width}
        height={height}
        warn={(message) => onWarning?.(message)}
        actors={relay}
      />
    </Suspense>
  );
}

function SpriteActor({
  asset,
  pkg,
  character,
  paused,
  width,
  height,
  warn,
  actors,
}: {
  asset: SpineAsset;
  pkg: GamePackage;
  character: StageCharacter;
  paused: boolean;
  width: number;
  height: number;
  warn: (message: string) => void;
  actors?: StageActors;
}) {
  const data = useSpineData(asset);
  const definition = pkg.manifest.characters?.[character.id];
  const floor = pkg.manifest.stage?.floor ?? -height / 2;
  // Without an explicit scale, a sprite stands 85% of the stage tall.
  const scale = character.scale ?? definition?.scale ?? (height * 0.85) / (data.height || height);
  const baseY = character.y ?? definition?.y ?? floor;
  const id = character.id;

  const skinKey = character.skin.join("\n");
  const skin = useMemo(() => {
    const names = skinKey ? skinKey.split("\n") : [];
    // Combine in the skeleton's export (folder) order, so wearing something later never changes
    // which folder wins where skins overlap.
    const order = (name: string) => data.skins.findIndex((entry) => entry.name === name);
    const known = names.filter((name) => order(name) >= 0).sort((a, b) => order(a) - order(b));
    for (const name of names) if (!known.includes(name)) warn(`${id}: no skin named "${name}"`);
    return known;
  }, [data, skinKey, id]);
  const attachmentKey = JSON.stringify(character.attachments);
  const attachments = useMemo(() => {
    const requested = JSON.parse(attachmentKey) as Record<string, string | null>;
    const slots = new Map(slotAttachments(data, skin).map((slot) => [slot.slot, slot]));
    const valid: Record<string, string | null> = {};
    for (const [slot, name] of Object.entries(requested)) {
      const entry = slots.get(slot);
      if (entry && (name === null || entry.attachments.includes(name))) valid[slot] = name;
      else warn(`${id}: slot "${slot}" can't show "${String(name)}"`);
    }
    return valid;
  }, [data, skin, attachmentKey, id]);
  // Saves from before colors existed have none.
  const colorKey = JSON.stringify(character.colors ?? {});
  const colors = useMemo(() => {
    const requested = JSON.parse(colorKey) as Record<string, string>;
    const groups = asset.colorGroups ?? {};
    const valid: Record<string, string> = {};
    for (const [name, color] of Object.entries(requested)) {
      if (!groups[name] && !data.findSlot(name)) warn(`${id}: no color group or slot "${name}"`);
      else if (!/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color))
        warn(`${id}: invalid color "${color}" for ${name}`);
      else valid[name] = color;
    }
    return valid;
  }, [asset, data, colorKey, id]);
  const animation = (name: string | undefined) => {
    if (!name) return undefined;
    if (data.findAnimation(name)) return name;
    warn(`${id}: no animation named "${name}"`);
    return undefined;
  };
  const base = animation(character.animation);
  const next = animation(character.next);
  const overlayKey = character.overlays.join("\n");
  const tracks = useMemo(
    () =>
      (overlayKey ? overlayKey.split("\n") : [])
        .filter((name) => !!data.findAnimation(name))
        .map((name) => ({ animation: name })),
    [data, overlayKey],
  );

  const group = useRef<Group>(null);
  const sprite = useRef<SpineSpriteHandle | null>(null);
  const x = useRef(new Tween(character.x));
  const y = useRef(new Tween(baseY));
  const alpha = useRef(new Tween(character.visible ? character.opacity : 0));
  const tint = useRef({
    from: new Color(character.tint),
    to: new Color(character.tint),
    color: new Color(character.tint),
    mix: new Tween(1),
  });
  const wasVisible = useRef(character.visible);
  const mounted = useRef(false);

  const { motion } = character;
  const offstage = (edge: string | undefined) =>
    edge === "left"
      ? { x: -width * 0.75 }
      : edge === "right"
        ? { x: width * 0.75 }
        : edge === "top"
          ? { y: height }
          : edge === "bottom"
            ? { y: -height * 1.2 }
            : {};
  useLayoutEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    const duration = first && !(character.visible && motion.from) ? 0 : motion.duration;
    const appearing = character.visible && (!wasVisible.current || first);
    const leaving = !character.visible && wasVisible.current;
    wasVisible.current = character.visible;
    const enter = appearing ? offstage(motion.from) : {};
    const exit = leaving ? offstage(motion.to) : {};
    // Plain entrances fade in place; only sliding ones travel.
    if ((first && !appearing) || (appearing && enter.x === undefined && enter.y === undefined)) {
      x.current.jump(character.x);
      y.current.jump(baseY);
    }
    x.current.set(exit.x ?? character.x, duration, motion.ease, enter.x);
    y.current.set(exit.y ?? baseY, duration, motion.ease, enter.y);
    const slideIn = enter.x !== undefined || enter.y !== undefined;
    const slideOut = exit.x !== undefined || exit.y !== undefined;
    if (character.visible)
      // Sliding entrances stay opaque; plain ones fade in.
      alpha.current.set(
        character.opacity,
        duration,
        motion.ease,
        slideIn ? character.opacity : undefined,
      );
    else alpha.current.set(0, duration, slideOut ? "in" : motion.ease);
  }, [character.x, character.visible, character.opacity, baseY, motion]);

  useLayoutEffect(() => {
    const state = tint.current;
    state.from.copy(state.color);
    state.to.set(character.tint);
    state.mix.set(1, motion.duration, "inOut", 0);
  }, [character.tint]);

  useFrame(() => {
    const now = clock();
    const node = group.current;
    if (!node) return;
    node.position.set(x.current.at(now), y.current.at(now), character.z);
    const opacity = alpha.current.at(now);
    node.visible = opacity > 0.002;
    const state = tint.current;
    state.color.copy(state.from).lerp(state.to, state.mix.at(now));
    const mesh = sprite.current?.mesh;
    if (mesh) {
      mesh.skeleton.color.set(state.color.r, state.color.g, state.color.b, Math.min(1, opacity));
    }
  });

  useEffect(() => {
    const node = group.current;
    if (!actors || !node) return;
    if (sprite.current) actors.set(id, { id, sprite: sprite.current, object: node });
    return () => {
      if (actors.get(id)?.object === node) actors.set(id, null);
    };
  }, [actors, id]);

  const queue = useMemo(
    () => (!character.loop && next ? [{ animation: next, loop: true }] : undefined),
    [character.loop, next],
  );
  return (
    <group ref={group} scale={scale}>
      <SpineSprite
        asset={asset}
        skin={skin}
        attachments={attachments}
        colors={colors}
        animation={base}
        loop={character.loop}
        queue={queue}
        tracks={tracks}
        paused={paused}
        flipX={character.flip}
        onReady={(handle) => {
          sprite.current = handle;
          if (actors && group.current)
            actors.set(id, { id, sprite: handle, object: group.current });
        }}
      />
    </group>
  );
}

// Backdrops ----------------------------------------------------------------------------------------

interface BackdropLayerState {
  key: number;
  id: string | null;
  start: number;
  duration: number;
}

function Backdrops({
  pkg,
  backdrop,
  width,
  height,
}: {
  pkg: GamePackage;
  backdrop: StageState["backdrop"];
  width: number;
  height: number;
}) {
  const [layers, setLayers] = useState<BackdropLayerState[]>(() => [
    { key: 0, id: backdrop.id, start: 0, duration: 0 },
  ]);
  useLayoutEffect(() => {
    setLayers((previous) => {
      const last = previous[previous.length - 1];
      if (last && last.id === backdrop.id) return previous;
      return [
        ...previous,
        { key: (last?.key ?? 0) + 1, id: backdrop.id, start: clock(), duration: backdrop.duration },
      ];
    });
  }, [backdrop]);
  return (
    <>
      {layers.map((layer, index) => (
        <Suspense key={layer.key} fallback={null}>
          <BackdropLayer
            pkg={pkg}
            layer={layer}
            z={-500 + index}
            width={width}
            height={height}
            onShown={() =>
              setLayers((previous) => {
                const at = previous.findIndex((entry) => entry.key === layer.key);
                return at > 0 ? previous.slice(at) : previous;
              })
            }
          />
        </Suspense>
      ))}
    </>
  );
}

function BackdropLayer({
  pkg,
  layer,
  z,
  width,
  height,
  onShown,
}: {
  pkg: GamePackage;
  layer: BackdropLayerState;
  z: number;
  width: number;
  height: number;
  onShown: () => void;
}) {
  const material = useRef<MeshBasicMaterial>(null);
  const shown = useRef(false);
  const latest = useRef(onShown);
  latest.current = onShown;
  useFrame(() => {
    const t = layer.duration > 0 ? Math.min(1, (clock() - layer.start) / layer.duration) : 1;
    if (material.current) material.current.opacity = t;
    if (t >= 1 && !shown.current) {
      shown.current = true;
      latest.current();
    }
  });
  const definition = layer.id ? pkg.manifest.backdrops?.[layer.id] : undefined;
  const fill = { width: width * 1.6, height: height * 1.6 };
  if (!definition)
    return (
      <mesh position={[0, 0, z]}>
        <planeGeometry args={[fill.width, fill.height]} />
        <meshBasicMaterial
          ref={material}
          color={pkg.manifest.stage?.background ?? "#101014"}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    );
  if (definition.type === "image")
    return (
      <ImageBackdrop
        pkg={pkg}
        id={layer.id!}
        fit={definition.fit}
        tint={definition.tint}
        material={material}
        z={z}
        width={width}
        height={height}
      />
    );
  if (definition.type === "gradient")
    return <GradientBackdrop colors={definition.colors} material={material} z={z} {...fill} />;
  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[fill.width, fill.height]} />
      <meshBasicMaterial
        ref={material}
        color={definition.color}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function ImageBackdrop({
  pkg,
  id,
  fit = "cover",
  tint = "#ffffff",
  material,
  z,
  width,
  height,
}: {
  pkg: GamePackage;
  id: string;
  fit?: "cover" | "contain" | "stretch" | "none";
  tint?: string;
  material: React.RefObject<MeshBasicMaterial | null>;
  z: number;
  width: number;
  height: number;
}) {
  const texture = useAsset(gameAssets(pkg).backdrop(id)!);
  const image = texture.image as { width: number; height: number };
  // A little overscan hides the edges during camera shake.
  const layout = layoutBackdrop(image, { width, height, fit, scale: fit === "cover" ? 1.04 : 1 });
  return (
    <mesh position={[layout.x, layout.y, z]}>
      <planeGeometry args={[layout.width, layout.height]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        color={tint}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function GradientBackdrop({
  colors,
  material,
  z,
  width,
  height,
}: {
  colors: readonly string[];
  material: React.RefObject<MeshBasicMaterial | null>;
  z: number;
  width: number;
  height: number;
}) {
  const key = colors.join(",");
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    const stops = key.split(",");
    stops.forEach((color, i) =>
      gradient.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, color),
    );
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.magFilter = LinearFilter;
    result.minFilter = LinearFilter;
    result.generateMipmaps = false;
    return result;
  }, [key]);
  useDisposable(texture, (value) => value.dispose());
  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// Screen-space layers ------------------------------------------------------------------------------

function ScreenTint({
  color,
  opacity,
  duration,
  flashes,
  width,
  height,
}: {
  color: string;
  opacity: number;
  duration: number;
  flashes: React.RefObject<{ start: number; duration: number; color: string }[]>;
  width: number;
  height: number;
}) {
  const overlay = useRef<MeshBasicMaterial>(null);
  const flash = useRef<MeshBasicMaterial>(null);
  const alpha = useRef(new Tween(opacity));
  useLayoutEffect(() => {
    alpha.current.set(opacity, duration, "inOut");
  }, [opacity, duration]);
  useFrame(() => {
    const now = clock();
    if (overlay.current) {
      overlay.current.opacity = alpha.current.at(now);
      overlay.current.visible = overlay.current.opacity > 0.002;
    }
    if (flash.current) {
      flashes.current = flashes.current.filter((entry) => now - entry.start < entry.duration);
      const latest = flashes.current[flashes.current.length - 1];
      if (latest) {
        flash.current.color.set(latest.color);
        flash.current.opacity = 1 - easeOut((now - latest.start) / latest.duration);
      }
      flash.current.visible = !!latest;
    }
  });
  const size: [number, number] = [width * 3, height * 3];
  return (
    <>
      <mesh position={[0, 0, 800]} renderOrder={900}>
        <planeGeometry args={size} />
        <meshBasicMaterial
          ref={overlay}
          color={color}
          transparent
          opacity={opacity}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 810]} renderOrder={910}>
        <planeGeometry args={size} />
        <meshBasicMaterial
          ref={flash}
          transparent
          visible={false}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 2;

const vignetteShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float strength;
    uniform float aspect;
    varying vec2 vUv;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
      float d = length(p) / length(vec2(aspect, 1.0) * 0.5);
      float a = smoothstep(0.35, 1.05, d) * strength;
      gl_FragColor = vec4(0.0, 0.0, 0.0, a);
    }`,
};

function Vignette({
  strength,
  duration,
  width,
  height,
}: {
  strength: number;
  duration: number;
  width: number;
  height: number;
}) {
  const material = useRef<ShaderMaterial>(null);
  const mesh = useRef<Mesh>(null);
  const value = useRef(new Tween(strength));
  useLayoutEffect(() => {
    value.current.set(strength, duration, "inOut");
  }, [strength, duration]);
  const uniforms = useMemo(
    () => ({ strength: { value: strength }, aspect: { value: width / height } }),
    [],
  );
  useFrame(() => {
    const current = value.current.at();
    if (material.current) material.current.uniforms.strength.value = current;
    if (mesh.current) mesh.current.visible = current > 0.002;
  });
  return (
    <mesh ref={mesh} position={[0, 0, 70]} renderOrder={70}>
      <planeGeometry args={[width, height]} />
      <shaderMaterial
        ref={material}
        args={[{ ...vignetteShader, uniforms }]}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
