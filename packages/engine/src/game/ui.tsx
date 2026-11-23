import {
  parseSave,
  saveFileName,
  serializeSave,
  type GameSession,
  type GameSnapshot,
  type SaveFile,
  type SaveSlotInfo,
} from "@threeframe/game";
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import { useSaveSlots } from "./hooks";

/** Every string the game UI shows. Override any subset, e.g. to localize. */
export interface GameLabels {
  newGame: string;
  continue: string;
  load: string;
  save: string;
  resume: string;
  menu: string;
  quitToTitle: string;
  credits: string;
  close: string;
  back: string;
  levelComplete: string;
  nextLevel: string;
  gameOver: string;
  retryLevel: string;
  theEnd: string;
  ending: (ending: string) => string;
  playAgain: string;
  autosave: string;
  slot: (slot: string) => string;
  emptySlot: string;
  saveHere: string;
  overwrite: string;
  delete: string;
  exportSave: string;
  importSave: string;
  importFailed: (message: string) => string;
  saved: string;
  loading: string;
  loadingProgress: (loaded: number, total: number) => string;
  error: string;
  retry: string;
  playtime: (seconds: number) => string;
  savedAt: (date: Date) => string;
}

export const defaultGameLabels: GameLabels = {
  newGame: "New game",
  continue: "Continue",
  load: "Load",
  save: "Save",
  resume: "Resume",
  menu: "Menu",
  quitToTitle: "Quit to title",
  credits: "Credits",
  close: "Close",
  back: "Back",
  levelComplete: "Level complete",
  nextLevel: "Continue",
  gameOver: "Game over",
  retryLevel: "Retry level",
  theEnd: "The end",
  ending: (ending) => `Ending: ${ending}`,
  playAgain: "Back to title",
  autosave: "Autosave",
  slot: (slot) => `Slot ${slot}`,
  emptySlot: "Empty",
  saveHere: "Save here",
  overwrite: "Overwrite",
  delete: "Delete",
  exportSave: "Export",
  importSave: "Import save file…",
  importFailed: (message) => `Couldn't import: ${message}`,
  saved: "Saved",
  loading: "Loading…",
  loadingProgress: (loaded, total) => `${loaded} / ${total}`,
  error: "Something went wrong.",
  retry: "Retry",
  playtime: (seconds) => {
    const minutes = Math.floor(seconds / 60);
    return minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
      : `${minutes}m`;
  },
  savedAt: (date) => date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
};

/** Menus a player can open on top of play or the title screen. */
export type GameMenu = "pause" | "save" | "load" | "credits" | null;

/** What every screen receives. */
export interface GameScreenProps {
  session: GameSession;
  snapshot: GameSnapshot;
  labels: GameLabels;
  menu: GameMenu;
  openMenu: (menu: GameMenu) => void;
  /** Reports a problem from a UI action (e.g. a failed load). */
  onError: (error: Error) => void;
}

/** Screens a `GamePlayer` renders. Replace any of them, or pass `null` to drop one. */
export interface GameUIComponents {
  Title: ComponentType<GameScreenProps> | null;
  PauseMenu: ComponentType<GameScreenProps> | null;
  SaveLoad: ComponentType<GameScreenProps & { mode: "save" | "load" }> | null;
  LevelComplete: ComponentType<GameScreenProps> | null;
  GameOver: ComponentType<GameScreenProps> | null;
  Credits: ComponentType<GameScreenProps> | null;
  Complete: ComponentType<GameScreenProps> | null;
  Hud: ComponentType<GameScreenProps> | null;
  /** The always-visible menu button during play. */
  MenuButton: ComponentType<GameScreenProps> | null;
}

const run = (props: GameScreenProps, action: () => unknown) => {
  try {
    const result = action();
    if (result instanceof Promise)
      result.catch((error: unknown) =>
        props.onError(error instanceof Error ? error : new Error(String(error))),
      );
  } catch (error) {
    props.onError(error instanceof Error ? error : new Error(String(error)));
  }
};

