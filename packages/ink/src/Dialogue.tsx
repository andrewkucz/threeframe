import {
  CanvasPanel,
  paginateText,
  revealStops,
  wrapText,
  type RevealMode,
} from "@threeframe/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { InkController, NarrativeChoice } from "./controller";
import {
  alignStart,
  defaultDialogueLabels,
  fontShorthand,
  formatChoiceMarker,
  layoutChoiceMenu,
  layoutPanel,
  mergeDefined,
  resolveDialogueStyle,
  transformText,
  type DialogueBodyOptions,
  type DialogueChoiceMenuOptions,
  type DialogueLabels,
  type DialogueNameplateOptions,
  type DialoguePadding,
  type DialoguePageCounterOptions,
  type DialoguePromptOptions,
  type DialogueSurfaceStyle,
  type DialogueTheme,
  type MenuRect,
  type ResolvedChoiceMenu,
  type ResolvedSurface,
  type ResolvedText,
  type SpeakerStyle,
} from "./dialogueStyle";
import {
  mergeDialogueOptions,
  resolveDialoguePreset,
  type DialoguePreset,
  type DialoguePresetName,
} from "./presets";
import { useInk, useInkController } from "./react";

export interface DialoguePlayback {
  page: number;
  revealed: number;
}
export interface DialogueDisplay {
  text: string;
  page: number;
  pageCount: number;
  printing: boolean;
  choices: readonly NarrativeChoice[];
}
export interface DialogueHandle {
  advance: () => void;
  skip: () => void;
  choose: (index: number) => void;
  save: () => DialoguePlayback;
}
export interface DialogueBoxProps {
  /**
   * A built-in preset name or a custom preset object. It sits beneath every other prop: explicit
   * props deep-merge over it, so you can tweak any part of a preset.
   */
  preset?: DialoguePresetName | DialoguePreset;

  /* Content */
  text: string;
  speaker?: string | null;
  speakers?: Readonly<Record<string, SpeakerStyle>>;
  choices?: readonly NarrativeChoice[];

  /* Playback */
  reveal?: RevealMode;
  /** Units per second, interpreted according to reveal mode. Zero reveals instantly. */
  speed?: number;
  allowFastSkip?: boolean;
  paused?: boolean;
  initialPlayback?: DialoguePlayback;

  /* Geometry */
  position?: readonly [x: number, y: number, z: number];
  width?: number;
  height?: number;
  padding?: DialoguePadding;
  /** Canvas pixels per scene unit for every dialogue texture. */
  resolution?: number;

  /* Appearance: shared tokens, then one prop per visual part. `false` hides a part. */
  theme?: Partial<DialogueTheme>;
  panel?: DialogueSurfaceStyle | false;
  body?: DialogueBodyOptions;
  nameplate?: DialogueNameplateOptions | false;
  prompt?: DialoguePromptOptions | false;
  pageCounter?: DialoguePageCounterOptions | false;
  choiceMenu?: DialogueChoiceMenuOptions | false;
  labels?: Partial<DialogueLabels>;

  /* Events */
  onAdvance?: () => void;
  onChoose?: (index: number) => void;
  onDisplayChange?: (display: DialogueDisplay) => void;
  onPrintComplete?: () => void;
}
const NO_CHOICES: readonly NarrativeChoice[] = [];
const DEFAULT_POSITION = [0, -220, 100] as const;
const DEFAULT_PADDING: DialoguePadding = [24, 30];

let measureContext: CanvasRenderingContext2D | null = null;
function applyText(context: CanvasRenderingContext2D, style: ResolvedText) {
  context.font = fontShorthand(style);
  // Older engines without canvas letter spacing simply ignore the setting.
  if ("letterSpacing" in context) context.letterSpacing = `${style.letterSpacing}px`;
}
const capHeights = new Map<string, number>();
/**
 * Draws one line of text whose cap height is centered on `centerY`. Canvas's "middle" baseline
 * centers the em box instead, which sits visibly off-center by an amount that varies per font.
 */
