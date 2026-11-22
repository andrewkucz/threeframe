import type { NarrativeChoice } from "./controller";

/* -------------------------------------------------------------------------------------------------
 * Public style vocabulary
 *
 * Every visual part of the dialogue (panel, body, nameplate, prompt, page counter, choice menu)
 * is configured with the same two building blocks: a text style and a surface style. Parts read
 * their defaults from the shared `DialogueTheme` tokens, so changing one token (for example
 * `accentColor`) restyles every part that uses it, while part props override individual values.
 * ---------------------------------------------------------------------------------------------- */

/** Horizontal alignment relative to the containing area. */
export type DialogueAlign = "start" | "center" | "end";
/** CSS-like shorthand: all sides, `[vertical, horizontal]`, or `[top, right, bottom, left]`. */
export type DialoguePadding =
  | number
  | readonly [vertical: number, horizontal: number]
  | readonly [top: number, right: number, bottom: number, left: number];
export interface DialogueInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export type DialogueOffset = readonly [x: number, y: number];

export interface DialogueTextStyle {
  fontFamily?: string;
  /** Scene units, before camera scaling. */
  fontSize?: number;
  fontWeight?: number | "normal" | "bold";
  fontStyle?: "normal" | "italic";
  color?: string;
  /** Multiple of `fontSize`. */
  lineHeight?: number;
  /** Extra space between characters, in scene units. */
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase";
}
export interface DialogueSurfaceStyle {
  /** Any CSS color, including alpha. Use `"transparent"` for no fill. */
  background?: string;
  borderColor?: string;
  /** Zero removes the border. */
  borderWidth?: number;
  radius?: number;
}

/** Shared design tokens. Parts derive their defaults from these. */
export interface DialogueTheme {
  /** Body and choice text. */
  fontFamily: string;
  /** Nameplate, prompt, page counter, choice markers, and pager. */
  uiFontFamily: string;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  mutedColor: string;
  /** Nameplate (unless the speaker sets `color`), choice markers, hover borders, and pager. */
  accentColor: string;
  background: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  choiceBackground: string;
  choiceHoverBackground: string;
}
export const defaultDialogueTheme: DialogueTheme = {
  fontFamily: "Georgia, serif",
  uiFontFamily: "system-ui, sans-serif",
  fontSize: 25,
  lineHeight: 1.5,
  textColor: "#f3eee2",
  mutedColor: "#abb7be",
  accentColor: "#eabd78",
  background: "rgba(15, 24, 33, 0.96)",
  borderColor: "#50606b",
  borderWidth: 1.5,
  radius: 14,
  choiceBackground: "#182d3a",
  choiceHoverBackground: "#2b4756",
};

