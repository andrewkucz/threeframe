import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { InkController, type NarrativeEvent } from "./controller";

const InkContext = createContext<InkController | null>(null);
export function InkProvider({
  controller,
  children,
  autoStart = true,
  onEvent,
}: {
  controller: InkController;
  children: ReactNode;
  autoStart?: boolean;
  onEvent?: (event: NarrativeEvent) => void;
}) {
  useEffect(() => (onEvent ? controller.onEvent(onEvent) : undefined), [controller, onEvent]);
  useEffect(() => {
    if (autoStart) controller.start();
  }, [controller, autoStart]);
  return <InkContext.Provider value={controller}>{children}</InkContext.Provider>;
}
export function useInkController(explicit?: InkController) {
  const provided = useContext(InkContext);
  const controller = explicit ?? provided;
  if (!controller) throw new Error("Use InkProvider or pass an InkController.");
  return controller;
}
export function useInk(explicit?: InkController) {
  const controller = useInkController(explicit);
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
