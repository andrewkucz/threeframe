import { SRGBColorSpace, TextureLoader } from "three";
import { fetchAsset, type Asset } from "./assets";
import type { Texture } from "three";

export function textureAsset(url: string): Asset<Texture> {
  return {
    key: `texture:${url}`,
    async load(signal) {
      const blob = await (await fetchAsset(url, signal)).blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const texture = await new TextureLoader().loadAsync(objectUrl);
        texture.colorSpace = SRGBColorSpace;
        return texture;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    dispose: (texture) => texture.dispose(),
  };
}

export function fontAsset(
  family: string,
  url: string,
  descriptors: FontFaceDescriptors = {},
): Asset<FontFace> {
  return {
    key: `font:${family}:${url}:${JSON.stringify(descriptors)}`,
    async load(signal) {
      const bytes = await (await fetchAsset(url, signal)).arrayBuffer();
      const face = await new FontFace(family, bytes, descriptors).load();
      document.fonts.add(face);
      return face;
    },
    dispose: (face) => {
      document.fonts.delete(face);
    },
  };
}
