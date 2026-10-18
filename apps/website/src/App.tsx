import { lazy, Suspense, useSyncExternalStore } from "react";
import { PlayerLab } from "./PlayerLab";
import { Icon } from "./ui";

const DialogueLab = lazy(() =>
  import("./ComponentLabs").then((module) => ({ default: module.DialogueLab })),
);
const SpineLab = lazy(() =>
  import("./ComponentLabs").then((module) => ({ default: module.SpineLab })),
);
const AssetsLab = lazy(() =>
  import("./ComponentLabs").then((module) => ({ default: module.AssetsLab })),
);
const pages = [
  {
    id: "narrative-game",
    icon: "story",
    label: "NarrativeGame",
    package: "engine",
    description: "Play a complete Ink story with scenes, characters, and dialogue.",
  },
  {
    id: "dialogue",
    icon: "ink",
    label: "Dialogue",
    package: "ink",
    description: "Render plain text or an Ink story with configurable pacing and layout.",
  },
  {
    id: "spine-sprite",
    icon: "spine",
    label: "SpineSprite",
    package: "spine",
    description: "Load a Spine character and control its animation and appearance.",
  },
  {
    id: "scene-assets",
    icon: "assets",
    label: "Scene & assets",
    package: "core",
    description: "Compose an orthographic scene with cached assets and a backdrop.",
  },
];
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const getPage = () => window.location.hash.slice(1);

export function App() {
  const hash = useSyncExternalStore(subscribe, getPage, () => "");
  const page = pages.find((entry) => entry.id === hash) ?? pages[0];
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#narrative-game">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          threeframe<span className="brand-period">.</span>
        </a>
        <div className="sidebar-caption">
          Components <span>0.1</span>
        </div>
        <nav aria-label="Component documentation">
          {pages.map((entry) => (
            <a
              className={`nav-item${page.id === entry.id ? " active" : ""}`}
              href={`#${entry.id}`}
              key={entry.id}
              aria-current={page.id === entry.id ? "page" : undefined}
            >
              <Icon name={entry.icon} />
              <span>{entry.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>2D games, built with React.</span>
          <span>R3F · Ink · Spine</span>
        </div>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <div>
            Docs <span>/</span> <strong>Components</strong>
          </div>
          <a
            href="https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md"
            target="_blank"
            rel="noreferrer"
          >
            Writing with Ink <span aria-hidden="true">↗</span>
          </a>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <span className="package-chip">@threeframe/{page.package}</span>
            <h1>{page.label}</h1>
            <p>{page.description}</p>
          </div>
          <Suspense
            fallback={
              <div className="loading" role="status">
                Loading example…
              </div>
            }
          >
            {page.id === "narrative-game" ? (
              <PlayerLab />
            ) : page.id === "dialogue" ? (
              <DialogueLab />
            ) : page.id === "spine-sprite" ? (
              <SpineLab />
            ) : (
              <AssetsLab />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
