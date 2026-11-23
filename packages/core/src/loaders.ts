import { SRGBColorSpace, TextureLoader } from "three";
import { fetchAsset, sourceKey, type Asset } from "./assets";
import type { FileSource } from "./files";
import type { Texture } from "three";

export function textureAsset(url: string, source?: FileSource): Asset<Texture> {
  return {
    key: `texture:${sourceKey(source)}${url}`,
    async load(signal) {
      const blob = await (await fetchAsset(url, signal, source)).blob();
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
  source?: FileSource,
): Asset<FontFace> {
  return {
    key: `font:${family}:${sourceKey(source)}${url}:${JSON.stringify(descriptors)}`,
    async load(signal) {
      const bytes = await (await fetchAsset(url, signal, source)).arrayBuffer();
      const face = await new FontFace(family, bytes, descriptors).load();
      document.fonts.add(face);
      return face;
    },
    dispose: (face) => {
      document.fonts.delete(face);
    },
  };
}