export interface DialogueBodyOptions extends DialogueTextStyle {
  textAlign?: DialogueAlign;
}
export interface DialogueNameplateOptions extends DialogueTextStyle {
  /**
   * `inside` draws the name as a line of text above the body. `border` draws a badge centered on
   * the panel's top edge, and `outside` draws a badge above the panel.
   */
  placement?: "inside" | "border" | "outside";
  align?: DialogueAlign;
  /** `inside`: space before the body. `outside`: space between the badge and the panel. */
  gap?: number;
  /** Badge fill and border (`border` and `outside` placements). */
  surface?: DialogueSurfaceStyle;
  /** Badge padding (`border` and `outside` placements). */
  padding?: DialoguePadding;
  offset?: DialogueOffset;
}
export interface DialogueFooterTextOptions extends DialogueTextStyle {
  align?: DialogueAlign;
  /** Space between the body and the footer row. The larger gap wins when both footer parts show. */
  gap?: number;
}
export type DialoguePromptOptions = DialogueFooterTextOptions;
export interface DialoguePageCounterOptions extends DialogueFooterTextOptions {
  showWhenSinglePage?: boolean;
}
/** Hover styles exclude metrics so hovering never changes the menu layout. */
export interface DialogueChoiceHoverStyle {
  color?: string;
  markerColor?: string;
  surface?: DialogueSurfaceStyle;
}
export interface DialogueChoiceMarkerOptions extends DialogueTextStyle {
  /** Space between the marker column and the choice text. */
  gap?: number;
  /** Fixed marker column width. Defaults to the widest marker. */
  width?: number;
}
export interface DialogueChoicePagerOptions extends DialogueTextStyle {
  height?: number;
  surface?: DialogueSurfaceStyle;
}
export interface DialogueChoiceMenuOptions extends DialogueTextStyle {
  /** `auto` stacks choices above a panel in the lower half of the scene and below one in the upper half. */
  placement?: "auto" | "above" | "below";
  /** Menu alignment relative to the panel when the menu is narrower than the panel. */
  align?: DialogueAlign;
  width?: number | "panel";
  offset?: DialogueOffset;
  /** Space between the panel and the menu. */
  margin?: number;
  /** Space between choices, rows, and the pager. */
  gap?: number;
  columns?: number;
  /** Choices per menu page; larger lists get a previous/next pager. */
  perPage?: number;
  /** Text alignment inside each choice. */
  textAlign?: DialogueAlign;
  padding?: DialoguePadding;
  minHeight?: number;
  surface?: DialogueSurfaceStyle;
  hover?: DialogueChoiceHoverStyle;
  /** `false` hides the number column. */
  marker?: DialogueChoiceMarkerOptions | false;
  /** `false` hides paging controls; choices beyond the first page remain reachable through the ref. */
  pager?: DialogueChoicePagerOptions | false;
}
const roman = (value: number) => {
  let rest = value;
  let result = "";
  for (const [step, numeral] of [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const)
    for (; rest >= step; rest -= step) result += numeral;
  return result;
};
const letters = (value: number) => {
  let rest = value;
  let result = "";
  for (; rest > 0; rest = Math.floor((rest - 1) / 26))
    result = String.fromCharCode(65 + ((rest - 1) % 26)) + result;
  return result;
};
/**
 * Named marker formats keep presets JSON-serializable. Each receives the 1-based choice number.
 */
export const choiceMarkerFormats = {
  /** 01, 02, 03 */
  padded: (n: number) => String(n).padStart(2, "0"),
  /** 1. 2. 3. */
  numbered: (n: number) => `${n}.`,
  /** A, B, … Z, AA */
  letters,
  /** I, II, III */
  roman,
  /** ◆ for every choice */
  bullets: () => "◆",
} satisfies Record<string, (n: number) => string>;
export type ChoiceMarkerFormat = keyof typeof choiceMarkerFormats;
export function formatChoiceMarker(
  format: DialogueLabels["choiceMarker"],
  number: number,
  choice: NarrativeChoice,
) {
  return typeof format === "function"
    ? format(number, choice)
    : (choiceMarkerFormats[format] ?? choiceMarkerFormats.padded)(number);
}
/** Every string the dialogue draws. Override any subset, for example to localize. */
export interface DialogueLabels {
  /** Nameplate text for lines without a speaker. `null` hides the nameplate for narration. */
  narrator: string | null;
  /*
   * Prompt text, one per state. An empty string hides the prompt in that state.
   */
  /** While printing, when a click can reveal the rest of the page (`allowFastSkip`). */
  reveal: string;
  /** While printing, when fast skip is disabled. */
  printing: string;
  /** A page finished and more pages of this passage follow. */
  nextPage: string;
  /** The passage finished and has no choices. */
  continue: string;
  /** The passage finished and choices are open. */
  choose: string;
  paused: string;
  /** Page counter text. Pages are 1-based. */
  page: (page: number, count: number) => string;
  /** Marker for the nth (1-based) choice: a named format or a function. */
  choiceMarker: ChoiceMarkerFormat | ((number: number, choice: NarrativeChoice) => string);
  choicePage: (page: number, count: number) => string;
  previousChoices: string;
  nextChoices: string;
}
export const defaultDialogueLabels: DialogueLabels = {
  narrator: "Narrator",
  reveal: "",
  printing: "",
  nextPage: "Click to continue  ›",
  continue: "Click to continue  ›",
  choose: "Make your choice",
  paused: "Paused",
  page: (page, count) => `${page} / ${count}`,
  choiceMarker: "padded",
  choicePage: (page, count) => `Choices ${page} / ${count}`,
  previousChoices: "‹ Previous",
  nextChoices: "Next ›",
};
/** Per-speaker overrides, layered above the component's part props. */
export interface SpeakerStyle {
  /** Display name; defaults to the speaker id. */
  name?: string;
  /** This speaker's accent color: nameplate text and badge border. */
  color?: string;
  nameplate?: DialogueTextStyle & { surface?: DialogueSurfaceStyle };
  body?: DialogueBodyOptions;
  panel?: DialogueSurfaceStyle;
}

/* -------------------------------------------------------------------------------------------------
 * Resolution helpers
 * ---------------------------------------------------------------------------------------------- */

export type ResolvedText = Required<DialogueTextStyle>;
export type ResolvedSurface = Required<DialogueSurfaceStyle>;

/** Shallow merge that ignores `undefined`, so partial overrides never erase defaults. */
export function mergeDefined<T extends object>(base: T, ...layers: (Partial<T> | undefined)[]): T {
  const result = { ...base } as Record<string, unknown>;
  for (const layer of layers)
    if (layer)
      for (const [key, value] of Object.entries(layer))
        if (value !== undefined) result[key] = value;
  return result as T;
}

export function resolvePadding(padding: DialoguePadding): DialogueInsets {
  const clean = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
  if (typeof padding === "number") {
    const all = clean(padding);
    return { top: all, right: all, bottom: all, left: all };
  }
  if (padding.length === 2) {
    const [vertical, horizontal] = padding.map(clean);
    return { top: vertical, right: horizontal, bottom: vertical, left: horizontal };
  }
  const [top, right, bottom, left] = padding.map(clean);
  return { top, right, bottom, left };
}

export function fontShorthand(style: ResolvedText) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}
export function transformText(text: string, transform: DialogueTextStyle["textTransform"]) {
  return transform === "uppercase"
    ? text.toLocaleUpperCase()
    : transform === "lowercase"
      ? text.toLocaleLowerCase()
      : text;
}
/** Left edge of content of `contentWidth` aligned within `[left, left + width]`. */
export function alignStart(
  align: DialogueAlign,
  left: number,
  width: number,
  contentWidth: number,
) {
  return align === "center"
    ? left + (width - contentWidth) / 2
    : align === "end"
      ? left + width - contentWidth
      : left;
}
const textMetric = (style: ResolvedText) => style.fontSize * style.lineHeight;

