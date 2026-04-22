"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/configuracion/catalogos", label: "Catálogos", icon: "📚" },
  { href: "/configuracion/usuarios", label: "Usuarios", icon: "👥" },
  { href: "/configuracion/prompts", label: "Prompts IA", icon: "🧠" },
  { href: "/configuracion/preferencias", label: "Preferencias", icon: "🎛️" },
];

export function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 -mb-px">
      {TABS.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${
              active
                ? "border-teal-700 text-teal-800 font-medium"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
