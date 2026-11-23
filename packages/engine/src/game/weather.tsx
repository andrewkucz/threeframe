import { useFrame } from "@react-three/fiber";
import { useDisposable } from "@threeframe/core";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  type ShaderMaterial,
} from "three";
import { Tween, clock } from "./tween";

/** How one particle type looks and moves. Register more through `weatherPresets`. */
export interface WeatherPreset {
  /** Particles at intensity 1. */
  count: number;
  /** Fall speed in design units per second (negative rises). */
  speed: number;
  /** Point size in design units. */
  size: number;
  /** Random size variation, 0–1. */
  sizeJitter?: number;
  color: string;
  /** Horizontal sway amplitude and frequency. */
  sway?: number;
  swayFrequency?: number;
  /** `streak` draws thin vertical lines (rain); `petal` draws spinning ovals. Default soft dots. */
  shape?: "dot" | "streak" | "petal";
  /** Pulse opacity over time (fireflies). */
  twinkle?: boolean;
  additive?: boolean;
  opacity?: number;
}

export const weatherPresets: Record<string, WeatherPreset> = {
  rain: {
    count: 700,
    speed: 1100,
    size: 22,
    sizeJitter: 0.4,
    color: "#a8c4e0",
    shape: "streak",
    opacity: 0.55,
  },
  snow: {
    count: 500,
    speed: 70,
    size: 7,
    sizeJitter: 0.6,
    color: "#ffffff",
    sway: 26,
    swayFrequency: 0.7,
    opacity: 0.9,
  },
  dust: {
    count: 160,
    speed: -8,
    size: 3.5,
    sizeJitter: 0.5,
    color: "#f3e3c0",
    sway: 18,
    swayFrequency: 0.25,
    opacity: 0.5,
    additive: true,
  },
  petals: {
    count: 120,
    speed: 60,
    size: 14,
    sizeJitter: 0.4,
    color: "#f6b7c9",
    sway: 60,
    swayFrequency: 0.5,
    shape: "petal",
    opacity: 0.95,
  },
  fireflies: {
    count: 60,
    speed: -6,
    size: 9,
    sizeJitter: 0.5,
    color: "#ffe9a3",
    sway: 40,
    swayFrequency: 0.3,
    twinkle: true,
    additive: true,
    opacity: 1,
  },
  embers: {
    count: 140,
    speed: -90,
    size: 5,
    sizeJitter: 0.6,
    color: "#ff9a4a",
    sway: 30,
    swayFrequency: 0.9,
    twinkle: true,
    additive: true,
    opacity: 0.9,
  },
};

const vertexShader = /* glsl */ `
  uniform float time;
  uniform float speed;
  uniform float wind;
  uniform float sway;
  uniform float swayFrequency;
  uniform float size;
  uniform vec2 area;
  uniform float pixelRatio;
  uniform float viewportHeight;
  attribute vec3 seed;
  varying float vSeed;
  varying float vSpin;
  void main() {
    vSeed = seed.z;
    float y = mod(seed.y * area.y - speed * time, area.y) - area.y * 0.5;
    float x = mod(seed.x * area.x + wind * time + sin(time * swayFrequency + seed.z * 31.0) * sway + area.x * 0.5, area.x) - area.x * 0.5;
    vSpin = time * (0.8 + seed.z * 2.0) + seed.z * 6.28;
    vec4 mv = modelViewMatrix * vec4(x, y, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
    // Orthographic: projectionMatrix[1][1] converts design units to clip space.
    gl_PointSize = size * (1.0 - SIZE_JITTER * seed.z) * projectionMatrix[1][1] * 0.5 * viewportHeight * pixelRatio;
  }`;
const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float time;
  varying float vSeed;
  varying float vSpin;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a;
    #if defined(SHAPE_STREAK)
      a = (1.0 - smoothstep(0.02, 0.07, abs(p.x))) * (1.0 - smoothstep(0.3, 0.5, abs(p.y)));
    #elif defined(SHAPE_PETAL)
      float c = cos(vSpin), s = sin(vSpin);
      vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * vec2(1.0, 2.2);
      a = 1.0 - smoothstep(0.32, 0.5, length(q));
    #else
      a = 1.0 - smoothstep(0.15, 0.5, length(p));
    #endif
    #ifdef TWINKLE
      a *= 0.25 + 0.75 * (0.5 + 0.5 * sin(time * (1.5 + vSeed * 2.0) + vSeed * 40.0));
    #endif
    if (a < 0.01) discard;
    gl_FragColor = vec4(color, a * opacity);
  }`;

export interface WeatherProps {
  type: string | null;
  intensity: number;
  wind: number;
  width: number;
  height: number;
  paused?: boolean;
  presets?: Readonly<Record<string, WeatherPreset>>;
}

/** Ambient GPU particles. Unknown types render nothing. */
export function Weather({ type, presets = weatherPresets, ...props }: WeatherProps) {
  const preset = type ? presets[type] : undefined;
  if (!preset || !type) return null;
  return <Particles key={type} preset={preset} {...props} />;
}

function Particles({
  preset,
  intensity,
  wind,
  width,
  height,
  paused = false,
}: Omit<WeatherProps, "type" | "presets"> & { preset: WeatherPreset }) {
  const max = Math.ceil(preset.count * 3);
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    const seeds = new Float32Array(max * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    result.setAttribute("seed", new BufferAttribute(seeds, 3));
    // Positions are computed in the shader; three still wants an attribute named position.
    result.setAttribute("position", new BufferAttribute(new Float32Array(max * 3), 3));
    return result;
  }, [max]);
  useDisposable(geometry, (value) => value.dispose());
  const material = useRef<ShaderMaterial>(null);
  const time = useRef(Math.random() * 100);
  const fade = useRef(new Tween(0));
  useLayoutEffect(() => {
    fade.current.set(1, 1.2, "out");
  }, []);
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      speed: { value: preset.speed },
      wind: { value: wind },
      sway: { value: preset.sway ?? 0 },
      swayFrequency: { value: preset.swayFrequency ?? 1 },
      size: { value: preset.size },
      area: { value: [width * 1.2, height * 1.2] },
      color: { value: new Color(preset.color) },
      opacity: { value: 0 },
      pixelRatio: { value: 1 },
      viewportHeight: { value: 720 },
    }),
    [preset, width, height],
  );
  useFrame((state, delta) => {
    if (!paused) time.current += Math.min(delta, 0.1);
    const shader = material.current;
    if (!shader) return;
    shader.uniforms.time.value = time.current;
    shader.uniforms.wind.value = wind;
    shader.uniforms.pixelRatio.value = state.gl.getPixelRatio();
    shader.uniforms.opacity.value = (preset.opacity ?? 1) * fade.current.at(clock());
    shader.uniforms.viewportHeight.value = state.size.height;
    geometry.setDrawRange(0, Math.min(max, Math.round(preset.count * Math.max(0, intensity))));
  });
  const defines = useMemo(
    () => ({
      SIZE_JITTER: (preset.sizeJitter ?? 0).toFixed(3),
      ...(preset.shape === "streak" && { SHAPE_STREAK: "" }),
      ...(preset.shape === "petal" && { SHAPE_PETAL: "" }),
      ...(preset.twinkle && { TWINKLE: "" }),
    }),
    [preset],
  );
  return (
    <points geometry={geometry} position={[0, 0, 60]} renderOrder={60} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        args={[{ vertexShader, fragmentShader, uniforms, defines }]}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={preset.additive ? AdditiveBlending : NormalBlending}
      />
    </points>
  );
}