function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`tf-game-screen ${className}`} role="dialog" aria-modal="true">
      <div className="tf-game-card">{children}</div>
    </div>
  );
}

export function TitleScreen(props: GameScreenProps) {
  const { session, labels, openMenu } = props;
  const slots = useSaveSlots(session.saves);
  const hasSave = !!slots?.some((slot) => slot.save);
  const { manifest } = session;
  return (
    <div className="tf-game-screen tf-game-title" role="dialog" aria-label={manifest.title}>
      <div className="tf-game-title-inner">
        <h1>{manifest.title}</h1>
        {manifest.author && <p className="tf-game-muted">{manifest.author}</p>}
        {manifest.description && <p className="tf-game-description">{manifest.description}</p>}
        <nav className="tf-game-actions">
          {hasSave && (
            <button autoFocus onClick={() => run(props, () => session.continueGame())}>
              {labels.continue}
            </button>
          )}
          <button autoFocus={!hasSave} onClick={() => run(props, () => session.newGame())}>
            {labels.newGame}
          </button>
          {session.saves && (
            <button disabled={!hasSave} onClick={() => openMenu("load")}>
              {labels.load}
            </button>
          )}
          {manifest.credits && (
            <button onClick={() => openMenu("credits")}>{labels.credits}</button>
          )}
        </nav>
      </div>
    </div>
  );
}

export function PauseMenu(props: GameScreenProps) {
  const { session, labels, openMenu } = props;
  return (
    <Screen>
      <h2>{labels.menu}</h2>
      <nav className="tf-game-actions">
        <button autoFocus onClick={() => openMenu(null)}>
          {labels.resume}
        </button>
        {session.saves && session.saves.slots.length > 0 && (
          <button onClick={() => openMenu("save")}>{labels.save}</button>
        )}
        {session.saves && <button onClick={() => openMenu("load")}>{labels.load}</button>}
        <button
          onClick={() => {
            openMenu(null);
            session.toTitle();
          }}
        >
          {labels.quitToTitle}
        </button>
      </nav>
    </Screen>
  );
}

