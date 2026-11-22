import { Canvas, useThree, type CanvasProps, type ThreeElements } from "@react-three/fiber";
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import {
  CanvasTexture,
  LinearFilter,
  NearestFilter,
  OrthographicCamera,
  SRGBColorSpace,
} from "three";
import { type Asset } from "./assets";
import { useAsset, useDisposable } from "./react";
import type { Texture } from "three";

export interface Camera2DProps {
  /** Design-space size that always fits the viewport. */
  width?: number;
  height?: number;
  /** `contain` letterboxes the whole design space; `cover` fills the viewport and crops. */
  fit?: "contain" | "cover";
  /** Multiplies the fitted scale; 2 shows half the design space at twice the size. */
  zoom?: number;
  /** Design-space point at the center of the viewport, for panning. */
  center?: readonly [x: number, y: number];
  near?: number;
  far?: number;
}
export function Camera2D({
  width = 1280,
  height = 720,
  fit = "contain",
  zoom: zoomFactor = 1,
  center = [0, 0],
  near = 0.1,
  far = 2000,
}: Camera2DProps) {
  const size = useThree((state) => state.size);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const camera = useMemo(
    () => new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, near, far),
    [],
  );
  useLayoutEffect(() => {
    const previous = get().camera;
    set({ camera });
    return () => {
      set({ camera: previous });
    };
  }, [camera, get, set]);
  const [centerX, centerY] = center;
  useLayoutEffect(() => {
    // The camera sits midway through the depth range, so content at z = 0 is always visible.
    camera.near = near;
    camera.far = far;
    camera.position.set(centerX, centerY, (near + far) / 2);
    const zoom =
      ((fit === "contain" ? Math.min : Math.max)(size.width / width, size.height / height) || 1) *
      Math.max(0.01, zoomFactor);
    camera.left = -size.width / (2 * zoom);
    camera.right = size.width / (2 * zoom);
    camera.top = size.height / (2 * zoom);
    camera.bottom = -size.height / (2 * zoom);
    camera.updateProjectionMatrix();
  }, [
    camera,
    width,
    height,
    fit,
    zoomFactor,
    centerX,
    centerY,
    near,
    far,
    size.width,
    size.height,
  ]);
  return null;
}

export interface SceneCanvasProps extends Camera2DProps, CanvasProps {
  /** Clear color. Omit for a transparent canvas that shows the page behind it. */
  background?: string;
}
export function SceneCanvas({
  width = 1280,
  height = 720,
  fit,
  zoom,
  center,
  near,
  far,
  background,
  children,
  ...props
}: SceneCanvasProps) {
  return (
    <Canvas orthographic flat dpr={[1, 2]} {...props}>
      <Camera2D
        width={width}
        height={height}
        fit={fit}
        zoom={zoom}
        center={center}
        near={near}
        far={far}
      />
      {background && <color attach="background" args={[background]} />}
      {children}
    </Canvas>
  );
}

export interface BackdropProps {
  asset: Asset<Texture>;
  /** Bounds the image fits into, in design units. */
  width?: number;
  height?: number;
  /** `none` draws the image at its natural size times `scale`. */
  fit?: "cover" | "contain" | "stretch" | "none";
  /** Multiplies the fitted size. */
  scale?: number;
  /**
   * Where the image sits within its bounds, from -1 (left/bottom) to 1 (right/top). With `cover`
   * this chooses which part survives the crop; with `contain` it moves the image inside the bounds.
   */
  align?: readonly [x: number, y: number];
  /** Extra translation in design units, applied after alignment. */
  offset?: readonly [x: number, y: number];
  opacity?: number;
  /** Multiplies the image color. */
  tint?: string;
  flipX?: boolean;
  flipY?: boolean;
  z?: number;
  renderOrder?: number;
}
/** Pure layout for `Backdrop`; exported for custom renderers and tests. */
export function layoutBackdrop(
  image: { width: number; height: number },
  options: Pick<BackdropProps, "width" | "height" | "fit" | "scale" | "align" | "offset">,
) {
  const {
    width = 1280,
    height = 720,
    fit = "cover",
    scale = 1,
    align = [0, 0],
    offset = [0, 0],
  } = options;
  const factor =
    fit === "none"
      ? 1
      : (fit === "contain" ? Math.min : Math.max)(width / image.width, height / image.height);
  const w = (fit === "stretch" ? width : image.width * factor) * scale;
  const h = (fit === "stretch" ? height : image.height * factor) * scale;
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  // Half the difference between bounds and image is how far the image can travel either way.
  return {
    width: w,
    height: h,
    x: (clamp(align[0]) * (width - w)) / 2 + offset[0],
    y: (clamp(align[1]) * (height - h)) / 2 + offset[1],
  };
}
export function Backdrop({
  asset,
  width,
  height,
  fit,
  scale,
  align,
  offset,
  opacity = 1,
  tint = "#ffffff",
  flipX = false,
  flipY = false,
  z = -100,
  renderOrder,
}: BackdropProps) {
  const texture = useAsset(asset);
  const image = texture.image as { width: number; height: number };
  const layout = layoutBackdrop(image, { width, height, fit, scale, align, offset });
  return (
    <mesh
      position={[layout.x, layout.y, z]}
      scale={[flipX ? -1 : 1, flipY ? -1 : 1, 1]}
      renderOrder={renderOrder}
    >
      <planeGeometry args={[layout.width, layout.height]} />
      <meshBasicMaterial
        map={texture}
        color={tint}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export interface CanvasPanelProps extends Omit<ThreeElements["mesh"], "children"> {
  width: number;
  height: number;
  /** Canvas pixels per design unit, clamped to 0.5–4. */
  resolution?: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  opacity?: number;
  /** Nearest-neighbor sampling for pixel-art UI. */
  pixelated?: boolean;
  /** Hide behind closer scene objects instead of always drawing on top. */
  depthTest?: boolean;
  children?: ReactNode;
}
/** Native scene text/UI backed by a canvas texture; no HTML projected into the scene. */
export function CanvasPanel({
  width,
  height,
  resolution = 2,
  draw,
  opacity = 1,
  pixelated = false,
  depthTest = false,
  children,
  ...props
}: CanvasPanelProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.minFilter = LinearFilter;
    result.generateMipmaps = false;
    return result;
  }, []);
  useDisposable(texture, (value) => value.dispose());
  useLayoutEffect(() => {
    texture.magFilter = pixelated ? NearestFilter : LinearFilter;
    texture.minFilter = pixelated ? NearestFilter : LinearFilter;
    texture.needsUpdate = true;
  }, [texture, pixelated]);
  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const scale = Math.max(0.5, Math.min(4, resolution));
    const pixelWidth = Math.max(1, Math.ceil(width * scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      // WebGL2 texture storage is immutable: three.js only updates a sub-region on later uploads,
      // so a resized canvas would leave stale pixels behind. Release the GPU texture to force
      // reallocation at the new size.
      texture.dispose();
    }
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.save();
    try {
      draw(context, width, height);
    } finally {
      context.restore();
    }
    texture.needsUpdate = true;
  }, [texture, width, height, resolution, draw]);
  return (
    <mesh {...props}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthTest={depthTest}
        depthWrite={false}
        toneMapped={false}
      />
      {children}
    </mesh>
  );
}
