"use client";

import { useState } from "react";

type Props = {
  name: string;
  size?: "sm" | "md" | "lg";
  logoUrl?: string | null;
};

const PALETTE = [
  "bg-slate-700",
  "bg-brand-primary-dark",
  "bg-indigo-800",
  "bg-emerald-800",
  "bg-amber-700",
  "bg-rose-800",
];

const SIZE_MAP = {
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  const words = name
    .replace(/S\.A\.|S\. de R\.L\.|de C\.V\.|S\.C\./gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function ClientAvatar({ name, size = "md", logoUrl = null }: Props) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = SIZE_MAP[size];

  const safeLogoUrl =
    !imgError && logoUrl && (logoUrl.startsWith("https://") || logoUrl.startsWith("http://"))
      ? logoUrl
      : null;

  if (safeLogoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logos son URLs externas variables, no candidatas a next/image
      <img
        src={safeLogoUrl}
        alt={`${name} logo`}
        width={size === "sm" ? 28 : size === "lg" ? 48 : 36}
        height={size === "sm" ? 28 : size === "lg" ? 48 : 36}
        className={`${sizeClass} rounded shrink-0 object-cover bg-white border border-slate-200`}
        onError={() => setImgError(true)}
      />
    );
  }

  const initials = getInitials(name);
  const color = PALETTE[hashName(name) % PALETTE.length];

  return (
    <div
      aria-hidden
      title={name}
      className={`${sizeClass} ${color} rounded shrink-0 text-white font-bold flex items-center justify-center tracking-tight`}
    >
      {initials}
    </div>
  );
}
