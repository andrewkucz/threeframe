import { createBrowserRouter } from "react-router";
import { notFound, overview, pages, type Page } from "./pages";
import { NotFound, SiteError, SiteLayout, SiteLoading } from "./SiteLayout";

const lazyPage = (page: Page) => ({
  Component: async () => (await page.load()).default,
});

export const router = createBrowserRouter([
  {
    Component: SiteLayout,
    HydrateFallback: SiteLoading,
    ErrorBoundary: SiteError,
    children: [
      { index: true, handle: overview, lazy: lazyPage(overview) },
      ...pages.map((page) => ({ path: page.path, handle: page, lazy: lazyPage(page) })),
      { path: "*", handle: notFound, Component: NotFound },
    ],
  },
]);