export interface ResolvedNameplate extends ResolvedText {
  placement: "inside" | "border" | "outside";
  align: DialogueAlign;
  gap: number;
  surface: ResolvedSurface;
  padding: DialogueInsets;
  offset: DialogueOffset;
}
export interface ResolvedFooterText extends ResolvedText {
  align: DialogueAlign;
  gap: number;
}
export interface ResolvedPageCounter extends ResolvedFooterText {
  showWhenSinglePage: boolean;
}
export interface ResolvedChoiceMenu extends ResolvedText {
  placement: "auto" | "above" | "below";
  align: DialogueAlign;
  width: number | "panel";
  offset: DialogueOffset;
  margin: number;
  gap: number;
  columns: number;
  perPage: number;
  textAlign: DialogueAlign;
  padding: DialogueInsets;
  minHeight: number;
  surface: ResolvedSurface;
  hover: { color: string; markerColor: string; surface: ResolvedSurface };
  marker: (ResolvedText & { gap: number; width: number | undefined }) | false;
  pager: (ResolvedText & { height: number; surface: ResolvedSurface }) | false;
}
export interface DialogueStyleInput {
  theme?: Partial<DialogueTheme>;
  panel?: DialogueSurfaceStyle | false;
  body?: DialogueBodyOptions;
  nameplate?: DialogueNameplateOptions | false;
  prompt?: DialoguePromptOptions | false;
  pageCounter?: DialoguePageCounterOptions | false;
  choiceMenu?: DialogueChoiceMenuOptions | false;
  speaker?: SpeakerStyle;
}
export interface ResolvedDialogueStyle {
  theme: DialogueTheme;
  accent: string;
  panel: ResolvedSurface | false;
  body: ResolvedText & { textAlign: DialogueAlign };
  nameplate: ResolvedNameplate | false;
  prompt: ResolvedFooterText | false;
  pageCounter: ResolvedPageCounter | false;
  choiceMenu: ResolvedChoiceMenu | false;
}

