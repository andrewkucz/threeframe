import { describe, expect, it } from "vite-plus/test";
import { layoutBackdrop } from "../src/scene";

const image = { width: 200, height: 100 };
describe("backdrop layout", () => {
  it("covers, contains, stretches, or keeps the natural size", () => {
    expect(layoutBackdrop(image, { width: 100, height: 100, fit: "cover" })).toMatchObject({
      width: 200,
      height: 100,
    });
    expect(layoutBackdrop(image, { width: 100, height: 100, fit: "contain" })).toMatchObject({
      width: 100,
      height: 50,
    });
    expect(layoutBackdrop(image, { width: 100, height: 100, fit: "stretch" })).toMatchObject({
      width: 100,
      height: 100,
    });
    expect(layoutBackdrop(image, { fit: "none", scale: 2 })).toMatchObject({
      width: 400,
      height: 200,
    });
  });

  it("aligns within the overflow and applies offsets", () => {
    // Cover overflows by 100 horizontally; align x = -1 shows the left edge.
    const left = layoutBackdrop(image, { width: 100, height: 100, fit: "cover", align: [-1, 0] });
    expect(left.x).toBe(50);
    const moved = layoutBackdrop(image, {
      width: 100,
      height: 100,
      fit: "contain",
      align: [0, 1],
      offset: [3, 4],
    });
    expect(moved).toMatchObject({ x: 3, y: 29 });
  });
});
