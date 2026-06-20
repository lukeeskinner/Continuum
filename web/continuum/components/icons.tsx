// Lightweight inline icon set (stroke-based, inherits currentColor).
// Avoids pulling in an icon dependency for the dashboard shells.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function IconSpark(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.2 11l2.5 1-2.5 1L12 15.5 10.8 13l-2.5-1 2.5-1L12 8.5Z" />
    </svg>
  );
}

export function IconGraph(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="17" cy="18" r="2.2" />
      <circle cx="7" cy="17" r="2.2" />
      <path d="M8 8l8-1M8.5 16l7-8M8 16h7M7.6 9l8.6 7.4" />
    </svg>
  );
}

export function IconChat(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5.2A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h7M8.5 14h4" />
    </svg>
  );
}

export function IconShield(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconHome(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

export function IconMic(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </svg>
  );
}

export function IconSend(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 12 20 4l-5 16-3.5-6.5L4 12Z" />
    </svg>
  );
}

export function IconBolt(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" />
    </svg>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.5a3 3 0 0 1 0 5.8M17.5 19a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconLink(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 12 6 14a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
    </svg>
  );
}

export function IconArrow(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