function download(save: SaveFile) {
  const url = URL.createObjectURL(new Blob([serializeSave(save)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = saveFileName(save);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaveLoadPanel(props: GameScreenProps & { mode: "save" | "load" }) {
  const { session, labels, openMenu, mode, snapshot } = props;
  const slots = useSaveSlots(session.saves);
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const close = () => openMenu(snapshot.phase === "title" ? null : "pause");
  const load = (save: SaveFile) =>
    run(props, async () => {
      await session.load(save);
      openMenu(null);
    });
  const slotTitle = (slot: SaveSlotInfo) =>
    slot.kind === "auto" ? labels.autosave : labels.slot(slot.slot);
  return (
    <Screen className="tf-game-saves">
      <header className="tf-game-row">
        <h2>{mode === "save" ? labels.save : labels.load}</h2>
        <button className="tf-game-quiet" onClick={close}>
          {labels.back}
        </button>
      </header>
      <ul className="tf-game-slots">
        {(slots ?? []).map((slot) => {
          const save = slot.save;
          const writable = mode === "save" && slot.kind === "manual";
          return (
            <li key={slot.slot} className={save ? "" : "tf-game-empty"}>
              <div className="tf-game-slot-info">
                <strong>{slotTitle(slot)}</strong>
                {save ? (
                  <span className="tf-game-muted">
                    {save.label ?? save.game.title} · {labels.savedAt(new Date(save.savedAt))} ·{" "}
                    {labels.playtime(save.progress.playtime)}
                  </span>
                ) : (
                  <span className="tf-game-muted">{labels.emptySlot}</span>
                )}
              </div>
              <div className="tf-game-slot-actions">
                {writable && (
                  <button
                    onClick={() =>
                      run(props, async () => {
                        await session.saveTo(slot.slot);
                        setMessage(labels.saved);
                      })
                    }
                  >
                    {save ? labels.overwrite : labels.saveHere}
                  </button>
                )}
                {mode === "load" && save && (
                  <button onClick={() => load(save)}>{labels.load}</button>
                )}
                {save && (
                  <button className="tf-game-quiet" onClick={() => download(save)}>
                    {labels.exportSave}
                  </button>
                )}
                {save && slot.kind === "manual" && (
                  <button
                    className="tf-game-quiet"
                    onClick={() => run(props, () => session.saves!.delete(slot.slot))}
                  >
                    {labels.delete}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {mode === "load" && (
        <>
          <button className="tf-game-quiet" onClick={() => file.current?.click()}>
            {labels.importSave}
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (!selected) return;
              try {
                load(parseSave(await selected.text(), session.manifest));
              } catch (error) {
                setMessage(
                  labels.importFailed(error instanceof Error ? error.message : String(error)),
                );
              }
            }}
          />
        </>
      )}
      {message && (
        <p className="tf-game-muted" role="status">
          {message}
        </p>
      )}
    </Screen>
  );
}

export function LevelCompleteCard({ session, snapshot, labels }: GameScreenProps) {
  const level = snapshot.level;
  return (
    <Screen className="tf-game-interstitial">
      <p className="tf-game-eyebrow">{labels.levelComplete}</p>
      <h2>{level?.title ?? level?.id}</h2>
      <button autoFocus onClick={() => session.proceed()}>
        {labels.nextLevel}
      </button>
    </Screen>
  );
}

export function GameOverScreen(props: GameScreenProps) {
  const { session, labels, openMenu } = props;
  return (
    <Screen className="tf-game-over">
      <h2>{labels.gameOver}</h2>
      <nav className="tf-game-actions">
        <button autoFocus onClick={() => run(props, () => session.retryLevel())}>
          {labels.retryLevel}
        </button>
        {session.saves && <button onClick={() => openMenu("load")}>{labels.load}</button>}
        <button onClick={() => session.toTitle()}>{labels.quitToTitle}</button>
      </nav>
    </Screen>
  );
}

export function CreditsRoll({ session, snapshot, labels, menu, openMenu }: GameScreenProps) {
  const credits = session.manifest.credits;
  const fromMenu = menu === "credits";
  return (
    <div className="tf-game-screen tf-game-credits" role="dialog" aria-label={labels.credits}>
      <div className="tf-game-credits-roll">
        <h1>{credits?.title ?? session.manifest.title}</h1>
        {credits?.sections?.map((section, i) => (
          <section key={i}>
            {section.heading && <h3>{section.heading}</h3>}
            {section.lines.map((line, j) => (
              <p key={j}>{line}</p>
            ))}
          </section>
        ))}
      </div>
      <button
        className="tf-game-credits-done"
        autoFocus
        onClick={() => (fromMenu ? openMenu(null) : session.proceed())}
      >
        {fromMenu || snapshot.phase !== "credits" ? labels.close : labels.continue}
      </button>
    </div>
  );
}

export function CompleteScreen({ session, snapshot, labels }: GameScreenProps) {
  return (
    <Screen className="tf-game-interstitial">
      <h2>{labels.theEnd}</h2>
      {snapshot.progress.ending && (
        <p className="tf-game-muted">{labels.ending(snapshot.progress.ending)}</p>
      )}
      <button autoFocus onClick={() => session.toTitle()}>
        {labels.playAgain}
      </button>
    </Screen>
  );
}

export function Hud({ session, snapshot }: GameScreenProps) {
  const shown = Object.entries(session.manifest.state?.variables ?? {}).filter(
    ([, definition]) => definition.hud,
  );
  if (!shown.length) return null;
  return (
    <ul className="tf-game-hud" aria-label="Status">
      {shown.map(([name, definition]) => {
        const value = snapshot.variables[name];
        return (
          <li key={name} title={definition.description}>
            {definition.icon && <span aria-hidden="true">{definition.icon}</span>}
            <span className="tf-game-muted">{definition.label ?? name}</span>
            <strong>{typeof value === "boolean" ? (value ? "✓" : "✗") : String(value)}</strong>
          </li>
        );
      })}
    </ul>
  );
}

export function MenuButton({ labels, openMenu }: GameScreenProps) {
  return (
    <button
      className="tf-game-menu-button"
      onClick={() => openMenu("pause")}
      aria-label={labels.menu}
    >
      ☰
    </button>
  );
}

export const defaultGameUI: GameUIComponents = {
  Title: TitleScreen,
  PauseMenu,
  SaveLoad: SaveLoadPanel,
  LevelComplete: LevelCompleteCard,
  GameOver: GameOverScreen,
  Credits: CreditsRoll,
  Complete: CompleteScreen,
  Hud,
  MenuButton,
};

/**
 * Built-in look. Theme it through CSS variables on the player (`--tf-game-accent`, `-bg`, `-fg`,
 * `-muted`, `-card`, `-border`, `-font`, `-title-font`) or drop it with `unstyled`.
 */
export const gameStyles = /* css */ `
.tf-game {
  --tf-game-accent: #eabd78;
  --tf-game-bg: rgba(10, 12, 18, 0.72);
  --tf-game-fg: #f3eee2;
  --tf-game-muted: #a9b3bc;
  --tf-game-card: rgba(18, 24, 33, 0.96);
  --tf-game-border: #3d4a55;
  --tf-game-font: system-ui, sans-serif;
  --tf-game-title-font: Georgia, serif;
  position: relative;
  overflow: hidden;
  container-type: inline-size;
  color: var(--tf-game-fg);
  font-family: var(--tf-game-font);
  outline: none;
  user-select: none;
}
.tf-game-canvas { position: absolute; inset: 0; }
.tf-game button {
  font: inherit; color: inherit; cursor: pointer;
  background: rgba(255,255,255,0.04); border: 1px solid var(--tf-game-border);
  border-radius: 8px; padding: clamp(5px, 1.2cqw, 9px) clamp(12px, 2.4cqw, 18px);
  transition: border-color .15s, background .15s;
}
.tf-game { font-size: clamp(12px, 1.9cqw, 16px); }
.tf-game button:hover:not(:disabled), .tf-game button:focus-visible {
  border-color: var(--tf-game-accent); background: rgba(255,255,255,0.08); outline: none;
}
.tf-game button:disabled { opacity: .4; cursor: default; }
.tf-game .tf-game-quiet { border-color: transparent; background: transparent; padding: 6px 10px; color: var(--tf-game-muted); }
.tf-game-screen {
  position: absolute; inset: 0; z-index: 10; display: grid; place-items: center;
  background: var(--tf-game-bg); backdrop-filter: blur(3px);
  animation: tf-game-in .25s ease-out;
}
@keyframes tf-game-in { from { opacity: 0; } }
.tf-game-card {
  min-width: min(340px, 90%); max-width: min(560px, 94%); max-height: 88%; overflow: auto;
  padding: clamp(14px, 3cqw, 26px) clamp(16px, 3.2cqw, 28px); border-radius: 14px; border: 1px solid var(--tf-game-border);
  background: var(--tf-game-card); box-shadow: 0 18px 60px rgba(0,0,0,.45);
  display: flex; flex-direction: column; gap: clamp(8px, 1.6cqw, 14px);
}
.tf-game h1, .tf-game h2 { font-family: var(--tf-game-title-font); font-weight: 600; margin: 0; }
.tf-game h2 { font-size: clamp(18px, 3cqw, 26px); }
.tf-game-muted { color: var(--tf-game-muted); font-size: .9em; margin: 0; }
.tf-game-eyebrow { margin: 0; text-transform: uppercase; letter-spacing: .14em; font-size: 12px; color: var(--tf-game-accent); }
.tf-game-actions { display: flex; flex-direction: column; gap: 10px; }
.tf-game-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tf-game-title { background: radial-gradient(ellipse at 50% 35%, rgba(30,40,52,.55), rgba(6,8,12,.92)); }
.tf-game-title-inner {
  display: flex; flex-direction: column; align-items: center; gap: clamp(4px, 1.6cqw, 12px);
  text-align: center; padding: 16px; max-height: 100%; overflow: auto; box-sizing: border-box;
}
.tf-game-title h1 { font-size: clamp(22px, 6.5cqw, 72px); line-height: 1.1; letter-spacing: .02em; text-shadow: 0 4px 30px rgba(0,0,0,.6); }
.tf-game-title .tf-game-actions { margin-top: clamp(4px, 2cqw, 18px); min-width: min(220px, 60cqw); }
.tf-game-title .tf-game-description { font-size: clamp(12px, 1.8cqw, 16px); }
.tf-game-description { max-width: 46ch; color: var(--tf-game-muted); margin: 0; }
.tf-game-slots { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tf-game-slots li {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border: 1px solid var(--tf-game-border); border-radius: 10px;
}
.tf-game-slots li.tf-game-empty { border-style: dashed; }
.tf-game-slot-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tf-game-slot-info .tf-game-muted { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tf-game-slot-actions { display: flex; gap: 4px; flex-shrink: 0; }
.tf-game-slot-actions button { padding: 6px 12px; }
.tf-game-interstitial { text-align: center; }
.tf-game-interstitial .tf-game-card { align-items: center; }
.tf-game-over h2 { color: #f0a59a; text-align: center; }
.tf-game-credits { background: rgba(4,6,9,.94); overflow: hidden; }
.tf-game-credits-roll {
  text-align: center; display: flex; flex-direction: column; gap: 28px; padding: 0 24px;
  animation: tf-game-roll 28s linear forwards; position: absolute; top: 100%; left: 0; right: 0;
}
.tf-game-credits-roll h3 { margin: 0 0 6px; color: var(--tf-game-accent); font-size: 13px; text-transform: uppercase; letter-spacing: .16em; }
.tf-game-credits-roll p { margin: 4px 0; }
@keyframes tf-game-roll { to { transform: translateY(calc(-100% - 100vh)); } }
.tf-game-credits-done { position: absolute; right: 18px; bottom: 18px; z-index: 1; }
.tf-game-hud {
  position: absolute; top: 12px; left: 12px; z-index: 5; display: flex; gap: 8px; margin: 0; padding: 0; list-style: none;
  pointer-events: none;
}
.tf-game-hud li {
  display: flex; gap: 6px; align-items: baseline; padding: 5px 10px; border-radius: 999px;
  background: rgba(10,14,20,.7); border: 1px solid var(--tf-game-border); font-size: 13px;
}
.tf-game .tf-game-menu-button { position: absolute; top: 10px; right: 10px; z-index: 5; padding: 4px 11px; font-size: 18px; background: rgba(10,14,20,.6); }
.tf-game-scene-layer { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.tf-game-scene-layer :is(button, a, input, select, textarea, [data-interactive]) { pointer-events: auto; }
.tf-game-scene-missing {
  position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); width: min(420px, 86%);
  display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; border-radius: 14px; pointer-events: auto;
  border: 1px dashed var(--tf-game-border); background: var(--tf-game-card); text-align: center;
}
.tf-game-status {
  position: absolute; inset: 0; z-index: 20; display: grid; place-content: center; gap: 12px; text-align: center;
  background: rgba(6,8,12,.9);
}
.tf-game-error { color: #f4d1c6; }
.tf-game-error pre { white-space: pre-wrap; text-align: left; max-width: 70ch; font-size: 12px; color: #e9b5a8; }
.tf-game-toast {
  position: absolute; left: 50%; top: 12px; transform: translateX(-50%); z-index: 30; max-width: 80%;
  padding: 6px 12px; border-radius: 8px; background: rgba(60, 30, 24, .92); color: #f6d4c8; font-size: 12px;
}
`;
