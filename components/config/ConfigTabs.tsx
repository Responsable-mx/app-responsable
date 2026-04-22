"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Orden alfabético por label (es-MX).
import {
  IconBookOpen,
  IconSliders,
  IconBrain,
  IconUsers,
} from "@/components/ui/Icons";

const TABS = [
  {
    href: "/configuracion/catalogos",
    label: "Catálogos",
    Icon: IconBookOpen,
  },
  {
    href: "/configuracion/preferencias",
    label: "Preferencias",
    Icon: IconSliders,
  },
  { href: "/configuracion/prompts", label: "Prompts IA", Icon: IconBrain },
  { href: "/configuracion/usuarios", label: "Usuarios", Icon: IconUsers },
];

export function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 -mb-px">
      {TABS.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(t.href + "/");
        const Icon = t.Icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
              active
                ? "border-teal-700 text-teal-800 font-medium"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icon className="w-4 h-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
