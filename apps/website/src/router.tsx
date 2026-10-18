import { Navigate, createBrowserRouter } from "react-router";
import { notFound, pages } from "./pages";
import { NotFound, SiteError, SiteLayout, SiteLoading } from "./SiteLayout";

export const router = createBrowserRouter([
  {
    Component: SiteLayout,
    HydrateFallback: SiteLoading,
    ErrorBoundary: SiteError,
    children: [
      { index: true, handle: pages[0], element: <Navigate replace to={`/${pages[0].path}`} /> },
      ...pages.map((page) => ({
        path: page.path,
        handle: page,
        lazy: { Component: async () => (await page.load()).default },
      })),
      { path: "*", handle: notFound, Component: NotFound },
    ],
  },
]);
