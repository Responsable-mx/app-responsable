"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  IconBookOpen,
  IconSliders,
  IconBrain,
  IconUsers,
  IconGrid,
  IconShield,
  IconClipboard,
  IconLayers,
  IconPlugin,
  IconActivity,
  IconBarChart,
  IconSettings,
  IconCoins,
  IconLanguage,
} from "@/components/ui/Icons";

type TabItem = { href: string; label: string; Icon: React.ComponentType<{ className?: string }> };
type Group = { title: string; items: TabItem[] };

const GROUPS: Group[] = [
  {
    title: "Equipo",
    items: [
      { href: "/configuracion/usuarios",    label: "Usuarios",       Icon: IconUsers },
      { href: "/configuracion/permisos",    label: "Permisos",       Icon: IconShield },
    ],
  },
  {
    title: "Contenido IA",
    items: [
      { href: "/configuracion/catalogos",   label: "Catálogos",      Icon: IconBookOpen },
      { href: "/configuracion/plantillas",  label: "Plantillas",     Icon: IconGrid },
      { href: "/configuracion/prompts",     label: "Prompts IA",     Icon: IconBrain },
      { href: "/configuracion/glosario",   label: "Glosario",       Icon: IconLanguage },
      { href: "/configuracion/iros",        label: "IROs ESRS",      Icon: IconLayers },
      { href: "/configuracion/herramientas",label: "Herramientas",   Icon: IconPlugin },
      { href: "/configuracion/flujos-ia",   label: "Flujos IA",      Icon: IconActivity },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/configuracion/costos",       label: "Costos",         Icon: IconCoins    },
      { href: "/configuracion/monitoreo-ia", label: "Monitoreo IA",   Icon: IconBarChart },
      { href: "/configuracion/auto-update",  label: "Actualizaciones",Icon: IconSliders  },
      { href: "/configuracion/auditoria",    label: "Historial",      Icon: IconClipboard},
      { href: "/configuracion/preferencias", label: "Preferencias",   Icon: IconSettings },
    ],
  },
];

export function ConfigTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0">
      {GROUPS.map((group, gi) => (
        <div key={group.title} className={gi > 0 ? "mt-4" : ""}>
          <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {group.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((t) => {
              const active = pathname === t.href || pathname.startsWith(t.href + "/");
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
          </div>
        </div>
      ))}
    </nav>
  );
}
