import { AtlasAttachmentLoader, SkeletonJson, TextureAtlas } from "@esotericsoftware/spine-threejs";
import { describe, expect, it } from "vite-plus/test";
import { spineAsset } from "../src/assets";
import { hiddenSlots, resolveSkin, skinFolders, skinNames, slotAttachments } from "../src/skins";

const point = { type: "point" };
const data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(""))).readSkeletonData({
  skeleton: { spine: "4.3.0" },
  bones: [{ name: "root" }, { name: "head", parent: "root" }],
  slots: [
    { name: "body", bone: "root", attachment: "body" },
    { name: "hat", bone: "head" },
    { name: "mouth", bone: "head", attachment: "smile" },
  ],
  skins: [
    { name: "default", attachments: { mouth: { smile: point, frown: point } } },
    { name: "base", attachments: { body: { body: point } } },
    { name: "hats/cap", attachments: { hat: { hat: point } } },
    { name: "hats/crown", attachments: { hat: { hat: point, jewel: point } } },
    { name: "outfits/summer/shorts", attachments: { body: { body: point } } },
  ],
});

describe("skinFolders", () => {
  it("groups skins by editor folder in export order, omitting the default skin", () => {
    expect(skinFolders(data)).toEqual([
      { path: "", label: "", skins: [{ name: "base", label: "base" }] },
      {
        path: "hats",
        label: "hats",
        skins: [
          { name: "hats/cap", label: "cap" },
          { name: "hats/crown", label: "crown" },
        ],
      },
      {
        path: "outfits/summer",
        label: "summer",
        skins: [{ name: "outfits/summer/shorts", label: "shorts" }],
      },
    ]);
  });
  it("can include the default skin", () => {
    expect(skinFolders(data, { includeDefault: true })[0].skins[0].name).toBe("default");
  });
});

describe("resolveSkin", () => {
  it("returns the default skin, a single skin, or a combined skin", () => {
    expect(resolveSkin(data, undefined)).toBe(data.defaultSkin);
    expect(resolveSkin(data, [])).toBe(data.defaultSkin);
    expect(resolveSkin(data, "hats/cap")).toBe(data.findSkin("hats/cap"));
    const combined = resolveSkin(data, ["base", "hats/crown"]);
    expect(combined?.name).toBe("base+hats/crown");
    expect(combined?.getAttachments().map((entry) => entry.placeholder)).toEqual([
      "body",
      "hat",
      "jewel",
    ]);
  });
  it("rejects unknown names", () => {
    expect(() => resolveSkin(data, ["base", "nope"])).toThrow("Unknown Spine skin: nope");
  });
  it("normalizes names", () => {
    expect(skinNames(null)).toEqual([]);
    expect(skinNames("a")).toEqual(["a"]);
    expect(skinNames(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("slotAttachments", () => {
  it("lists each slot's attachments from the skin plus the default skin", () => {
    expect(slotAttachments(data, ["base", "hats/crown"])).toEqual([
      { slot: "body", bone: "root", setup: "body", attachments: ["body"] },
      { slot: "hat", bone: "head", setup: null, attachments: ["hat", "jewel"] },
      { slot: "mouth", bone: "head", setup: "smile", attachments: ["smile", "frown"] },
    ]);
    expect(slotAttachments(data).map((slot) => slot.attachments)).toEqual([
      [],
      [],
      ["smile", "frown"],
    ]);
  });
});

describe("spineAsset appearance defaults", () => {
  it("carries skin and attachments without changing the cache key", () => {
    const source = { skeleton: "/a.json", atlas: "/a.atlas" };
    const plain = spineAsset(source);
    const dressed = spineAsset({ ...source, skin: ["hats/cap"], attachments: { mouth: null } });
    expect(dressed.key).toBe(plain.key);
    expect(dressed.skin).toEqual(["hats/cap"]);
    expect(dressed.attachments).toEqual({ mouth: null });
    expect(plain.skin).toBeUndefined();
  });
});

describe("hiddenSlots", () => {
  const hides = { "hats/crown": ["hair"], outfits: ["body", "arms"], "hats/cap/": ["hair"] };
  it("matches skins by full name or folder", () => {
    expect(hiddenSlots(hides, ["hats/crown"])).toEqual(["hair"]);
    expect(hiddenSlots(hides, ["base", "outfits/summer/shorts"])).toEqual(["body", "arms"]);
    expect(hiddenSlots(hides, "hats/cap/red")).toEqual(["hair"]);
  });
  it("hides nothing for other skins", () => {
    expect(hiddenSlots(hides, ["hats/crowned", "outfitsx"])).toEqual([]);
    expect(hiddenSlots(undefined, ["hats/crown"])).toEqual([]);
  });
});
