import type { ReactNode } from "react";
import {
  Link,
  NavLink,
  Outlet,
  ScrollRestoration,
  isRouteErrorResponse,
  useMatches,
  useNavigation,
  useRouteError,
} from "react-router";
import { notFound, pages, type PageHandle } from "./pages";
import { Icon } from "./ui";

function SiteShell({ page, children }: { page?: PageHandle; children: ReactNode }) {
  const matches = useMatches();
  const navigation = useNavigation();
  const current = page ?? (matches.at(-1)?.handle as PageHandle | undefined) ?? notFound;
  return (
    <div className="app-shell">
      <title>{`${current.label} · Threeframe`}</title>
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
        <Link className="brand" to="/">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          threeframe<span className="brand-period">.</span>
        </Link>
        <div className="sidebar-caption">
          Components <span>0.1</span>
        </div>
        <nav aria-label="Component documentation">
          {pages.map((entry) => (
            <NavLink className="nav-item" to={`/${entry.path}`} key={entry.path}>
              <Icon name={entry.icon} />
              <span>{entry.label}</span>
            </NavLink>
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
        <main id="main-content" tabIndex={-1} aria-busy={navigation.state !== "idle"}>
          <div className="page-heading">
            {current.package && <span className="package-chip">@threeframe/{current.package}</span>}
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          {children}
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}

export function SiteLayout() {
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}
export function SiteLoading() {
  return (
    <SiteShell>
      <div className="loading" role="status">
        Loading example…
      </div>
    </SiteShell>
  );
}
export function SiteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);
  return (
    <SiteShell
      page={{ label: "Something went wrong", description: "This page could not be displayed." }}
    >
      <p className="notice" role="alert">
        {message}
      </p>
    </SiteShell>
  );
}
export function NotFound() {
  return (
    <p className="docs-note">
      Choose a component from the sidebar, or go back to <Link to="/">the first example</Link>.
    </p>
  );
}
