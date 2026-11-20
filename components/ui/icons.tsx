// Shared SVG icon set (BossLearn): one visual language — 24x24 viewBox,
// 2px rounded strokes, currentColor — replacing emoji/text glyphs (💡✓✗🏆🎁…)
// across pages. Decorative by default (aria-hidden); pass `label` to make an
// icon meaningful with role="img".
type IconProps = {
  className?: string;
  label?: string;
};

function Base({
  className = "h-5 w-5",
  label,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Base>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  );
}

export function BulbIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.8.6 1.5 1.4 1.5 2.1h4c0-.7.7-1.5 1.5-2.1A6 6 0 0 0 12 3z" />
    </Base>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 2 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.5-2 4-4 4" />
    </Base>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="8" width="18" height="4" />
      <path d="M5 12v9h14v-9M12 8v13M12 8s-1.5-5-4.5-5S5 8 12 8zm0 0s1.5-5 4.5-5S19 8 12 8z" />
    </Base>
  );
}

export function QuestionIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8" />
      <path d="M12 17h.01" />
    </Base>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 4.5v15l13-7.5z" />
    </Base>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4.5v15M16 4.5v15" />
    </Base>
  );
}
