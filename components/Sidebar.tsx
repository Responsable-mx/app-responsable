"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/chat", label: "Chat IA", icon: "💬" },
  { href: "/clientes", label: "Clientes", icon: "🏢" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="w-56 bg-white border-r border-stone-200 flex flex-col">
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-700 text-white font-bold flex items-center justify-center text-sm">
            R
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 leading-tight">
              App ResponSable
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Consultoría ESG · IA
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-teal-50 text-teal-800 font-medium"
                  : "text-slate-600 hover:bg-stone-50"
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-stone-200">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-stone-50"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
