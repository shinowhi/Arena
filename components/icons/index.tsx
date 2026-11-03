import type { SVGProps } from "react";

// Shared Arena SVG icon set (U1): 24px grid, stroke style, currentColor.
// Decorative only — every icon is aria-hidden; labels come from adjacent text.
type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Base>
  );
}

export function SwordsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 4l9 9" />
      <path d="M11 15l4-4" />
      <path d="M13 13l2.5 2.5" />
      <circle cx="16.8" cy="16.8" r="1.1" />
      <path d="M20 4l-9 9" />
      <path d="M13 15l-4-4" />
      <path d="M11 13L8.5 15.5" />
      <circle cx="7.2" cy="16.8" r="1.1" />
    </Base>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13 13 0 0 1 0 18" />
      <path d="M12 3a13 13 0 0 0 0 18" />
    </Base>
  );
}

export function GhostIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 20v-9a6 6 0 0 1 12 0v9l-2.4-1.7-2.4 1.7-1.2-.9-1.2.9-2.4-1.7L6 20z" />
      <circle cx="9.6" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M10 21v-6h4v6" />
    </Base>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
      <path d="M16 4h3a1 1 0 0 1 1 1v3" />
      <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M4 12h16" />
    </Base>
  );
}

export function ArenaIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
      <path d="M13 7.5L9.5 13H12l-.8 3.5L14.5 11H12l1-3.5z" />
    </Base>
  );
}

export function FriendsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M16 14.6c2.2.2 3.9 1.6 4.5 4.4" />
    </Base>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Base>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-2 1-3.6 1-3.6S9 10 10 10c0-3 2-7 2-7z" />
      <path d="M12 21a3 3 0 0 0 3-3c0-1.5-1.2-2.6-3-4.5-1.8 1.9-3 3-3 4.5a3 3 0 0 0 3 3z" />
    </Base>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 3h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V3z" />
      <path d="M5 17a2 2 0 0 1 2-2h12" />
      <path d="M9 8h6" />
    </Base>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="13.5" r="6.5" />
      <path d="M12 13.5V10" />
      <path d="M12 13.5l2.5 2" />
      <path d="M9.5 3h5" />
      <path d="M12 3v4" />
    </Base>
  );
}

export function CardsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="7" y="3" width="12" height="14" rx="2" />
      <path d="M7 8H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" />
      <path d="M11 8h4" />
    </Base>
  );
}

export function MapIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </Base>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </Base>
  );
}

export function ReportIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M10 14l2 2 4-4" />
    </Base>
  );
}
