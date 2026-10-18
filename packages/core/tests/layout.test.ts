import { describe, expect, it } from "vite-plus/test";
import { graphemes, paginateText, revealStops, wrapText } from "../src/layout";

const measure = (text: string) => graphemes(text).length;
describe("measured dialogue layout", () => {
  it("wraps words within their measured width", () => {
    expect(wrapText("one two three four", 7, measure)).toEqual(["one two", "three", "four"]);
  });
  it("breaks long words without losing content", () => {
    expect(wrapText("abcdefghijk", 4, measure)).toEqual(["abcd", "efgh", "ijk"]);
  });
  it("preserves intentional empty paragraphs and normalizes CRLF", () => {
    expect(wrapText("one\r\n\r\ntwo", 20, measure)).toEqual(["one", "", "two"]);
  });
  it("keeps Unicode grapheme clusters intact", () => {
    const text = "👩🏽‍🚀🌙é你好";
    expect(wrapText(text, 1, measure)).toEqual(["👩🏽‍🚀", "🌙", "é", "你", "好"]);
    const stops = revealStops(text, "character");
    expect(stops.map((stop, i) => text.slice(stops[i - 1] ?? 0, stop))).toEqual(graphemes(text));
  });
  it("paginates every line exactly once", () => {
    expect(paginateText(["a", "b", "", "c", "d"], 2)).toEqual(["a\nb", "\nc", "d"]);
    expect(() => paginateText(["x"], 0)).toThrow();
    expect(() => wrapText("x", 0, measure)).toThrow();
  });
  it("reveals complete words or visual lines", () => {
    const text = "Hello there\nnew world";
    expect(revealStops(text, "word").map((stop) => text.slice(0, stop))).toEqual([
      "Hello ",
      "Hello there\n",
      "Hello there\nnew ",
      text,
    ]);
    expect(revealStops(text, "line")).toEqual([12, text.length]);
    expect(revealStops(text, "instant")).toEqual([text.length]);
  });
});
