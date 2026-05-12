"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HelpMenu } from "@/components/HelpMenu";
import {
  IconChat,
  IconBuilding,
  IconSettings,
  IconLogout,
  IconGrid,
} from "@/components/ui/Icons";

type NavItem = {
  href: string;
  label: string;
  tour: string;
  icon: (p: { className?: string }) => React.ReactElement;
};

const NAV_BASE: NavItem[] = [
  {
    href: "/clientes",
    label: "Clientes",
    tour: "nav-clientes",
    icon: IconBuilding,
  },
  { href: "/chat", label: "Chat IA", tour: "nav-chat", icon: IconChat },
];

const NAV_ADMIN: NavItem[] = [
  {
    href: "/equipo",
    label: "Equipo",
    tour: "nav-equipo",
    icon: IconGrid,
  },
  {
    href: "/configuracion",
    label: "Configuración",
    tour: "nav-config",
    icon: IconSettings,
  },
];

function resolveFlag(flags: Record<string, boolean>, key: string, defaultVal: boolean): boolean {
  return flags[key] !== undefined ? flags[key] : defaultVal;
}

export function Sidebar({
  isAdmin = false,
  isClient = false,
  clientId,
  userEmail,
  featureFlags = {},
}: {
  isAdmin?: boolean;
  isClient?: boolean;
  clientId?: string | null;
  userEmail?: string | null;
  featureFlags?: Record<string, boolean>;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const NAV_CLIENT: NavItem[] = clientId
    ? [{ href: `/clientes/${clientId}`, label: "Mi empresa", tour: "nav-mi-empresa", icon: IconBuilding }]
    : [{ href: "/clientes", label: "Mi empresa", tour: "nav-mi-empresa", icon: IconBuilding }];

  // Aplicar feature_flags: filtrar items según overrides por usuario
  const showChatIA = resolveFlag(featureFlags, "chat_ia", true);
  const showEquipo = resolveFlag(featureFlags, "equipo", isAdmin); // default: solo admins

  const baseFiltered = NAV_BASE.filter((item) => {
    if (item.href === "/chat") return showChatIA;
    return true;
  });
  const adminFiltered = NAV_ADMIN.filter((item) => {
    if (item.href === "/equipo") return showEquipo;
    return true;
  });

  const items = isClient
    ? NAV_CLIENT
    : isAdmin
    ? [...baseFiltered, ...adminFiltered]
    : baseFiltered;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem("sidebar-collapsed");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación inicial desde localStorage (no loop)
    if (v === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const initial = (userEmail ?? "?").trim().charAt(0).toUpperCase();
  const userName = userEmail ? userEmail.split("@")[0] : "Usuario";

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-150 ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      <div className={`px-3 py-4 border-b border-slate-200 ${collapsed ? "flex flex-col items-center" : ""}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="relative w-9 h-9 rounded bg-brand-primary-dark text-white font-bold flex items-center justify-center text-base shadow-sm shrink-0">
            R
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 leading-tight truncate">
                ResponSable
              </div>
              <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate uppercase tracking-widest font-semibold">
                Consultoría sustentabilidad
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`mt-3 inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ${collapsed ? "" : "ml-auto"}`}
          title={collapsed ? "Expandir sidebar (Ctrl+B)" : "Colapsar sidebar (Ctrl+B)"}
          aria-label={collapsed ? "Expandir" : "Colapsar"}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
          </svg>
        </button>
      </div>

      <nav className={`flex-1 ${collapsed ? "px-1" : "px-2"} py-3 space-y-0.5`}>
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              data-tour={item.tour}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-3"} py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-brand-primary-light text-brand-primary-dark font-medium"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] shrink-0 ${
                  active ? "text-brand-primary-hover" : "text-slate-600"
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && active && (
                <span className="ml-auto w-1 h-5 rounded-full bg-brand-primary/70" />
              )}
            </a>
          );
        })}
      </nav>

      <div className={`${collapsed ? "px-1" : "px-2"} py-2 border-t border-slate-200 space-y-0.5`}>
        <HelpMenu iconOnly={collapsed} />
        <button
          onClick={handleLogout}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`group w-full flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-3"} py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors`}
        >
          <IconLogout className="w-[18px] h-[18px] text-slate-600 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>

        {/* Avatar usuario */}
        <div className={`mt-2 pt-2 border-t border-slate-100 flex items-center ${collapsed ? "justify-center" : "gap-2 px-2"}`}>
          <div
            className="w-8 h-8 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-xs shrink-0"
            title={userEmail ?? ""}
          >
            {initial}
          </div>
          {!collapsed && userEmail && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-700 truncate">{userName}</p>
              <p className="text-[10px] text-slate-500 truncate">
                {isAdmin ? "Admin" : isClient ? "Cliente" : "Consultor"}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