function fillCentered(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  centerY: number,
) {
  let capHeight = capHeights.get(context.font);
  if (capHeight === undefined) {
    context.textBaseline = "alphabetic";
    capHeight = context.measureText("H").actualBoundingBoxAscent;
    capHeights.set(context.font, capHeight);
  }
  context.textBaseline = "alphabetic";
  context.fillText(value, x, centerY + capHeight / 2);
}
/** Returns a measure function for `style`. Use it before creating another measurer. */
function measurer(style: ResolvedText) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  const context = measureContext;
  if (!context) throw new Error("Canvas 2D is unavailable.");
  applyText(context, style);
  return (value: string) => context.measureText(value).width;
}
function drawSurface(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  surface: ResolvedSurface,
) {
  const border = Math.max(0, surface.borderWidth);
  const inner = [width - border, height - border];
  context.beginPath();
  context.roundRect(
    border / 2,
    border / 2,
    inner[0],
    inner[1],
    Math.max(0, Math.min(surface.radius, inner[0] / 2, inner[1] / 2)),
  );
  context.fillStyle = surface.background;
  context.fill();
  if (border > 0) {
    context.lineWidth = border;
    context.strokeStyle = surface.borderColor;
    context.stroke();
  }
}
/** Keeps object props referentially stable while their serializable content is unchanged. */
function useStable<T>(value: T): T {
  const key = JSON.stringify(value) ?? "";
  const cache = useRef({ key, value });
  if (cache.current.key !== key) cache.current = { key, value };
  return cache.current.value;
}

function ChoicePanel({
  index,
  lines,
  marker,
  markerColumn,
  rect,
  menu,
  resolution,
  onChoose,
}: {
  index: number;
  lines: readonly string[];
  marker: string | null;
  markerColumn: number;
  rect: MenuRect;
  menu: ResolvedChoiceMenu;
  resolution: number;
  onChoose: (index: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { padding } = menu;
      drawSurface(ctx, w, h, hover ? menu.hover.surface : menu.surface);
      const lineHeight = menu.fontSize * menu.lineHeight;
      const top = padding.top + (h - padding.top - padding.bottom - lines.length * lineHeight) / 2;
      if (marker && menu.marker) {
        applyText(ctx, menu.marker);
        ctx.fillStyle = hover ? menu.hover.markerColor : menu.marker.color;
        fillCentered(ctx, marker, padding.left, top + lineHeight / 2);
      }
      applyText(ctx, menu);
      ctx.fillStyle = hover ? menu.hover.color : menu.color;
      const left = padding.left + markerColumn;
      const width = w - left - padding.right;
      lines.forEach((line, i) =>
        fillCentered(
          ctx,
          line,
          alignStart(menu.textAlign, left, width, ctx.measureText(line).width),
          top + (i + 0.5) * lineHeight,
        ),
      );
    },
    [hover, menu, lines, marker, markerColumn],
  );
  return (
    <CanvasPanel
      width={rect.width}
      height={rect.height}
      resolution={resolution}
      position={[rect.x, rect.y, 1]}
      renderOrder={101}
      draw={draw}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
      onClick={(event) => {
        event.stopPropagation();
        onChoose(index);
      }}
    />
  );
}

export const DialogueBox = forwardRef<DialogueHandle, DialogueBoxProps>(function DialogueBox(
  { preset, ...props },
  ref,
) {
  type Own = Omit<DialogueBoxProps, "preset">;
  const merged = preset
    ? mergeDialogueOptions<Own>(resolveDialoguePreset(preset) as Own, props)
    : props;
  return <DialogueRenderer {...merged} ref={ref} />;
});

