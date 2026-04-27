import { getUsageSummary } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("es-MX");
const usdFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
});

export default async function UsoIaPage() {
  const s = await getUsageSummary(30).catch(() => null);

  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Uso de los 4 roles IA en los últimos 30 días. Costo estimado es un
        techo — asume Sonnet para todo (Valeria en realidad corre Haiku que es
        5× más barato). Cache hits reducen ~90% el costo de input.
      </p>

      {!s ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          Error al cargar. Revisa logs del servidor.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Metric label="Llamadas" value={numFmt.format(s.total_calls)} />
            <Metric
              label="Costo estimado (USD)"
              value={usdFmt.format(s.cost_usd_estimate_max)}
            />
            <Metric
              label="Cache hits"
              value={numFmt.format(s.total_cache_read_tokens) + " tokens"}
              hint={
                s.total_input_tokens > 0
                  ? `${Math.round(
                      (s.total_cache_read_tokens /
                        (s.total_input_tokens + s.total_cache_read_tokens)) *
                        100
                    )}% del input`
                  : undefined
              }
            />
            <Metric
              label="Errores"
              value={String(s.total_errors)}
              tone={s.total_errors > 0 ? "red" : "ok"}
              hint={`Latencia ~${s.avg_latency_ms}ms`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Panel title="Top consultores">
              {s.top_users.length === 0 ? (
                <Empty />
              ) : (
                <ul className="text-sm divide-y divide-stone-100">
                  {s.top_users.map((u) => (
                    <li
                      key={u.user_email}
                      className="py-2 flex items-center justify-between"
                    >
                      <span className="font-mono text-xs text-slate-700">
                        {u.user_email}
                      </span>
                      <span className="text-slate-900 font-medium">
                        {u.calls}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Top clientes">
              {s.top_clients.length === 0 ? (
                <Empty />
              ) : (
                <ul className="text-sm divide-y divide-stone-100">
                  {s.top_clients.map((c) => (
                    <li
                      key={c.client_id}
                      className="py-2 flex items-center justify-between"
                    >
                      <span className="text-slate-700">
                        {c.client_name ?? (
                          <span className="font-mono text-xs text-slate-600">
                            {c.client_id.slice(0, 8)}…
                          </span>
                        )}
                      </span>
                      <span className="text-slate-900 font-medium">
                        {c.calls}
                      </span>
                    </li>
                  ))}
                </ul>
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
                      <th className="py-2 pr-3 text-right">Latencia</th>
                      <th className="py-2 pr-3 text-right">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {s.by_day_role.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-slate-600">
                          {new Date(r.day).toLocaleDateString("es-MX", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-1.5 pr-3 font-medium text-slate-800">
                          {r.role}
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
                        <td className="py-1.5 pr-3 text-right text-teal-700">
                          {numFmt.format(r.total_cache_hits)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {r.avg_latency_ms}ms
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
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "red";
}) {
  const valueClass =
    tone === "red"
      ? "text-red-700"
      : tone === "ok"
      ? "text-green-700"
      : "text-slate-900";
  return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-600 mt-0.5">{hint}</div>}
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
    <div className="bg-white border border-stone-200 rounded-xl p-4">
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
