import { Backdrop, textureAsset, type Asset } from "@threeframe/core";
import { useEffect, useMemo, useState } from "react";
import type { Texture } from "three";
import { tower, valley } from "../demo";
import { gridColors } from "./options";

const builtInBackdrops: Record<string, Asset<Texture>> = { valley, tower };

/**
 * Preview backdrop state shared by the docs pages: the grid (default), a demo image, or an
 * uploaded image. `stage` is the canvas color; the grid lines are derived from it.
 */
export function useBackdropPicker(stage: string) {
  const [name, setName] = useState("grid");
  const [upload, setUpload] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => (upload ? () => URL.revokeObjectURL(upload.url) : undefined), [upload]);
  const uploadAsset = useMemo(() => upload && textureAsset(upload.url), [upload]);
  const asset = name === "custom" ? uploadAsset : (builtInBackdrops[name] ?? null);
  const grid = gridColors(stage);

  const scene = asset ? (
    <Backdrop asset={asset} />
  ) : (
    name === "grid" && (
      <gridHelper args={[2560, 64, grid[0], grid[1]]} rotation-x={Math.PI / 2} position-z={-100} />
    )
  );

  const picker = (
    <div className="preview-footer-group">
      <select
        aria-label="Preview backdrop"
        value={name}
        onChange={(event) => setName(event.target.value)}
      >
        <option value="grid">Grid (default)</option>
        <option value="valley">valley.svg</option>
        <option value="tower">tower.svg</option>
        <option value="custom">Upload image…</option>
      </select>
      {name === "custom" && (
        <>
          <label className="small-button file-button">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setUpload({ name: file.name, url: URL.createObjectURL(file) });
                event.target.value = "";
              }}
            />
            {upload ? "Change image…" : "Choose image…"}
          </label>
          <span className="preview-caption">
            {upload ? upload.name : "Stays in this browser tab only."}
          </span>
        </>
      )}
    </div>
  );

  /** Options for `sceneHost` so App.tsx matches the preview. */
  const host = {
    background: (name === "grid" ? "grid" : name === "tower" ? "tower" : "valley") as
      | "grid"
      | "tower"
      | "valley",
    stage: { color: stage, grid },
  };

  return { name, asset, scene, picker, host };
}
