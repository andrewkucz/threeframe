const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const graphemes = (text: string) => [...segmenter.segment(text)].map((part) => part.segment);

/** Wraps by measured width, including CJK, emoji, blank lines and unbroken words. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error("Text width must be positive.");
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
      if (measure(line + word.trimEnd()) <= maxWidth) {
        line += word;
        continue;
      }
      if (line.trim()) {
        lines.push(line.trimEnd());
        line = "";
      }
      const trimmed = word.trimStart();
      if (measure(trimmed.trimEnd()) <= maxWidth) {
        line = trimmed;
        continue;
      }
      for (const char of graphemes(trimmed)) {
        if (line && measure(line + char) > maxWidth) {
          lines.push(line.trimEnd());
          line = "";
        }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function paginateText(lines: readonly string[], linesPerPage: number) {
  if (!Number.isFinite(linesPerPage) || linesPerPage < 1)
    throw new Error("A dialogue page must fit at least one line.");
  const pages: string[] = [];
  const count = Math.floor(linesPerPage);
  for (let start = 0; start < lines.length; start += count)
    pages.push(lines.slice(start, start + count).join("\n"));
  return pages.length ? pages : [""];
}

export type RevealMode = "character" | "word" | "line" | "instant";
/** Character offsets always land on a complete grapheme, word or visual line. */
export function revealStops(text: string, mode: RevealMode): number[] {
  if (mode === "instant") return [text.length];
  if (mode === "character") {
    let offset = 0;
    return graphemes(text).map((part) => (offset += part.length));
  }
  return [...text.matchAll(mode === "word" ? /\S+\s*|\s+/gu : /[^\n]*\n|[^\n]+$/gu)].map(
    (match) => (match.index ?? 0) + match[0].length,
  );
}
