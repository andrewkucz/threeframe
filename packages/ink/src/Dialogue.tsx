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
import { useInk, useInkController } from "./react";

export interface SpeakerStyle {
  name?: string;
  color?: string;
  font?: string;
}
export interface DialogueTheme {
  background: string;
  border: string;
  color: string;
  muted: string;
  accent: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  radius: number;
  choiceBackground: string;
  choiceHover: string;
}
export const defaultDialogueTheme: DialogueTheme = {
  background: "rgba(15, 24, 33, 0.96)",
  border: "#50606b",
  color: "#f3eee2",
  muted: "#abb7be",
  accent: "#eabd78",
  fontFamily: "Georgia, serif",
  fontSize: 25,
  lineHeight: 1.5,
  radius: 14,
  choiceBackground: "#182d3a",
  choiceHover: "#2b4756",
};
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
  text: string;
  speaker?: string | null;
  speakers?: Readonly<Record<string, SpeakerStyle>>;
  choices?: readonly NarrativeChoice[];
  /** Bounds large decision trees; the native panel provides next/previous controls. */
  choicesPerPage?: number;
  width?: number;
  height?: number;
  padding?: number;
  position?: [number, number, number];
  theme?: Partial<DialogueTheme>;
  /** Units per second, interpreted according to reveal mode. Zero reveals instantly. */
  speed?: number;
  reveal?: RevealMode;
  allowFastSkip?: boolean;
  paused?: boolean;
  initialPlayback?: DialoguePlayback;
  onAdvance?: () => void;
  onChoose?: (index: number) => void;
  onDisplayChange?: (display: DialogueDisplay) => void;
  onPrintComplete?: () => void;
}
const NO_CHOICES: readonly NarrativeChoice[] = [];

