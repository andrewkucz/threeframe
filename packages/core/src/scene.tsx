import { Canvas, useThree, type CanvasProps, type ThreeElements } from "@react-three/fiber";
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { CanvasTexture, LinearFilter, OrthographicCamera, SRGBColorSpace } from "three";
import { type Asset } from "./assets";
import { useAsset, useDisposable } from "./react";
import type { Texture } from "three";

export interface Camera2DProps {
  width?: number;
  height?: number;
  fit?: "contain" | "cover";
}
export function Camera2D({ width = 1280, height = 720, fit = "contain" }: Camera2DProps) {
  const size = useThree((state) => state.size);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const camera = useMemo(
    () => new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 2000),
    [],
  );
  useLayoutEffect(() => {
    const previous = get().camera;
    camera.position.z = 1000;
    set({ camera });
    return () => {
      set({ camera: previous });
    };
  }, [camera, get, set]);
  useLayoutEffect(() => {
    const zoom =
      (fit === "contain" ? Math.min : Math.max)(size.width / width, size.height / height) || 1;
    camera.left = -size.width / (2 * zoom);
    camera.right = size.width / (2 * zoom);
    camera.top = size.height / (2 * zoom);
    camera.bottom = -size.height / (2 * zoom);
    camera.updateProjectionMatrix();
  }, [camera, width, height, fit, size.width, size.height]);
  return null;
}

export function SceneCanvas({
  width = 1280,
  height = 720,
  fit,
  children,
  ...props
}: Camera2DProps & CanvasProps) {
  return (
    <Canvas orthographic flat dpr={[1, 2]} {...props}>
      <Camera2D width={width} height={height} fit={fit} />
      {children}
    </Canvas>
  );
}

export interface BackdropProps {
  asset: Asset<Texture>;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "stretch";
  opacity?: number;
  z?: number;
}
export function Backdrop({
  asset,
  width = 1280,
  height = 720,
  fit = "cover",
  opacity = 1,
  z = -100,
}: BackdropProps) {
  const texture = useAsset(asset);
  const image = texture.image as { width: number; height: number };
  const factor = (fit === "contain" ? Math.min : Math.max)(
    width / image.width,
    height / image.height,
  );
  const w = fit === "stretch" ? width : image.width * factor;
  const h = fit === "stretch" ? height : image.height * factor;
  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={texture}
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
  resolution?: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  children?: ReactNode;
}
/** Native scene text/UI backed by a canvas texture; no HTML projected into the scene. */
export function CanvasPanel({
  width,
  height,
  resolution = 2,
  draw,
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
    const canvas = texture.image as HTMLCanvasElement;
    const scale = Math.max(0.5, Math.min(4, resolution));
    const pixelWidth = Math.max(1, Math.ceil(width * scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
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
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
      {children}
    </mesh>
  );
}