function pickText<T extends DialogueTextStyle>(
  value: T | undefined,
): DialogueTextStyle | undefined {
  if (!value) return undefined;
  const {
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    color,
    lineHeight,
    letterSpacing,
    textTransform,
  } = value;
  return {
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    color,
    lineHeight,
    letterSpacing,
    textTransform,
  };
}
function sanitizeText(style: ResolvedText): ResolvedText {
  return {
    ...style,
    fontSize: Math.max(1, Math.min(400, style.fontSize)),
    lineHeight: Math.max(0.5, style.lineHeight),
  };
}

/** Layers defaults ← theme tokens ← part props ← speaker overrides into concrete drawing styles. */
export function resolveDialogueStyle(input: DialogueStyleInput): ResolvedDialogueStyle {
  const theme = mergeDefined(defaultDialogueTheme, input.theme);
  const speaker = input.speaker;
  const accent = speaker?.color ?? theme.accentColor;
  const uiText = (
    fontSize: number,
    color: string,
    extra?: Partial<ResolvedText>,
  ): ResolvedText => ({
    fontFamily: theme.uiFontFamily,
    fontSize,
    fontWeight: 600,
    fontStyle: "normal",
    color,
    lineHeight: 1.2,
    letterSpacing: 0,
    textTransform: "none",
    ...extra,
  });
  const smallRadius = (limit: number) => Math.min(limit, theme.radius);

  const panel =
    input.panel === false
      ? false
      : mergeDefined<ResolvedSurface>(
          {
            background: theme.background,
            borderColor: theme.borderColor,
            borderWidth: theme.borderWidth,
            radius: theme.radius,
          },
          input.panel,
          speaker?.panel,
        );

  const body = {
    ...sanitizeText(
      mergeDefined<ResolvedText>(
        {
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize,
          fontWeight: "normal",
          fontStyle: "normal",
          color: theme.textColor,
          lineHeight: theme.lineHeight,
          letterSpacing: 0,
          textTransform: "none",
        },
        pickText(input.body),
        pickText(speaker?.body),
      ),
    ),
    textAlign: speaker?.body?.textAlign ?? input.body?.textAlign ?? "start",
  };

  let nameplate: ResolvedNameplate | false = false;
  if (input.nameplate !== false) {
    const options = input.nameplate ?? {};
    nameplate = {
      ...sanitizeText(
        mergeDefined(
          uiText(15, accent, { letterSpacing: 1, textTransform: "uppercase" }),
          pickText(options),
          pickText(speaker?.nameplate),
        ),
      ),
      placement: options.placement ?? "inside",
      align: options.align ?? "start",
      gap: Math.max(0, options.gap ?? 10),
      surface: mergeDefined<ResolvedSurface>(
        {
          background: theme.background,
          borderColor: accent,
          borderWidth: theme.borderWidth,
          radius: smallRadius(8),
        },
        options.surface,
        speaker?.nameplate?.surface,
      ),
      padding: resolvePadding(options.padding ?? [6, 14]),
      offset: options.offset ?? [0, 0],
    };
  }

  const footer = (
    options: DialogueFooterTextOptions,
    align: DialogueAlign,
    transform: ResolvedText["textTransform"],
  ): ResolvedFooterText => ({
    ...sanitizeText(
      mergeDefined(
        uiText(12, theme.mutedColor, {
          fontWeight: 500,
          letterSpacing: 0.5,
          textTransform: transform,
        }),
        pickText(options),
      ),
    ),
    align: options.align ?? align,
    gap: Math.max(0, options.gap ?? 8),
  });
  const prompt = input.prompt === false ? false : footer(input.prompt ?? {}, "start", "uppercase");
  const pageCounter =
    input.pageCounter === false
      ? false
      : {
          ...footer(input.pageCounter ?? {}, "end", "none"),
          showWhenSinglePage: input.pageCounter?.showWhenSinglePage ?? false,
        };

  let choiceMenu: ResolvedChoiceMenu | false = false;
  if (input.choiceMenu !== false) {
    const options = input.choiceMenu ?? {};
    const surface = mergeDefined<ResolvedSurface>(
      {
        background: theme.choiceBackground,
        borderColor: theme.borderColor,
        borderWidth: theme.borderWidth,
        radius: smallRadius(10),
      },
      options.surface,
    );
    const text = sanitizeText(
      mergeDefined<ResolvedText>(
        {
          fontFamily: theme.fontFamily,
          fontSize: Math.round(theme.fontSize * 0.85),
          fontWeight: "normal",
          fontStyle: "normal",
          color: theme.textColor,
          lineHeight: 1.25,
          letterSpacing: 0,
          textTransform: "none",
        },
        pickText(options),
      ),
    );
    const marker =
      options.marker === false
        ? false
        : {
            ...sanitizeText(
              mergeDefined(
                uiText(16, theme.accentColor, { letterSpacing: 0.5 }),
                pickText(options.marker),
              ),
            ),
            gap: Math.max(0, options.marker?.gap ?? 16),
            width: options.marker?.width,
          };
    choiceMenu = {
      ...text,
      placement: options.placement ?? "auto",
      align: options.align ?? "center",
      width: options.width ?? "panel",
      offset: options.offset ?? [0, 0],
      margin: options.margin ?? 12,
      gap: Math.max(0, options.gap ?? 8),
      columns: Math.max(1, Math.floor(options.columns ?? 1)),
      perPage: Math.max(1, Math.floor(options.perPage ?? 3)),
      textAlign: options.textAlign ?? "start",
      padding: resolvePadding(options.padding ?? [12, 30]),
      minHeight: Math.max(0, options.minHeight ?? 50),
      surface,
      hover: {
        color: options.hover?.color ?? text.color,
        markerColor: options.hover?.markerColor ?? (marker ? marker.color : theme.accentColor),
        surface: mergeDefined(
          surface,
          { background: theme.choiceHoverBackground, borderColor: theme.accentColor },
          options.hover?.surface,
        ),
      },
      marker,
      pager:
        options.pager === false
          ? false
          : {
              ...sanitizeText(
                mergeDefined(
                  uiText(14, theme.accentColor, { fontWeight: 500 }),
                  pickText(options.pager),
                ),
              ),
              height: Math.max(1, options.pager?.height ?? 36),
              surface: mergeDefined<ResolvedSurface>(
                {
                  background: theme.background,
                  borderColor: theme.borderColor,
                  borderWidth: 0,
                  radius: smallRadius(10),
                },
                options.pager?.surface,
              ),
            },
    };
  }

  return { theme, accent, panel, body, nameplate, prompt, pageCounter, choiceMenu };
}

