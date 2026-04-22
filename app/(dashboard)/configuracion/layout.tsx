import Link from "next/link";

const NAV = [
  { href: "/configuracion/catalogos", label: "Catálogos", icon: "📚" },
  { href: "/configuracion/usuarios", label: "Usuarios", icon: "👥" },
];

export default function ConfigLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-stone-50">
      <aside className="w-52 bg-white border-r border-stone-200 flex flex-col">
        <div className="p-4 border-b border-stone-200">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">
            Admin
          </div>
          <h2 className="text-sm font-bold text-slate-900 mt-1">
            Configuración
          </h2>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-stone-50"
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-stone-200">
          <Link
            href="/chat"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← Volver al chat
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
