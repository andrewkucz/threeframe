import {
  AtlasAttachmentLoader,
  Skeleton,
  SkeletonJson,
  TextureAtlas,
} from "@esotericsoftware/spine-threejs";
import { describe, expect, it } from "vite-plus/test";
import { spineAsset } from "../src/assets";
import { applySlotTints, colorTint, parseColor, slotTints } from "../src/colors";

const data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(""))).readSkeletonData({
  skeleton: { spine: "4.3.0" },
  bones: [{ name: "root" }],
  slots: [
    { name: "hair", bone: "root", dark: "000000" },
    { name: "body", bone: "root", color: "ffffff80" },
  ],
});

const rgb = (color: { r: number; g: number; b: number }) =>
  [color.r, color.g, color.b].map((value) => Math.round(value * 255));

describe("parseColor", () => {
  it("reads short, long and alpha hex colors", () => {
    expect(rgb(parseColor("#f80"))).toEqual([255, 136, 0]);
    expect(rgb(parseColor("c1b01c"))).toEqual([193, 176, 28]);
    expect(parseColor("#00000080").a).toBeCloseTo(128 / 255);
  });
  it("rejects anything else", () => {
    expect(() => parseColor("red")).toThrow("Invalid color: red");
  });
});

describe("colorTint", () => {
  it("multiplies without gradient shading", () => {
    const tint = colorTint("#f5d8ab");
    expect(rgb(tint.light)).toEqual([245, 216, 171]);
    expect(tint.dark).toBeNull();
  });
  it("draws the base color at the gradient's mid gray", () => {
    for (const color of ["#c1b01c", "#432512", "#ff6699"]) {
      const { light, dark } = colorTint(color, { gradient: { mid: 0.35, range: 50 } });
      const at = (from: number, to: number) => Math.round((from + 0.35 * (to - from)) * 255);
      expect([at(dark!.r, light.r), at(dark!.g, light.g), at(dark!.b, light.b)]).toEqual(
        rgb(parseColor(color)),
      );
      expect(rgb(dark!).every((value, i) => value <= rgb(light)[i])).toBe(true);
    }
  });
});

describe("slotTints", () => {
  const groups = {
    hair: { slots: ["hair", "fringe"], default: "#c1b01c", gradient: { mid: 0.35, range: 50 } },
    skin: { slots: ["body"] },
  };
  it("expands groups, applies defaults and accepts slot names", () => {
    const tints = slotTints(groups, { skin: "#f3c98b", eyes: "#00ff00" });
    expect([...tints.keys()]).toEqual(["hair", "fringe", "body", "eyes"]);
    expect(tints.get("hair")!.dark).not.toBeNull();
    expect(rgb(tints.get("body")!.light)).toEqual([243, 201, 139]);
  });
  it("skips groups without a default or a chosen color", () => {
    expect([...slotTints(groups, {}).keys()]).toEqual(["hair", "fringe"]);
  });
});

describe("applySlotTints", () => {
  it("sets light and dark colors, keeping slot alpha", () => {
    const skeleton = new Skeleton(data);
    applySlotTints(
      skeleton,
      slotTints(
        { hair: { slots: ["hair"], gradient: { mid: 0.5, range: 40 } } },
        {
          hair: "#808080",
          body: "#ff0000",
          missing: "#ffffff",
        },
      ),
    );
    const hair = skeleton.findSlot("hair")!.pose;
    const body = skeleton.findSlot("body")!.pose;
    expect(rgb(hair.darkColor!).every((value) => value < 128)).toBe(true);
    expect(rgb(body.color)).toEqual([255, 0, 0]);
    expect(body.color.a).toBeCloseTo(128 / 255);
  });
});

describe("spineAsset colors", () => {
  it("carries colors and color groups without changing the cache key", () => {
    const source = { skeleton: "a.json", atlas: "a.atlas" };
    const colored = spineAsset({
      ...source,
      colors: { hair: "#000" },
      colorGroups: { hair: { slots: ["hair"] } },
    });
    expect(colored.key).toBe(spineAsset(source).key);
    expect(colored.colors).toEqual({ hair: "#000" });
    expect(colored.colorGroups?.hair.slots).toEqual(["hair"]);
  });
});
