import type { Metadata } from "next";

export const metadata: Metadata = { title: "Permisos · ResponSable" };

type Row = {
  feature: string;
  admin: boolean | "solo-propio";
  consultor: boolean | "solo-propio";
  cliente: boolean | "solo-propio";
};

const MATRIX: Row[] = [
  // ── Clientes ──────────────────────────────────────
  { feature: "Ver lista de clientes",         admin: true,          consultor: true,        cliente: "solo-propio" },
  { feature: "Crear / editar cliente",        admin: true,          consultor: true,        cliente: false },
  { feature: "Eliminar cliente",              admin: true,          consultor: false,       cliente: false },
  // ── Cuestionario ──────────────────────────────────
  { feature: "Ver cuestionario",              admin: true,          consultor: true,        cliente: "solo-propio" },
  { feature: "Editar cuestionario",           admin: true,          consultor: true,        cliente: false },
  { feature: "Llenado IA del cuestionario",    admin: true,          consultor: true,        cliente: false },
  // ── Materialidad ──────────────────────────────────
  { feature: "Ver matriz de materialidad",    admin: true,          consultor: true,        cliente: "solo-propio" },
  { feature: "Editar temas materialidad",     admin: true,          consultor: true,        cliente: false },
  // ── Servicios / cronograma ─────────────────────────
  { feature: "Ver servicios y cronograma",    admin: true,          consultor: true,        cliente: "solo-propio" },
  { feature: "Crear / editar servicios",      admin: true,          consultor: false,       cliente: false },
  { feature: "Exportar PDF entregable",       admin: true,          consultor: true,        cliente: "solo-propio" },
  // ── Equipo ────────────────────────────────────────
  { feature: "Ver equipo del cliente",        admin: true,          consultor: true,        cliente: "solo-propio" },
  { feature: "Asignar / remover consultores", admin: true,          consultor: false,       cliente: false },
  // ── Chat IA ───────────────────────────────────────
  { feature: "Chat con Aurora/Rebeca/Elena/Valeria", admin: true,  consultor: true,        cliente: false },
  { feature: "Historial de conversaciones",   admin: true,          consultor: true,        cliente: false },
  // ── Configuración ─────────────────────────────────
  { feature: "Ver / editar usuarios",         admin: true,          consultor: false,       cliente: false },
  { feature: "Ver / editar catálogos",        admin: true,          consultor: false,       cliente: false },
  { feature: "Ver / editar plantillas",       admin: true,          consultor: false,       cliente: false },
  { feature: "Ver / editar prompts IA",       admin: true,          consultor: false,       cliente: false },
  { feature: "Ver uso IA",                    admin: true,          consultor: false,       cliente: false },
  { feature: "Preferencias generales",        admin: true,          consultor: false,       cliente: false },
];

function Cell({ value }: { value: boolean | "solo-propio" }) {
  if (value === true)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-50">
        <svg className="w-3.5 h-3.5 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  if (value === "solo-propio")
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-sm">
        Solo propio
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-6 h-6">
      <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  );
}

export default function PermisosPage() {
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Matriz de permisos</h1>
        <p className="text-sm text-slate-600 mt-1">
          Qué puede hacer cada tipo de usuario. Los permisos del rol <strong>Cliente</strong> aplican únicamente sobre los datos de su propia empresa.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded shadow-sm overflow-x-auto">
        <table className="min-w-full w-max text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-400 font-bold w-64">
                Acción
              </th>
              <th className="px-4 py-3 text-center text-[10px] uppercase tracking-widest font-bold text-indigo-700 bg-indigo-50/40">
                Admin
              </th>
              <th className="px-4 py-3 text-center text-[10px] uppercase tracking-widest font-bold text-slate-600 bg-slate-50">
                Consultor
              </th>
              <th className="px-4 py-3 text-center text-[10px] uppercase tracking-widest font-bold text-teal-700 bg-teal-50/40"
                  title="Solo aplica sobre los datos de su propia empresa">
                Cliente
                <span className="block text-[9px] font-normal normal-case tracking-normal text-teal-600/70">solo propio</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MATRIX.map((row) => (
              <tr key={row.feature} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-700">{row.feature}</td>
                <td className="px-4 py-2.5 text-center bg-indigo-50/10">
                  <Cell value={row.admin} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Cell value={row.consultor} />
                </td>
                <td className="px-4 py-2.5 text-center bg-teal-50/10">
                  <Cell value={row.cliente} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        La aplicación de permisos ocurre en dos capas: middleware (rutas bloqueadas por rol) y base de datos (RLS por fila). Un cambio de rol aplica al próximo login del usuario.
      </p>
    </div>
  );
}
