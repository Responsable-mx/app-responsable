import type { Metadata } from "next";
import { getUsageSummary } from "@/lib/ai/usage";
import { Sparkline } from "@/components/Sparkline";

export const metadata: Metadata = { title: "Uso IA · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("es-MX");
const usdFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 3,
});

export default async function UsoIaPage() {
  const s = await getUsageSummary(30).catch(() => null);

  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4 inline-flex items-center gap-1.5">
        Uso de los 4 roles IA en los últimos 30 días.
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold cursor-help"
          title="Costo estimado es techo (asume Sonnet para todo). Valeria corre Haiku 5× más barato. Cache hits reducen ~90% el costo de input."
          aria-label="Más información sobre el cálculo de costo"
        >
          ⓘ
        </span>
      </p>

      {!s ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          Error al cargar. Revisa logs del servidor.
        </div>
      ) : (
        <>
          {(() => {
            // Bucketear by_day_role en serie diaria total para sparkline.
            // Trend visual >= 1 valor numérico aislado.
            const byDay = new Map<string, { calls: number; cost: number; cache: number; errors: number }>();
            for (const r of s.by_day_role) {
              const k = r.day.slice(0, 10);
              const acc = byDay.get(k) ?? { calls: 0, cost: 0, cache: 0, errors: 0 };
              acc.calls += r.calls;
              acc.cache += r.total_cache_hits;
              acc.errors += r.errors;
              // Estimación simple por día (input + output Sonnet).
              acc.cost += (r.total_input_tokens * 3 + r.total_output_tokens * 15) / 1_000_000;
              byDay.set(k, acc);
            }
            const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            const callsSeries = sortedDays.map(([, v]) => v.calls);
            const costSeries = sortedDays.map(([, v]) => v.cost);
            const cacheSeries = sortedDays.map(([, v]) => v.cache);
            const errorsSeries = sortedDays.map(([, v]) => v.errors);
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Metric
                  label="Llamadas"
                  value={numFmt.format(s.total_calls)}
                  spark={callsSeries}
                  sparkColor="#0f766e"
                />
                <Metric
                  label="Costo estimado"
                  value={usdFmt.format(s.cost_usd_estimate_max)}
                  spark={costSeries}
                  sparkColor="#7c3aed"
                />
                <Metric
                  label="Cache hits"
                  value={
                    s.total_input_tokens > 0
                      ? `${Math.round(
                          (s.total_cache_read_tokens /
                            (s.total_input_tokens + s.total_cache_read_tokens)) *
                            100
                        )}%`
                      : "—"
                  }
                  hint={`${numFmt.format(s.total_cache_read_tokens)} tokens ahorrados`}
                  spark={cacheSeries}
                  sparkColor="#0891b2"
                />
                <Metric
                  label="Errores"
                  value={String(s.total_errors)}
                  tone={s.total_errors > 0 ? "red" : "ok"}
                  hint={`Latencia ~${(s.avg_latency_ms / 1000).toFixed(1)} s`}
                  spark={errorsSeries}
                  sparkColor={s.total_errors > 0 ? "#be123c" : "#94a3b8"}
                />
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Panel title="Top consultores">
              {s.top_users.length === 0 ? (
                <Empty />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Consultor</th>
                      <th className="pb-1.5 text-right">Llamadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.top_users.map((u) => (
                      <tr key={u.user_email}>
                        <td className="py-1.5 font-mono text-slate-700">{u.user_email}</td>
                        <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{u.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel title="Top clientes">
              {s.top_clients.length === 0 ? (
                <Empty />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Cliente</th>
                      <th className="pb-1.5 text-right">Llamadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.top_clients.map((c) => (
                      <tr key={c.client_id}>
                        <td className="py-1.5 text-slate-700">
                          {c.client_name ?? (
                            <span className="font-mono text-slate-600">{c.client_id.slice(0, 8)}…</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{c.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <Panel title="Llamadas diarias por rol">
            {s.by_day_role.length === 0 ? (
              <Empty text="Aún sin actividad. Los datos aparecerán cuando los roles reciban mensajes." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-600 text-left uppercase tracking-wide text-[10px]">
                    <tr>
                      <th className="py-2 pr-3">Día</th>
                      <th className="py-2 pr-3">Rol</th>
                      <th className="py-2 pr-3 text-right">Llamadas</th>
                      <th className="py-2 pr-3 text-right">Input</th>
                      <th className="py-2 pr-3 text-right">Output</th>
                      <th className="py-2 pr-3 text-right">Cache</th>
                      <th className="py-2 pr-3 text-right">Latencia (s)</th>
                      <th className="py-2 pr-3 text-right">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.by_day_role.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-slate-600">
                          {new Date(r.day).toLocaleDateString("es-MX", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-1.5 pr-3 font-medium text-slate-800">
                          {r.role.charAt(0).toUpperCase() + r.role.slice(1)}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {numFmt.format(r.calls)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {numFmt.format(r.total_input_tokens)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {numFmt.format(r.total_output_tokens)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-brand-primary-hover">
                          {numFmt.format(r.total_cache_hits)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {(r.avg_latency_ms / 1000).toFixed(1)} s
                        </td>
                        <td
                          className={`py-1.5 pr-3 text-right ${
                            r.errors > 0 ? "text-red-700" : "text-slate-600"
                          }`}
                        >
                          {r.errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  hintTone,
  spark,
  sparkColor,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "red";
  hintTone?: "ok" | "warn" | "red";
  spark?: number[];
  sparkColor?: string;
}) {
  const valueClass =
    tone === "red"
      ? "text-red-700"
      : tone === "ok"
      ? "text-green-700"
      : "text-slate-900";
  const hintClass =
    hintTone === "ok"
      ? "text-emerald-700"
      : hintTone === "warn"
      ? "text-amber-600"
      : hintTone === "red"
      ? "text-red-700"
      : "text-slate-600";
  return (
    <div className="bg-white border border-slate-200 rounded px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-600">
          {label}
        </div>
        {spark && spark.length > 0 && (
          <Sparkline values={spark} color={sparkColor} width={64} height={20} />
        )}
      </div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className={`text-[10px] mt-0.5 ${hintClass}`}>{hint}</div>}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded p-4">
      <div className="text-xs uppercase tracking-wide text-slate-600 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text?: string } = {}) {
  return (
    <div className="text-sm text-slate-600 text-center py-6">
      {text ?? "Sin datos en el período."}
    </div>
  );
}
