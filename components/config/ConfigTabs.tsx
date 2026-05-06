"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  IconBookOpen,
  IconSliders,
  IconBrain,
  IconUsers,
  IconTarget,
  IconGrid,
  IconShield,
} from "@/components/ui/Icons";

const TABS = [
  { href: "/configuracion/usuarios", label: "Usuarios", Icon: IconUsers },
  { href: "/configuracion/permisos", label: "Permisos", Icon: IconShield },
  { href: "/configuracion/catalogos", label: "Catálogos", Icon: IconBookOpen },
  { href: "/configuracion/plantillas", label: "Plantillas", Icon: IconGrid },
  { href: "/configuracion/prompts", label: "Prompts IA", Icon: IconBrain },
  { href: "/configuracion/uso-ia", label: "Uso IA", Icon: IconTarget },
  { href: "/configuracion/preferencias", label: "Preferencias", Icon: IconSliders },
];

export function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {TABS.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(t.href + "/");
        const Icon = t.Icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              active
                ? "bg-brand-primary-light text-brand-primary-dark font-medium"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-brand-primary-hover" : "text-slate-500"}`} />
            <span className="truncate">{t.label}</span>
            {active && <span className="ml-auto w-1 h-5 rounded-full bg-brand-primary/70" />}
          </Link>
        );
      })}
    </nav>
  );
}
