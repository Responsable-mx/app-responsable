import { ConfigTabs } from "@/components/config/ConfigTabs";
import { ConfigSWRProvider } from "@/components/config/ConfigSWRProvider";

export default function ConfigLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigSWRProvider>
      <div className="flex flex-col h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-8 pt-6 pb-0">
          <div className="max-w-6xl mx-auto">
            <div className="text-[10px] text-slate-600 uppercase tracking-wide">
              Admin
            </div>
            <h1 className="text-lg font-bold text-slate-900 mt-0.5 mb-3">
              Configuración
            </h1>
            <ConfigTabs />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </ConfigSWRProvider>
  );
}
