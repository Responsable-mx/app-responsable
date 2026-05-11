"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { useToast } from "@/components/ui/Toast";

import type { ServiceOption } from "@/components/documents/doc-types";
import { ServiceMultiSelect } from "@/components/documents/ServiceMultiSelect";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return u.toLowerCase().trim().replace(/\/$/, "");
  }
}

function IconWarn({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

type Candidate = {
  url: string;
  title: string;
  year?: number | string | null;
  kind: "sustainability_report" | "financial_report";
  serviceIds?: string[];
};

export type DiscoverState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; candidates: Candidate[] }
  | { status: "error"; message: string };

export function DiscoverModal({
  clientId,
  existingUrls,
  onClose,
  onIngested,
}: {
  clientId: string;
  /** URLs ya ingestadas (normalizadas) — para marcar candidatos duplicados y no pre-seleccionarlos. */
  existingUrls: Set<string>;
  onClose: () => void;
  onIngested: () => void;
}) {
  const [state, setState] = useState<DiscoverState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [kindOverride, setKindOverride] = useState<Record<number, Candidate["kind"]>>({});
  const [serviceOverride, setServiceOverride] = useState<Record<number, string[]>>({});
  const { data: catalogData } = useSWR<{ data: { id: string; value: string; label: string }[] }>(
    `/api/catalogs?category=services`,
    fetcher
  );
  const serviceOptions: ServiceOption[] = (catalogData?.data ?? []).map((c) => ({ id: c.id, label: c.label }));
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<{ idx: number; ok: boolean; msg?: string }[]>([]);
  const toast = useToast();

  async function handleSearch() {
    setState({ status: "searching" });
    setSelected(new Set());
    setKindOverride({});
    setIngestResults([]);
    try {
      const [susRes, finRes] = await Promise.allSettled([
        fetch(`/api/clients/${clientId}/research-reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "sustainability_report" }),
        }).then((r) => r.json()),
        fetch(`/api/clients/${clientId}/research-reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "financial_report" }),
        }).then((r) => r.json()),
      ]);

      const candidates: Candidate[] = [];
      if (susRes.status === "fulfilled" && susRes.value?.data?.candidates) {
        for (const c of susRes.value.data.candidates as Candidate[]) {
          candidates.push({ ...c, kind: "sustainability_report" });
        }
      }
      if (finRes.status === "fulfilled" && finRes.value?.data?.candidates) {
        for (const c of finRes.value.data.candidates as Candidate[]) {
          candidates.push({ ...c, kind: "financial_report" });
        }
      }

      if (candidates.length === 0) {
        setState({ status: "done", candidates: [] });
      } else {
        setState({ status: "done", candidates });
        setSelected(
          new Set(
            candidates
              .map((c, i) => ({ c, i }))
              .filter(({ c }) => !existingUrls.has(normalizeUrl(c.url)))
              .map(({ i }) => i)
          )
        );
      }
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Error de red" });
    }
  }

  async function handleIngest() {
    if (state.status !== "done") return;
    const toIngest = Array.from(selected);
    setIngesting(true);
    const results: { idx: number; ok: boolean; msg?: string }[] = [];

    for (const idx of toIngest) {
      const c = state.candidates[idx];
      if (!c) continue;
      const kind = kindOverride[idx] ?? c.kind;
      try {
        const res = await fetch(`/api/clients/${clientId}/ingest-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, url: c.url, service_ids: serviceOverride[idx] ?? c.serviceIds ?? [] }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          results.push({ idx, ok: false, msg: j.error ?? `HTTP ${res.status}` });
        } else {
          results.push({ idx, ok: true });
        }
      } catch (e) {
        results.push({ idx, ok: false, msg: e instanceof Error ? e.message : "Error" });
      }
    }

    setIngesting(false);
    setIngestResults(results);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    if (ok > 0) {
      onIngested();
      toast.push("success", `${ok} documento${ok > 1 ? "s" : ""} ingresado${ok > 1 ? "s" : ""}`);
    }
    if (fail === 0 && ok > 0) onClose();
    else if (fail > 0) toast.push("warning", `${fail} fallaron — revisa los errores`);
  }

  const candidates = state.status === "done" ? state.candidates : [];
  const resultMap = Object.fromEntries(ingestResults.map((r) => [r.idx, r]));

  return (
    <Modal open onClose={onClose} title="Buscar documentos con IA" size="xl">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-600">
          La IA busca en la web los documentos públicos del cliente: informes de sustentabilidad,
          financieros, GRI, TCFD y código de ética. Valida y selecciona cuáles ingestar.
        </p>

        {state.status === "idle" && (
          <div className="border border-dashed border-slate-300 rounded p-6 text-center">
            <p className="text-sm text-slate-500 mb-3">
              Presiona buscar para que la IA encuentre documentos públicos del cliente.
            </p>
            <Button variant="primary" size="sm" onClick={() => void handleSearch()}>
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Iniciar búsqueda
            </Button>
          </div>
        )}

        {state.status === "searching" && (
          <div className="border border-slate-200 rounded p-6 text-center bg-slate-50">
            <svg className="w-5 h-5 text-brand-primary mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-xs text-slate-600">
              Buscando informes de sustentabilidad y financieros… puede tardar 30–90 s.
            </p>
          </div>
        )}

        {state.status === "error" && (
          <div className="border border-rose-200 rounded p-4 bg-rose-50 text-xs text-rose-700">
            <p className="font-semibold mb-1">Error en la búsqueda</p>
            <p>{state.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void handleSearch()}>
              Reintentar
            </Button>
          </div>
        )}

        {state.status === "done" && candidates.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded p-6 text-center">
            <p className="text-sm text-slate-500 mb-3">No se encontraron documentos públicos para este cliente.</p>
            <Button variant="secondary" size="sm" onClick={() => void handleSearch()}>
              Buscar de nuevo
            </Button>
          </div>
        )}

        {state.status === "done" && candidates.length > 0 && (() => {
          const dupCount = candidates.filter((c) => existingUrls.has(normalizeUrl(c.url))).length;
          return (
          <>
            {dupCount > 0 && (
              <div className="px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-center gap-2" role="status" aria-live="polite">
                <svg className="w-3.5 h-3.5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  {dupCount === 1
                    ? "1 candidato ya está en este cliente — desmarcado por defecto."
                    : `${dupCount} candidatos ya están en este cliente — desmarcados por defecto.`}
                </span>
              </div>
            )}
            <div className="overflow-x-auto border border-slate-200 rounded bg-white shadow-sm">
              <table className="min-w-full w-max text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === candidates.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(candidates.map((_, i) => i)) : new Set())
                        }
                        className="rounded border-slate-300"
                        aria-label={selected.size === candidates.length ? "Deseleccionar todos" : "Seleccionar todos"}
                      />
                    </th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Título</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Año</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Tipo</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Servicio</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((c, idx) => {
                    const result = resultMap[idx];
                    const isSelected = selected.has(idx);
                    const isDup = existingUrls.has(normalizeUrl(c.url));
                    return (
                      <tr
                        key={idx}
                        className={`transition-colors ${isSelected ? "bg-brand-primary-light/10" : isDup ? "bg-amber-50/40" : "hover:bg-slate-50/70"}`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!!result}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(idx); else next.delete(idx);
                              setSelected(next);
                            }}
                            className="rounded border-slate-300"
                            aria-label={`Seleccionar ${c.title}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 max-w-[260px]">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-primary-dark hover:underline font-semibold leading-snug line-clamp-2"
                          >
                            {c.title}
                          </a>
                          <span className="block text-xs text-slate-600 truncate mt-0.5">{c.url}</span>
                          {isDup && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              <IconWarn className="w-2.5 h-2.5" />
                              Ya existe
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 text-xs">
                          {c.year ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 min-w-[160px]">
                          <SelectField
                            value={kindOverride[idx] ?? c.kind}
                            onChange={(v) =>
                              setKindOverride((p) => ({ ...p, [idx]: v as Candidate["kind"] }))
                            }
                            disabled={!!result}
                            options={[
                              { value: "sustainability_report", label: "Sustentabilidad" },
                              { value: "financial_report", label: "Financiero" },
                            ]}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          {serviceOptions.length > 0 && (
                            <ServiceMultiSelect
                              options={serviceOptions}
                              selected={serviceOverride[idx] ?? []}
                              onChange={(ids) => setServiceOverride((p) => ({ ...p, [idx]: ids }))}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!result && <span className="text-xs text-slate-500">Pendiente</span>}
                          {result?.ok && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Ingresado
                            </span>
                          )}
                          {result && !result.ok && (
                            <span className="text-xs text-rose-700 font-semibold" title={result.msg}>
                              Error
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleSearch()}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Buscar de nuevo
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-700" aria-live="polite">{selected.size} seleccionado{selected.size !== 1 ? "s" : ""}</span>
                <Button
                  variant="primary"
                  size="sm"
                  loading={ingesting}
                  disabled={selected.size === 0}
                  onClick={() => void handleIngest()}
                >
                  Ingestar seleccionados
                </Button>
              </div>
            </div>
          </>
          );
        })()}
      </div>
    </Modal>
  );
}
