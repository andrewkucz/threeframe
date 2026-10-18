import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import type { Story } from "inkjs";
import { compileInk } from "./compiler";
import { InkController, type NarrativeEvent } from "./controller";
import { InkDialogue, type DialogueHandle, type InkDialogueProps } from "./Dialogue";
import { InkProvider } from "./react";

export interface InkStoryProps extends Omit<InkDialogueProps, "controller"> {
  source: string;
  format?: "ink" | "json";
  configureStory?: (story: Story) => void;
  onReady?: (controller: InkController) => void;
  onEvent?: (event: NarrativeEvent) => void;
  /** Must be a valid R3F node, because this component lives inside a Canvas. */
  fallback?: ReactNode;
}

/** Drop raw Ink text or compiled JSON directly into a Three.js scene. */
export const InkStory = forwardRef<DialogueHandle, InkStoryProps>(function InkStory(
  {
    source,
    format = "ink",
    configureStory,
    onReady,
    onEvent,
    onError,
    fallback = null,
    ...dialogue
  },
  ref,
) {
  const [loaded, setLoaded] = useState<{
    source: string;
    format: string;
    controller: InkController;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const latest = useRef({ configureStory, onReady, onError });
  latest.current = { configureStory, onReady, onError };
  useEffect(() => {
    let active = true;
    setError(null);
    void (format === "ink" ? compileInk(source) : Promise.resolve(source))
      .then((compiled) => {
        if (!active) return;
        const controller = new InkController(compiled, {
          configure: latest.current.configureStory,
        });
        latest.current.onReady?.(controller);
        setLoaded({ source, format, controller });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const result = reason instanceof Error ? reason : new Error(String(reason));
        setError(result);
        latest.current.onError?.(result);
      });
    return () => {
      active = false;
    };
  }, [source, format]);
  if (error) {
    if (!onError) throw error;
    return fallback;
  }
  if (!loaded || loaded.source !== source || loaded.format !== format) return fallback;
  return (
    <InkProvider key={loaded.controller.storyId} controller={loaded.controller} onEvent={onEvent}>
      <InkDialogue {...dialogue} ref={ref} onError={onError} />
    </InkProvider>
  );
});
