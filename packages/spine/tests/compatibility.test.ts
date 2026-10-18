import { readFileSync } from "node:fs";
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  TextureAtlas,
} from "@esotericsoftware/spine-threejs";
import { describe, expect, it } from "vite-plus/test";

const read = (name: string) =>
  readFileSync(new URL(`../../../example/spineboy-4.3/export/${name}`, import.meta.url));
describe("bundled Spine 4.3 exports", () => {
  it("parses JSON and binary with matching animation names and skeleton dimensions", () => {
    const atlas = new TextureAtlas(read("spineboy.atlas").toString());
    const attachments = new AtlasAttachmentLoader(atlas);
    const json = new SkeletonJson(attachments).readSkeletonData(
      JSON.parse(read("spineboy-pro.json").toString()),
    );
    const binary = new SkeletonBinary(attachments).readSkeletonData(
      new Uint8Array(read("spineboy-pro.skel")),
    );
    expect(json.version).toMatch(/^4\.3\./);
    expect(binary.animations.map((animation) => animation.name)).toEqual(
      json.animations.map((animation) => animation.name),
    );
    expect(json.findAnimation("idle")).toBeTruthy();
    expect(json.findAnimation("walk")).toBeTruthy();
    expect(binary.width).toBeCloseTo(json.width, 1);
    expect(binary.height).toBeCloseTo(json.height, 1);
  });
});
