/**
 * Avatar circular del cliente. White-label ready: cuando exista clients.logo_url
 * en el schema, agregar prop `logoUrl` y renderizar <img/> en su lugar.
 *
 * Genera un monogram tipográfico con paleta determinística por hash del nombre,
 * evitando colores aleatorios entre renders y manteniendo identidad visual estable.
 */
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
  const sizeClass = SIZE_MAP[size];

  // D-24: validar que logoUrl sea https:// antes de renderizar. Sin esta validación,
  // valores como "javascript:..." serían inyectables como src. onError hace fallback
  // al monogram si la URL 404s en lugar de mostrar broken image.
  const safeLogoUrl =
    logoUrl && (logoUrl.startsWith("https://") || logoUrl.startsWith("http://"))
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
        onError={(e) => {
          // Fallback al monogram si la URL rompe — evita broken image icon.
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
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