const DialogueRenderer = forwardRef<DialogueHandle, Omit<DialogueBoxProps, "preset">>(
  function DialogueRenderer(
    {
      text,
      speaker,
      speakers,
      choices = NO_CHOICES,
      reveal = "character",
      speed = 36,
      allowFastSkip = true,
      paused = false,
      initialPlayback,
      position = DEFAULT_POSITION,
      width = 1120,
      height = 210,
      padding: paddingProp = DEFAULT_PADDING,
      resolution = 2,
      theme,
      panel,
      body,
      nameplate,
      prompt,
      pageCounter,
      choiceMenu,
      labels: labelOverrides,
      onAdvance,
      onChoose,
      onDisplayChange,
      onPrintComplete,
    },
    ref,
  ) {
    const speakerStyle = speaker ? speakers?.[speaker] : undefined;
    const styleInput = useStable({
      theme,
      panel,
      body,
      nameplate,
      prompt,
      pageCounter,
      choiceMenu,
      speaker: speakerStyle,
    });
    const style = useMemo(() => resolveDialogueStyle(styleInput), [styleInput]);
    const padding = useStable(paddingProp);
    const labels = mergeDefined(defaultDialogueLabels, labelOverrides);
    const panelWidth = Math.max(1, width);
    const panelHeight = Math.max(1, height);

    const speakerName = speakerStyle?.name ?? speaker ?? labels.narrator;
    const nameText =
      style.nameplate && speakerName
        ? transformText(speakerName, style.nameplate.textTransform)
        : null;
    const layout = useMemo(
      () =>
        layoutPanel(style, {
          width: panelWidth,
          height: panelHeight,
          padding,
          hasName: Boolean(nameText),
        }),
      [style, panelWidth, panelHeight, padding, nameText],
    );

    const [fontRevision, setFontRevision] = useState(0);
    useEffect(() => {
      const update = () => setFontRevision((value) => value + 1);
      document.fonts.addEventListener("loadingdone", update);
      return () => document.fonts.removeEventListener("loadingdone", update);
    }, []);

    const source = transformText(text, style.body.textTransform);
    const bodyFont = `${fontShorthand(style.body)}|${style.body.letterSpacing}`;
    const pages = useMemo(
      () =>
        paginateText(wrapText(source, layout.bodyWidth, measurer(style.body)), layout.linesPerPage),
      // `bodyFont` and `fontRevision` capture every metric the measurer depends on.
      [source, layout.bodyWidth, layout.linesPerPage, bodyFont, fontRevision],
    );
    const layoutKey = `${layout.bodyWidth}:${layout.linesPerPage}:${bodyFont}:${fontRevision}`;
    const [playback, setPlayback] = useState(() => ({
      source,
      layout: layoutKey,
      page: initialPlayback?.page ?? 0,
      revealed: initialPlayback?.revealed ?? 0,
    }));
    const current = playback.source === source && playback.layout === layoutKey;
    const page = current ? Math.max(0, Math.min(pages.length - 1, Math.floor(playback.page))) : 0;
    const pageText = pages[page];
    const stops = useMemo(() => revealStops(pageText, reveal), [pageText, reveal]);
    const instant = reveal === "instant" || speed <= 0;
    const revealed = current ? Math.max(0, playback.revealed) : 0;
    const visibleCount = instant ? pageText.length : Math.min(pageText.length, revealed);
    const printing = visibleCount < pageText.length;
    const choiceReady = !printing && page === pages.length - 1;
    const shownChoices = choiceReady ? choices : NO_CHOICES;
    const latest = useRef({ onAdvance, onChoose, onDisplayChange, onPrintComplete });
    latest.current = { onAdvance, onChoose, onDisplayChange, onPrintComplete };

    useEffect(() => {
      if (paused || instant || !printing) return;
      let last = performance.now();
      let remainder = 0;
      const timer = window.setInterval(() => {
        const now = performance.now();
        remainder += (Math.min(now - last, 100) * Math.max(0, speed)) / 1000;
        last = now;
        const step = Math.floor(remainder);
        if (step < 1) return;
        remainder -= step;
        setPlayback((previous) => {
          const shown =
            previous.source === source && previous.layout === layoutKey && previous.page === page
              ? previous.revealed
              : 0;
          const next = stops.findIndex((stop) => stop > shown);
          return {
            source,
            layout: layoutKey,
            page,
            revealed:
              next < 0 ? pageText.length : stops[Math.min(stops.length - 1, next + step - 1)],
          };
        });
      }, 16);
      return () => window.clearInterval(timer);
    }, [source, layoutKey, page, pageText, stops, speed, paused, instant, printing]);

    useEffect(() => {
      latest.current.onDisplayChange?.({
        text: pageText,
        page,
        pageCount: pages.length,
        printing,
        choices: shownChoices,
      });
    }, [pageText, page, pages.length, printing, shownChoices]);
    const completedPage = useRef<string | null>(null);
    useEffect(() => {
      const key = `${source}:${page}:${pageText}`;
      if (!printing && completedPage.current !== key) {
        completedPage.current = key;
        latest.current.onPrintComplete?.();
      }
    }, [source, page, pageText, printing]);

    const skip = useCallback(() => {
      if (allowFastSkip && !paused)
        setPlayback({ source, layout: layoutKey, page, revealed: pageText.length });
    }, [allowFastSkip, paused, source, layoutKey, page, pageText]);
    const advance = useCallback(() => {
      if (paused) return;
      if (printing) {
        skip();
        return;
      }
      if (page < pages.length - 1)
        setPlayback({ source, layout: layoutKey, page: page + 1, revealed: 0 });
      else if (!choices.length) latest.current.onAdvance?.();
    }, [paused, printing, skip, page, pages.length, source, layoutKey, choices.length]);
    const choose = useCallback(
      (index: number) => {
        if (!paused && choiceReady && choices.some((choice) => choice.index === index))
          latest.current.onChoose?.(index);
      },
      [paused, choiceReady, choices],
    );
    useImperativeHandle(
      ref,
      () => ({ advance, skip, choose, save: () => ({ page, revealed: visibleCount }) }),
      [advance, skip, choose, page, visibleCount],
    );

    const hint = paused
      ? labels.paused
      : printing
        ? allowFastSkip
          ? labels.reveal
          : labels.printing
        : page < pages.length - 1
          ? labels.nextPage
          : choices.length
            ? labels.choose
            : labels.continue;
    const promptText = style.prompt && hint ? transformText(hint, style.prompt.textTransform) : "";
    const counterText =
      style.pageCounter && (pages.length > 1 || style.pageCounter.showWhenSinglePage)
        ? transformText(labels.page(page + 1, pages.length), style.pageCounter.textTransform)
        : "";

    const draw = useCallback(
      (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        if (style.panel) drawSurface(ctx, w, h, style.panel);
        const { bodyLeft: left, bodyWidth: area } = layout;
        if (style.nameplate && nameText && layout.nameplateY !== null) {
          applyText(ctx, style.nameplate);
          ctx.fillStyle = style.nameplate.color;
          const x = alignStart(style.nameplate.align, left, area, ctx.measureText(nameText).width);
          fillCentered(ctx, nameText, x, layout.nameplateY);
        }
        applyText(ctx, style.body);
        ctx.fillStyle = style.body.color;
        const fullLines = pageText.split("\n");
        pageText
          .slice(0, visibleCount)
          .split("\n")
          .forEach((line, i) => {
            // Align by the full line so centered or end-aligned text does not drift while printing.
            const x = alignStart(
              style.body.textAlign,
              left,
              area,
              ctx.measureText(fullLines[i]).width,
            );
            fillCentered(ctx, line, x, layout.bodyTop + (i + 0.5) * layout.bodyLineHeight);
          });
        for (const [part, value] of [
          [style.prompt, promptText],
          [style.pageCounter, counterText],
        ] as const) {
          if (!part || !value || layout.footerY === null) continue;
          applyText(ctx, part);
          ctx.fillStyle = part.color;
          fillCentered(
            ctx,
            value,
            alignStart(part.align, left, area, ctx.measureText(value).width),
            layout.footerY,
          );
        }
      },
      [style, layout, nameText, pageText, visibleCount, promptText, counterText],
    );

    const badge = useMemo(() => {
      const plate = style.nameplate;
      if (!plate || plate.placement === "inside" || !nameText) return null;
      const textWidth = measurer(plate)(nameText);
      const textHeight = plate.fontSize * plate.lineHeight;
      const badgeWidth = textWidth + plate.padding.left + plate.padding.right;
      const badgeHeight = textHeight + plate.padding.top + plate.padding.bottom;
      const { left, right } = layout.padding;
      const x =
        (plate.align === "center"
          ? 0
          : plate.align === "end"
            ? panelWidth / 2 - right - badgeWidth / 2
            : -panelWidth / 2 + left + badgeWidth / 2) + plate.offset[0];
      const rise = plate.placement === "border" ? 0 : plate.gap + badgeHeight / 2;
      const y = panelHeight / 2 + rise + plate.offset[1];
      return {
        x,
        y,
        width: badgeWidth,
        height: badgeHeight,
        // How far the badge extends above the panel, so a menu stacked above can clear it.
        protrusion: Math.max(0, y + badgeHeight / 2 - panelHeight / 2),
      };
    }, [style.nameplate, nameText, layout.padding, panelWidth, panelHeight, fontRevision]);
    const drawBadge = useCallback(
      (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        const plate = style.nameplate;
        if (!plate || !nameText) return;
        drawSurface(ctx, w, h, plate.surface);
        applyText(ctx, plate);
        ctx.fillStyle = plate.color;
        fillCentered(
          ctx,
          nameText,
          plate.padding.left,
          plate.padding.top + (plate.fontSize * plate.lineHeight) / 2,
        );
      },
      [style.nameplate, nameText],
    );

    const menu = style.choiceMenu;
    const [choicePage, setChoicePage] = useState(0);
    const choicePageCount = menu ? Math.max(1, Math.ceil(shownChoices.length / menu.perPage)) : 1;
    const currentChoicePage = Math.min(choicePage, choicePageCount - 1);
    const markerFormat = labels.choiceMarker;
    const markers = useMemo(
      () =>
        menu && menu.marker
          ? shownChoices.map((choice, i) =>
              transformText(
                formatChoiceMarker(markerFormat, i + 1, choice),
                menu.marker ? menu.marker.textTransform : "none",
              ),
            )
          : null,
      [menu, shownChoices, markerFormat],
    );
    const menuLayout = useMemo(() => {
      if (!menu || !shownChoices.length) return null;
      let markerColumn = 0;
      if (menu.marker && markers) {
        const measureMarker = measurer(menu.marker);
        markerColumn =
          (menu.marker.width ?? Math.max(0, ...markers.map(measureMarker))) + menu.marker.gap;
      }
      const start = currentChoicePage * menu.perPage;
      const visible = shownChoices.slice(start, start + menu.perPage);
      const pagerHeight = menu.pager && choicePageCount > 1 ? menu.pager.height : null;
      const base = {
        panelWidth,
        panelHeight,
        panelY: position[1],
        menu,
        pagerHeight,
        clearance: { above: badge?.protrusion ?? 0, below: 0 },
      };
      const { itemWidth } = layoutChoiceMenu({ ...base, itemHeights: [] });
      const textWidth = Math.max(
        1,
        itemWidth - menu.padding.left - menu.padding.right - markerColumn,
      );
      const measure = measurer(menu);
      const lineHeight = menu.fontSize * menu.lineHeight;
      const items = visible.map((choice, i) => {
        const lines = wrapText(transformText(choice.text, menu.textTransform), textWidth, measure);
        return {
          choice,
          marker: markers?.[start + i] ?? null,
          lines,
          height: Math.max(
            menu.minHeight,
            menu.padding.top + menu.padding.bottom + lines.length * lineHeight,
          ),
        };
      });
      const placed = layoutChoiceMenu({ ...base, itemHeights: items.map((item) => item.height) });
      return {
        markerColumn,
        pager: placed.pager,
        items: items.map((item, i) => ({ ...item, rect: placed.items[i] })),
      };
    }, [
      menu,
      markers,
      shownChoices,
      currentChoicePage,
      choicePageCount,
      panelWidth,
      panelHeight,
      position[1],
      badge?.protrusion,
      fontRevision,
    ]);
    const pagerLabels = [
      labels.previousChoices,
      labels.choicePage(currentChoicePage + 1, choicePageCount),
      labels.nextChoices,
    ].map((value) => (menu && menu.pager ? transformText(value, menu.pager.textTransform) : value));
    const [previousLabel, statusLabel, nextLabel] = pagerLabels;
    const drawPager = useCallback(
      (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        if (!menu || !menu.pager) return;
        drawSurface(ctx, w, h, menu.pager.surface);
        applyText(ctx, menu.pager);
        ctx.fillStyle = menu.pager.color;
        const inset = Math.max(14, menu.pager.surface.radius);
        fillCentered(ctx, previousLabel, inset, h / 2);
        ctx.textAlign = "center";
        fillCentered(ctx, statusLabel, w / 2, h / 2);
        ctx.textAlign = "right";
        fillCentered(ctx, nextLabel, w - inset, h / 2);
      },
      [menu, previousLabel, statusLabel, nextLabel],
    );

    return (
      <group position={position as [number, number, number]}>
        <CanvasPanel
          width={panelWidth}
          height={panelHeight}
          resolution={resolution}
          draw={draw}
          renderOrder={100}
          onClick={(event) => {
            event.stopPropagation();
            advance();
          }}
        />
        {badge && (
          <CanvasPanel
            width={badge.width}
            height={badge.height}
            resolution={resolution}
            position={[badge.x, badge.y, 1]}
            renderOrder={103}
            draw={drawBadge}
            onClick={(event) => {
              event.stopPropagation();
              advance();
            }}
          />
        )}
        {menu &&
          menuLayout?.items.map((item) => (
            <ChoicePanel
              key={item.choice.index}
              index={item.choice.index}
              lines={item.lines}
              marker={item.marker}
              markerColumn={menuLayout.markerColumn}
              rect={item.rect}
              menu={menu}
              resolution={resolution}
              onChoose={choose}
            />
          ))}
        {menuLayout?.pager && (
          <CanvasPanel
            width={menuLayout.pager.width}
            height={menuLayout.pager.height}
            resolution={resolution}
            position={[menuLayout.pager.x, menuLayout.pager.y, 1]}
            renderOrder={102}
            draw={drawPager}
            onClick={(event) => {
              event.stopPropagation();
              if (paused) return;
              const point = event.object.worldToLocal(event.point.clone());
              setChoicePage(
                (currentChoicePage + (point.x < 0 ? -1 : 1) + choicePageCount) % choicePageCount,
              );
            }}
          />
        )}
      </group>
    );
  },
);

export interface InkDialogueProps extends Omit<
  DialogueBoxProps,
  "text" | "choices" | "speaker" | "onAdvance" | "onChoose"
> {
  controller?: InkController;
  onError?: (error: Error) => void;
}
export const InkDialogue = forwardRef<DialogueHandle, InkDialogueProps>(function InkDialogue(
  { controller: explicit, onError, ...props },
  ref,
) {
  const controller = useInkController(explicit);
  const snapshot = useInk(controller);
  const perform = (action: () => void) => {
    try {
      action();
    } catch (reason) {
      if (!onError) throw reason;
      onError(reason instanceof Error ? reason : new Error(String(reason)));
    }
  };
  if (snapshot.status === "idle" || snapshot.status === "ended") return null;
  return (
    <DialogueBox
      key={snapshot.lineId}
      {...props}
      ref={ref}
      text={snapshot.text}
      speaker={snapshot.speaker}
      choices={snapshot.choices}
      onAdvance={() => perform(controller.advance)}
      onChoose={(index) => perform(() => controller.choose(index))}
    />
  );
});
