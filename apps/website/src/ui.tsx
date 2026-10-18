import type { ReactNode } from "react";

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    story: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="m10 8 6 4-6 4Z" />
      </>
    ),
    ink: (
      <>
        <path d="M5 4h14v13H9l-4 4Z" />
        <path d="M8 8h8M8 12h5" />
      </>
    ),
    spine: (
      <>
        <circle cx="12" cy="5" r="2" />
        <path d="m5 10 7 2 7-2M12 7v9l-5 5m5-5 5 5" />
      </>
    ),
    assets: (
      <>
        <path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8Z" />,
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    code: (
      <>
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.assets}
    </svg>
  );
}
