"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HelpMenu } from "@/components/HelpMenu";
import {
  IconChat,
  IconBuilding,
  IconSettings,
  IconLogout,
} from "@/components/ui/Icons";

type NavItem = {
  href: string;
  label: string;
  tour: string;
  icon: (p: { className?: string }) => React.ReactElement;
};

const NAV_BASE: NavItem[] = [
  { href: "/chat", label: "Chat IA", tour: "nav-chat", icon: IconChat },
  {
    href: "/clientes",
    label: "Clientes",
    tour: "nav-clientes",
    icon: IconBuilding,
  },
];

const NAV_ADMIN: NavItem[] = [
  {
    href: "/configuracion",
    label: "Configuración",
    tour: "nav-config",
    icon: IconSettings,
  },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = isAdmin ? [...NAV_BASE, ...NAV_ADMIN] : NAV_BASE;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="w-60 bg-white border-r border-stone-200 flex flex-col">
      <div className="px-4 py-5 border-b border-stone-200">
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-white font-bold flex items-center justify-center text-base shadow-sm ring-1 ring-teal-900/10">
            R
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 leading-tight">
              App ResponSable
            </div>
            <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
              Consultoría ESG · IA
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.tour}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-teal-50 text-teal-900 font-medium"
                  : "text-slate-600 hover:bg-stone-50 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] shrink-0 ${
                  active
                    ? "text-teal-700"
                    : "text-slate-400 group-hover:text-slate-600"
                }`}
              />
              <span>{item.label}</span>
              {active && (
                <span className="ml-auto w-1 h-5 rounded-full bg-teal-600/70" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-2 border-t border-stone-200 space-y-0.5">
        <HelpMenu />
        <button
          onClick={handleLogout}
          className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-stone-50 hover:text-slate-900 transition-colors"
        >
          <IconLogout className="w-[18px] h-[18px] text-slate-400 group-hover:text-slate-600" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