/* -------------------------------------------------------------------------------------------------
 * Layout
 * ---------------------------------------------------------------------------------------------- */

export interface PanelLayout {
  padding: DialogueInsets;
  /** Canvas coordinates (origin top-left, Y down). */
  nameplateY: number | null;
  bodyTop: number;
  bodyLeft: number;
  bodyWidth: number;
  bodyLineHeight: number;
  linesPerPage: number;
  footerY: number | null;
}
/** Vertical regions inside the panel. Footer space is reserved whenever a footer part is enabled. */
export function layoutPanel(
  style: Pick<ResolvedDialogueStyle, "body" | "nameplate" | "prompt" | "pageCounter">,
  options: { width: number; height: number; padding: DialoguePadding; hasName: boolean },
): PanelLayout {
  const padding = resolvePadding(options.padding);
  const { width, height } = options;
  const inside = style.nameplate && style.nameplate.placement === "inside" && options.hasName;
  const nameplateHeight = inside && style.nameplate ? textMetric(style.nameplate) : 0;
  const footers = [style.prompt, style.pageCounter].filter((part): part is ResolvedFooterText =>
    Boolean(part),
  );
  const footerHeight = footers.length ? Math.max(...footers.map(textMetric)) : 0;
  const footerGap = footers.length ? Math.max(...footers.map((part) => part.gap)) : 0;
  const bodyTop =
    padding.top + (inside && style.nameplate ? nameplateHeight + style.nameplate.gap : 0);
  const bodyBottom = height - padding.bottom - (footers.length ? footerHeight + footerGap : 0);
  const bodyLineHeight = textMetric(style.body);
  return {
    padding,
    nameplateY: inside ? padding.top + nameplateHeight / 2 : null,
    bodyTop,
    bodyLeft: padding.left,
    bodyWidth: Math.max(1, width - padding.left - padding.right),
    bodyLineHeight,
    linesPerPage: Math.max(1, Math.floor((bodyBottom - bodyTop) / bodyLineHeight)),
    footerY: footers.length ? height - padding.bottom - footerHeight / 2 : null,
  };
}

