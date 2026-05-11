"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { Client } from "@/lib/clients";
import { ClientAvatar } from "@/components/ClientAvatar";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { useToast } from "@/components/ui/Toast";
import { type SavedView, loadSavedViews, persistSavedViews } from "@/lib/clients/saved-views";
import { exportClientsCsv } from "@/lib/clients/export";
import { parseDomain } from "@/lib/clients/url-utils";

type Row = Pick<
  Client,
  | "id"
  | "name"
  | "sector"
  | "countries"
  | "size"
  | "updated_at"
  | "frameworks"
  | "certifications"
  | "logo_url"
  | "website_url"
>;

type ViewMode = "cards" | "table";

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ data: Row[] }>);

export function ClientsList() {
  const router = useRouter();
  const { push: pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  // D-05: debounce 300ms antes de disparar fetch server-side.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const swrKey = debouncedQ
    ? `/api/clients?q=${encodeURIComponent(debouncedQ)}&limit=200`
    : "/api/clients?limit=500";
  const { data: swrData, isLoading, error: swrError } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const clients = useMemo(() => swrData?.data ?? [], [swrData]);

  // Hidratar vistas guardadas en mount + restaurar última vista activa.
  useEffect(() => {
    const views = loadSavedViews();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedViews(views);
    // Sync URL con vistas: ?view=<id> aplica al cargar, ?q=&sector=&view=table aplican filtros.
    const params = new URLSearchParams(window.location.search);
    const viewId = params.get("view");
    const q = params.get("q") ?? "";
    const sec = params.get("sector") ?? "";
    const v = (params.get("layout") as ViewMode | null) ?? "cards";
    if (viewId) {
      const found = views.find((x) => x.id === viewId);
      if (found) {
        setQuery(found.query);
        setSectorFilter(found.sectorFilter);
        setView(found.view);
        setActiveViewId(found.id);
        return;
      }
    }
    if (q) setQuery(q);
    if (sec) setSectorFilter(sec);
    if (v === "cards" || v === "table") setView(v);
  }, []);

  // Sync URL al cambiar filtros — permite compartir link con filtros aplicados.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (activeViewId) params.set("view", activeViewId);
    else {
      if (query) params.set("q", query);
      if (sectorFilter) params.set("sector", sectorFilter);
      if (view !== "cards") params.set("layout", view);
    }
    const next = params.toString();
    const current = window.location.search.slice(1);
    if (next !== current) {
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
    }
  }, [activeViewId, query, sectorFilter, view]);

  function applyView(v: SavedView) {
    setQuery(v.query);
    setSectorFilter(v.sectorFilter);
    setView(v.view);
    setActiveViewId(v.id);
  }

  function clearView() {
    setQuery("");
    setSectorFilter("");
    setActiveViewId(null);
  }

  function saveCurrentView() {
    const name = newViewName.trim();
    if (!name) return;
    const v: SavedView = {
      id: `v-${Date.now().toString(36)}`,
      name,
      query,
      sectorFilter,
      view,
    };
    const next = [...savedViews, v];
    setSavedViews(next);
    persistSavedViews(next);
    setActiveViewId(v.id);
    setNewViewName("");
    setShowSaveDialog(false);
  }

  function deleteView(id: string) {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    persistSavedViews(next);
    if (activeViewId === id) clearView();
  }

  // Si el usuario edita filtros mientras está activa una vista guardada,
  // marcar como "modificada" (perder el activeViewId).
  useEffect(() => {
    if (!activeViewId) return;
    const v = savedViews.find((x) => x.id === activeViewId);
    if (!v) return;
    if (v.query !== query || v.sectorFilter !== sectorFilter || v.view !== view) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived state: limpia activeViewId cuando filtros divergen de la vista guardada
      setActiveViewId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sectorFilter, view]);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients) if (c.sector) s.add(c.sector);
    return Array.from(s).sort();
  }, [clients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (sectorFilter && c.sector !== sectorFilter) return false;
      if (!q) return true;
      const hay =
        c.name.toLowerCase().includes(q) ||
        (c.sector ?? "").toLowerCase().includes(q) ||
        (c.countries ?? []).some((p) => p.toLowerCase().includes(q)) ||
        (c.frameworks ?? []).some((f) => f.toLowerCase().includes(q)) ||
        (c.certifications ?? []).some((c2) => c2.toLowerCase().includes(q));
      return hay;
    });
  }, [clients, query, sectorFilter]);

  const hasFilters = !!(query || sectorFilter);
  const canSaveView = hasFilters && !activeViewId;

  return (
    <div>
      {/* Saved views chips. Solo visible si hay vistas o filtros activos. */}
      {(savedViews.length > 0 || hasFilters) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1">
            Vistas:
          </span>
          {savedViews.map((v) => (
            <span key={v.id} className="inline-flex items-center group">
              <button
                onClick={() => applyView(v)}
                className={`text-xs font-medium rounded-l border px-2.5 py-1 transition-colors ${
                  activeViewId === v.id
                    ? "bg-brand-primary-light text-brand-primary-dark border-brand-primary/30"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {v.name}
              </button>
              <button
                onClick={() => deleteView(v.id)}
                title={`Eliminar vista "${v.name}"`}
                className={`text-xs rounded-r border-l-0 border px-1.5 py-1 transition-colors ${
                  activeViewId === v.id
                    ? "bg-brand-primary-light text-brand-primary-dark border-brand-primary/30 hover:text-rose-600"
                    : "bg-white text-slate-400 border-slate-300 hover:text-rose-600 hover:bg-slate-50"
                }`}
              >
                ×
              </button>
            </span>
          ))}
          {canSaveView && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary-dark hover:underline px-2 py-1"
            >
              + Guardar vista actual
            </button>
          )}
          {hasFilters && (
            <button
              onClick={clearView}
              className="text-xs text-slate-500 hover:text-slate-900 hover:underline px-2 py-1"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Modal guardar vista — usa primitivo Modal para focus trap + ESC */}
      <Modal
        open={showSaveDialog}
        onClose={() => { setShowSaveDialog(false); setNewViewName(""); }}
        title="Guardar vista"
        footer={
          <>
            <button
              onClick={() => { setShowSaveDialog(false); setNewViewName(""); }}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              onClick={saveCurrentView}
              disabled={!newViewName.trim()}
              className="px-3 py-1.5 text-xs font-semibold bg-brand-primary-hover text-white rounded hover:bg-brand-primary-dark disabled:opacity-40"
            >
              Guardar
            </button>
          </>
        }
      >
        <p className="text-xs text-slate-600 mb-3">
          Conserva los filtros actuales para aplicarlos con un click. Solo visible
          en este dispositivo.
        </p>
        <input
          type="text"
          value={newViewName}
          onChange={(e) => setNewViewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveCurrentView()}
          autoFocus
          placeholder="Ej: Mis activos · Cierres este mes"
          className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
        />
      </Modal>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar clientes"
            placeholder="Buscar por nombre, sector, país, marco, certificación…"
            className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        {sectors.length > 1 && (
          <SelectField
            value={sectorFilter}
            onChange={(v) => setSectorFilter(v)}
            options={sectors.map((s) => ({ value: s, label: s }))}
            placeholder="Todos los sectores"
            className="min-w-[160px]"
          />
        )}
        <div className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
          {isLoading ? (
            <span className="text-slate-400">Cargando…</span>
          ) : (
            <>
              {filtered.length !== clients.length
                ? `${filtered.length} de ${clients.length}`
                : `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => { exportClientsCsv(filtered); pushToast("success", `Exportado: ${filtered.length} clientes`); }}
          className="inline-flex items-center gap-1.5 ml-auto px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50"
          title="Descargar lista filtrada como CSV (Excel)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          Exportar
        </button>
        <div className="inline-flex items-center bg-slate-100 rounded p-0.5">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${view === "cards" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            title="Vista cards"
            aria-pressed={view === "cards"}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${view === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            title="Vista tabla"
            aria-pressed={view === "table"}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
          </button>
        </div>
      </div>

      {swrError && clients.length === 0 ? (
        <div className="bg-rose-50 border border-rose-200 rounded p-4 text-sm text-rose-700">
          Error al cargar la lista de clientes. Recarga la página.
        </div>
      ) : isLoading && clients.length === 0 ? (
        <SkeletonTable rows={6} cols={4} />
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-10 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            {clients.length === 0 && !debouncedQ
              ? "Aún no hay clientes registrados."
              : `Sin resultados para "${sectorFilter || debouncedQ}".`}
          </p>
          {clients.length === 0 && !debouncedQ && (
            <Link
              href="/clientes/nuevo"
              className="inline-block mt-3 px-4 py-2 bg-brand-primary-hover text-white text-sm font-medium rounded hover:bg-brand-primary-dark"
            >
              Agregar el primero
            </Link>
          )}
          {(clients.length > 0 || debouncedQ) && hasFilters && (
            <button
              onClick={clearView}
              className="mt-3 text-sm text-brand-primary-dark hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full w-max text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Nombre</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Sector · Tamaño</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Países</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Marcos</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Actualizado</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  // eslint-disable-next-line react-hooks/purity -- timestamp relativo de lista, no requiere reactividad
                  const daysAgo = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86400000);
                  const updatedLabel = daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`;
                  const allTags = [
                    ...(c.frameworks ?? []).map((f) => ({ label: f, cls: "bg-brand-primary-light text-brand-primary-dark" })),
                    ...(c.certifications ?? []).map((f) => ({ label: f, cls: "bg-amber-50 text-amber-700" })),
                  ].slice(0, 3);
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/60 group cursor-pointer"
                      onClick={() => router.push(`/clientes/${c.id}`)}
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-slate-900 group-hover:text-brand-primary-hover transition-colors">
                          {c.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">
                        {c.sector ?? <span className="text-slate-400">—</span>}
                        {c.size && <span className="text-slate-400"> · {c.size}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{c.countries?.join(", ") ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-2.5">
                        {allTags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {allTags.map((t) => (
                              <span key={t.label} className={`text-[10px] rounded-sm px-1.5 py-0.5 font-medium ${t.cls}`}>{t.label}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-slate-500">{updatedLabel}</td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/clientes/${c.id}?tab=chat`}
                          title="Chat IA"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded px-2 py-1 hover:bg-brand-primary/20"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                          Chat
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientCard({ client }: { client: Row }) {
  const updated = new Date(client.updated_at);
  const daysAgo = Math.floor((Date.now() - updated.getTime()) / 86400000);
  const updatedLabel =
    daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`;
  const domain = parseDomain(client.website_url);

  return (
    <div className="group relative bg-white border border-slate-200 rounded shadow-sm hover:border-brand-primary/30 transition-all">
      <Link
        href={`/clientes/${client.id}`}
        className="block p-4"
      >
        <div className="flex items-start gap-3 mb-3">
          <ClientAvatar name={client.name} logoUrl={client.logo_url} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900 leading-tight group-hover:text-brand-primary-hover transition-colors flex items-center gap-1.5">
              <span className="truncate">{client.name}</span>
              {client.name.startsWith("DEMO_") && (
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-200">
                  TEST
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {client.sector ?? <span className="italic text-slate-400">Sin sector</span>}
              {domain && <span className="text-slate-400"> · {domain}</span>}
            </p>
          </div>
        </div>

        {(client.countries?.length || client.frameworks?.length || client.certifications?.length) ? (
          <div className="flex flex-wrap gap-1 mb-3">
            {client.countries?.slice(0, 3).map((p) => (
              <span key={p} className="text-[10px] bg-slate-100 text-slate-600 rounded-sm px-1.5 py-0.5 font-medium">
                {p}
              </span>
            ))}
            {client.frameworks?.slice(0, 2).map((f) => (
              <span key={f} className="text-[10px] bg-brand-primary-light text-brand-primary-dark rounded-sm px-1.5 py-0.5 font-medium">
                {f}
              </span>
            ))}
            {client.certifications?.slice(0, 2).map((c) => (
              <span key={c} className="text-[10px] bg-amber-50 text-amber-700 rounded-sm px-1.5 py-0.5 font-medium">
                {c}
              </span>
            ))}
          </div>
        ) : (
          <div className="mb-3" />
        )}

        <div className="flex items-center justify-end text-[10px] pt-2 border-t border-slate-100">
          <span className="tabular-nums text-slate-400">{updatedLabel}</span>
        </div>
      </Link>

      {/* Acceso rápido a Chat IA — aparece en hover, no interrumpe el link principal */}
      <Link
        href={`/clientes/${client.id}?tab=chat`}
        title="Abrir Chat IA para este cliente"
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded px-2 py-1 hover:bg-brand-primary/20"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        Chat
      </Link>
    </div>
  );
}
