"use client";

import { useState } from "react";

type Candidate = { url: string; title: string; year?: number | string | null };

export function ReportIaButton({
  clientId,
  kind,
  currentUrl,
  onUrlChange,
}: {
  clientId: string | undefined;
  kind: "sustainability_report" | "financial_report";
  currentUrl: string;
  onUrlChange: (v: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!clientId) {
    return (
      <p className="text-[10px] text-slate-400 italic mt-1">
        Guarda el cliente para activar &quot;Buscar con IA&quot;.
      </p>
    );
  }

  async function research() {
    setSearching(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/research-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setCandidates(j.data.candidates as Candidate[]);
      if (j.data.candidates.length === 0) setError("La IA no encontró candidatos públicos.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de búsqueda");
    } finally {
      setSearching(false);
    }
  }

  async function ingest(url: string) {
    setIngesting(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/ingest-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, url }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onUrlChange(url);
      setCandidates(null);
      const status = j.data.parse_status === "ok" ? "guardado y convertido" : "guardado (parse falló)";
      setOk(`✓ ${status}: ${j.data.file_name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al ingerir");
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={research}
          disabled={searching || ingesting}
          className="text-[11px] font-semibold text-brand-primary-dark border border-brand-primary/40 rounded px-2 py-1 hover:bg-brand-primary/5 disabled:opacity-50"
          title="La IA busca el informe en internet"
        >
          {searching ? "Buscando…" : currentUrl ? "Buscar de nuevo" : "Buscar con IA"}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={() => void ingest(currentUrl)}
            disabled={searching || ingesting}
            className="text-[11px] font-semibold text-slate-700 border border-slate-300 rounded px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
            title="Descargar la URL actual y guardar como fuente para IA"
          >
            {ingesting ? "Descargando…" : "Descargar URL actual"}
          </button>
        )}
      </div>
      {error && <p className="text-[10px] text-rose-600 mt-1">{error}</p>}
      {ok && <p className="text-[10px] text-emerald-700 mt-1">{ok}</p>}
      {candidates && candidates.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Candidatos · click para descargar y guardar
          </p>
          {candidates.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void ingest(c.url)}
              disabled={ingesting}
              className="block w-full text-left text-[11px] border border-slate-300 rounded px-2 py-1.5 hover:bg-white hover:border-brand-primary disabled:opacity-50 bg-slate-50"
            >
              <span className="font-semibold text-slate-800 line-clamp-1">{c.title}</span>
              <span className="block text-slate-500 text-[10px] truncate">
                {c.url}
                {c.year ? ` · ${c.year}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
