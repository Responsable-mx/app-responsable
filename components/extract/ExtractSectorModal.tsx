"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Source = "url" | "text";

type Result = {
  value: string | null;
  label: string | null;
  confidence: number;
  excerpt: string | null;
  reasoning: string;
  input_preview: string;
  cached: boolean;
};

export function ExtractSectorModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (value: string) => void;
}) {
  const [source, setSource] = useState<Source>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  if (!open) return null;

  function reset() {
    setResult(null);
    setError("");
  }

  async function extract() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const body =
        source === "url" ? { source, url } : { source, text };
      const res = await fetch("/api/extract-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al extraer");
        return;
      }
      setResult(json.data as Result);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (result?.value) {
      onApply(result.value);
      onClose();
      setResult(null);
      setUrl("");
      setText("");
    }
  }

  const confidencePct = result ? Math.round(result.confidence * 100) : 0;
  const confidenceColor =
    confidencePct >= 80
      ? "bg-green-600"
      : confidencePct >= 50
      ? "bg-amber-500"
      : "bg-red-600";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rellenar con IA — Sector"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={!result?.value}>
            ✓ Aplicar al sector
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-600">
          POC: prueba de extracción automática con web o transcripción.
        </p>
        <div className="space-y-4">
          {/* Tabs de fuente */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
            {(["url", "text"] as Source[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSource(s);
                  reset();
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  source === s
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {s === "url" ? "🌐 Desde URL" : "📝 Desde transcripción"}
              </button>
            ))}
          </div>

          {/* Input según tab */}
          {source === "url" ? (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                URL de la página web del cliente
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  reset();
                }}
                placeholder="https://www.heinekenmexico.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                autoFocus
              />
              <p className="text-[10px] text-slate-600 mt-1">
                Se bloquean URLs privadas (localhost, IPs internas).
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Transcripción o texto libre
              </label>
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  reset();
                }}
                rows={8}
                placeholder="Pega aquí la transcripción de una conversación, descripción del cliente, nota de prensa…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-y"
                autoFocus
              />
              <p className="text-[10px] text-slate-600 mt-1">
                {text.length} caracteres · mínimo 30
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={extract}
              loading={loading}
              disabled={
                source === "url" ? !url.trim() : text.trim().length < 30
              }
            >
              {loading ? "Extrayendo…" : "Extraer con IA →"}
            </Button>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3"
            >
              {error}
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="border-t border-slate-100 pt-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 uppercase tracking-wide">
                ✨ Resultado propuesto
                {result.cached && (
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] normal-case">
                    cache hit
                  </span>
                )}
              </div>

              {result.value ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-slate-600">Sector:</span>
                    <span className="text-lg font-bold text-brand-primary-dark">
                      {result.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      ({result.value})
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                      <span>Confianza</span>
                      <span className="font-semibold text-slate-900">
                        {confidencePct}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${confidenceColor} transition-all`}
                        style={{ width: `${confidencePct}%` }}
                      />
                    </div>
                  </div>

                  {result.reasoning && (
                    <div className="text-xs text-slate-700 italic">
                      {result.reasoning}
                    </div>
                  )}

                  {result.excerpt && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">
                        📄 Cita encontrada
                      </div>
                      <blockquote className="border-l-2 border-brand-primary pl-3 text-xs text-slate-700 italic bg-slate-50 rounded-r py-2 pr-2">
                        &ldquo;{result.excerpt}&rdquo;
                      </blockquote>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg p-3">
                  ⚠️ La IA no pudo determinar el sector con confianza suficiente.
                  Intenta con más contexto o captúralo manualmente.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