function ChoicePanel({
  text,
  index,
  y,
  width,
  height,
  theme,
  padding,
  onChoose,
}: {
  text: string;
  index: number;
  y: number;
  width: number;
  height: number;
  theme: DialogueTheme;
  padding: number;
  onChoose: (index: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = hover ? theme.choiceHover : theme.choiceBackground;
      ctx.strokeStyle = hover ? theme.accent : theme.border;
      ctx.beginPath();
      ctx.roundRect(1, 1, w - 2, h - 2, Math.min(10, theme.radius));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = theme.accent;
      ctx.font = `600 16px system-ui`;
      ctx.fillText(String(index + 1).padStart(2, "0"), padding, 30);
      ctx.font = `${theme.fontSize * 0.85}px ${theme.fontFamily}`;
      ctx.fillStyle = theme.color;
      wrapText(text, w - padding * 2 - 40, (value) => ctx.measureText(value).width).forEach(
        (line, i) => ctx.fillText(line, padding + 40, 29 + i * theme.fontSize * 1.15),
      );
    },
    [hover, theme, padding, text, index],
  );
  return (
    <CanvasPanel
      width={width}
      height={height}
      position={[0, y, 1]}
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
  {
    text,
    speaker,
    speakers,
    choices = NO_CHOICES,
    choicesPerPage = 3,
    width = 1120,
    height = 210,
    padding = 30,
    position = [0, -220, 100],
    theme: customTheme,
    speed = 36,
    reveal = "character",
    allowFastSkip = true,
    paused = false,
    initialPlayback,
    onAdvance,
    onChoose,
    onDisplayChange,
    onPrintComplete,
  },
  ref,
) {
  const theme = useMemo(() => ({ ...defaultDialogueTheme, ...customTheme }), [customTheme]);
  const safeWidth = Math.max(180, width);
  const safeHeight = Math.max(120, height);
  const safePadding = Math.max(0, Math.min(padding, (safeWidth - 120) / 2, (safeHeight - 80) / 2));
  const fontSize = Math.max(8, Math.min(80, theme.fontSize));
  const lineHeight = fontSize * Math.max(1, theme.lineHeight);
  const [fontRevision, setFontRevision] = useState(0);
  useEffect(() => {
    const update = () => setFontRevision((value) => value + 1);
    document.fonts.addEventListener("loadingdone", update);
    return () => document.fonts.removeEventListener("loadingdone", update);
  }, []);
  const pages = useMemo(() => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${fontSize}px ${theme.fontFamily}`;
    return paginateText(
      wrapText(text, safeWidth - safePadding * 2, (value) => context.measureText(value).width),
      Math.max(1, Math.floor((safeHeight - safePadding * 2 - 49) / lineHeight)),
    );
  }, [
    text,
    safeWidth,
    safeHeight,
    safePadding,
    fontSize,
    theme.fontFamily,
    lineHeight,
    fontRevision,
  ]);
  const layout = `${safeWidth}:${safeHeight}:${safePadding}:${fontSize}:${lineHeight}:${theme.fontFamily}:${fontRevision}`;
  const [playback, setPlayback] = useState(() => ({
    source: text,
    layout,
    page: initialPlayback?.page ?? 0,
    revealed: initialPlayback?.revealed ?? 0,
  }));
  const page =
    playback.source === text && playback.layout === layout
      ? Math.max(0, Math.min(pages.length - 1, Math.floor(playback.page)))
      : 0;
  const pageText = pages[page];
  const stops = useMemo(() => revealStops(pageText, reveal), [pageText, reveal]);
  const instant = reveal === "instant" || speed <= 0;
  const revealed =
    playback.source === text && playback.layout === layout ? Math.max(0, playback.revealed) : 0;
  const visibleCount = instant ? pageText.length : Math.min(pageText.length, revealed);
  const printing = visibleCount < pageText.length;
  const choiceReady = !printing && page === pages.length - 1;
  const shownChoices = choiceReady ? choices : NO_CHOICES;
  const [choicePage, setChoicePage] = useState(0);
  const pageSize = Math.max(1, Math.floor(choicesPerPage));
  const choicePageCount = Math.max(1, Math.ceil(shownChoices.length / pageSize));
  const currentChoicePage = Math.min(choicePage, choicePageCount - 1);
  const visibleChoices = useMemo(
    () => shownChoices.slice(currentChoicePage * pageSize, (currentChoicePage + 1) * pageSize),
    [shownChoices, currentChoicePage, pageSize],
  );
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
        const current =
          previous.source === text && previous.layout === layout && previous.page === page
            ? previous.revealed
            : 0;
        const next = stops.findIndex((stop) => stop > current);
        return {
          source: text,
          layout,
          page,
          revealed: next < 0 ? pageText.length : stops[Math.min(stops.length - 1, next + step - 1)],
        };
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [text, layout, page, pageText, stops, speed, paused, instant, printing]);

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
    const key = `${text}:${page}:${pageText}`;
    if (!printing && completedPage.current !== key) {
      completedPage.current = key;
      latest.current.onPrintComplete?.();
    }
  }, [text, page, pageText, printing]);

  const skip = useCallback(() => {
    if (allowFastSkip && !paused)
      setPlayback({ source: text, layout, page, revealed: pageText.length });
  }, [allowFastSkip, paused, text, layout, page, pageText]);
  const advance = useCallback(() => {
    if (paused) return;
    if (printing) {
      skip();
      return;
    }
    if (page < pages.length - 1) setPlayback({ source: text, layout, page: page + 1, revealed: 0 });
    else if (!choices.length) latest.current.onAdvance?.();
  }, [paused, printing, skip, page, pages.length, text, layout, choices.length]);
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

  const speakerStyle = speaker ? speakers?.[speaker] : undefined;
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = theme.background;
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(1, 1, w - 2, h - 2, Math.max(0, theme.radius));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = speakerStyle?.color ?? theme.accent;
      ctx.font = speakerStyle?.font ?? "600 15px system-ui";
      ctx.fillText(
        (speakerStyle?.name ?? speaker ?? "Narrator").toLocaleUpperCase(),
        safePadding,
        safePadding + 12,
        w - 2 * safePadding,
      );
      ctx.font = `${fontSize}px ${theme.fontFamily}`;
      ctx.fillStyle = theme.color;
      ctx.textBaseline = "top";
      pageText
        .slice(0, visibleCount)
        .split("\n")
        .forEach((line, i) => {
          ctx.fillText(line, safePadding, safePadding + 34 + i * lineHeight);
        });
      ctx.textBaseline = "alphabetic";
      ctx.font = "12px system-ui";
      ctx.fillStyle = theme.muted;
      const hint = paused
        ? "PAUSED"
        : printing
          ? allowFastSkip
            ? "CLICK TO REVEAL"
            : ""
          : choices.length && choiceReady
            ? "MAKE YOUR CHOICE"
            : "CLICK TO CONTINUE  ›";
      ctx.fillText(hint, safePadding, h - 16);
      if (pages.length > 1) {
        ctx.textAlign = "right";
        ctx.fillText(`${page + 1} / ${pages.length}`, w - safePadding, h - 16);
      }
    },
    [
      theme,
      speakerStyle,
      speaker,
      safePadding,
      fontSize,
      pageText,
      visibleCount,
      lineHeight,
      paused,
      printing,
      allowFastSkip,
      choices.length,
      choiceReady,
      pages.length,
      page,
    ],
  );

  const choiceLayouts = useMemo(() => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${theme.fontSize * 0.85}px ${theme.fontFamily}`;
    let offset = safeHeight / 2 + 12;
    const ordered = position[1] > 0 ? visibleChoices : [...visibleChoices].reverse();
    return ordered.map((choice) => {
      const lines = wrapText(
        choice.text,
        safeWidth - safePadding * 2 - 40,
        (value) => context.measureText(value).width,
      );
      const choiceHeight = Math.max(50, 20 + lines.length * theme.fontSize * 1.15);
      const y = (offset + choiceHeight / 2) * (position[1] > 0 ? -1 : 1);
      offset += choiceHeight + 8;
      return { choice, y, height: choiceHeight };
    });
  }, [
    visibleChoices,
    position[1],
    theme.fontSize,
    theme.fontFamily,
    safeHeight,
    safeWidth,
    safePadding,
    fontRevision,
  ]);

  return (
    <group position={position}>
      <CanvasPanel
        width={safeWidth}
        height={safeHeight}
        draw={draw}
        renderOrder={100}
        onClick={(event) => {
          event.stopPropagation();
          advance();
        }}
      />
      {choiceLayouts.map(({ choice, y, height: choiceHeight }) => (
        <ChoicePanel
          key={choice.index}
          text={choice.text}
          index={choice.index}
          y={y}
          width={safeWidth}
          height={choiceHeight}
          theme={theme}
          padding={safePadding}
          onChoose={choose}
        />
      ))}
      {choicePageCount > 1 && (
        <CanvasPanel
          width={safeWidth}
          height={36}
          position={[
            0,
            (safeHeight / 2 + 32) * (position[1] > 0 ? -1 : 1) +
              choiceLayouts.reduce((sum, item) => sum + item.height + 8, 0) *
                (position[1] > 0 ? -1 : 1),
            1,
          ]}
          renderOrder={102}
          draw={(ctx, w) => {
            ctx.fillStyle = theme.background;
            ctx.fillRect(0, 0, w, 36);
            ctx.fillStyle = theme.accent;
            ctx.font = "14px system-ui";
            ctx.fillText("‹ Previous choices", 15, 24);
            ctx.textAlign = "right";
            ctx.fillText(
              `Choices ${currentChoicePage + 1}/${choicePageCount} · Next ›`,
              w - 15,
              24,
            );
          }}
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
});

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