export interface MenuRect {
  /** Center, in the dialogue group's local coordinates (Y up). */
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ChoiceMenuLayout {
  direction: "above" | "below";
  itemWidth: number;
  items: MenuRect[];
  pager: MenuRect | null;
}
/** Measures nothing: it positions pre-measured choices around a panel centered at the origin. */
export function layoutChoiceMenu(options: {
  panelWidth: number;
  panelHeight: number;
  /** Panel Y in the scene; decides the `auto` placement. */
  panelY: number;
  menu: Pick<
    ResolvedChoiceMenu,
    "placement" | "align" | "width" | "offset" | "margin" | "gap" | "columns"
  >;
  itemHeights: readonly number[];
  pagerHeight: number | null;
  /** Extra space taken by parts protruding from the panel edge, such as a nameplate badge. */
  clearance?: { above: number; below: number };
}): ChoiceMenuLayout {
  const { panelWidth, panelHeight, menu, itemHeights, pagerHeight } = options;
  const direction =
    menu.placement === "auto" ? (options.panelY > 0 ? "below" : "above") : menu.placement;
  const width = Math.max(1, menu.width === "panel" ? panelWidth : menu.width);
  const columns = Math.max(1, Math.floor(menu.columns));
  const itemWidth = Math.max(1, (width - menu.gap * (columns - 1)) / columns);
  const rows: number[] = [];
  for (let start = 0; start < itemHeights.length; start += columns)
    rows.push(Math.max(...itemHeights.slice(start, start + columns)));
  const pagerBlock = pagerHeight === null ? 0 : (rows.length ? menu.gap : 0) + pagerHeight;
  const total =
    rows.reduce((sum, row) => sum + row, 0) + menu.gap * Math.max(0, rows.length - 1) + pagerBlock;
  const centerX =
    (menu.align === "start"
      ? -panelWidth / 2 + width / 2
      : menu.align === "end"
        ? panelWidth / 2 - width / 2
        : 0) + menu.offset[0];
  const clearance = options.clearance ?? { above: 0, below: 0 };
  let cursor =
    (direction === "below"
      ? -panelHeight / 2 - menu.margin - clearance.below
      : panelHeight / 2 + menu.margin + clearance.above + total) + menu.offset[1];
  const items: MenuRect[] = [];
  rows.forEach((rowHeight, row) => {
    for (let column = 0; column < columns; column++) {
      if (row * columns + column >= itemHeights.length) break;
      items.push({
        x: centerX - width / 2 + column * (itemWidth + menu.gap) + itemWidth / 2,
        y: cursor - rowHeight / 2,
        width: itemWidth,
        height: rowHeight,
      });
    }
    cursor -= rowHeight + menu.gap;
  });
  const pager =
    pagerHeight === null
      ? null
      : { x: centerX, y: cursor - pagerHeight / 2, width, height: pagerHeight };
  return { direction, itemWidth, items, pager };
}
