"use client";

import { useState } from "react";
import type {
  CatalogCategory,
  CATALOG_CATEGORIES as CAT_TYPE,
} from "@/lib/catalogs/seeds";
import { CatalogPanel } from "./catalogs/CatalogPanel";

type Category = (typeof CAT_TYPE)[number];

// Agrupa los 12 catálogos en 4 buckets temáticos. Antes los 12 estaban en wrap
// horizontal (caos visual + cognitive load). Ahora user ve grupo principal y
// el catálogo específico debajo. Patrón Salesforce/Workday admin.
const GROUPS: Array<{
  key: string;
  label: string;
  members: CatalogCategory[];
}> = [
  {
    key: "identidad",
    label: "Identidad del cliente",
    members: ["sectors", "business_segments", "client_sizes", "countries"],
  },
  {
    key: "cumplimiento",
    label: "Cumplimiento y reporting",
    members: ["frameworks", "applicable_regulations", "certifications"],
  },
  {
    key: "operacion",
    label: "Operación interna",
    members: ["services", "revenue_models", "maturity_levels", "seniority_levels"],
  },
  {
    key: "materialidad",
    label: "Materialidad y políticas",
    members: ["material_topics", "policies"],
  },
];

export function CatalogsManager({ categories }: { categories: Category[] }) {
  const [active, setActive] = useState<CatalogCategory>(GROUPS[0].members[0]);

  const groupCats = (g: (typeof GROUPS)[number]) =>
    g.members
      .map((m) => categories.find((c) => c.key === m))
      .filter((c): c is Category => Boolean(c));

  const current = categories.find((c) => c.key === active) ?? categories[0];

  return (
    <div className="flex gap-0">
      {/* Panel izquierdo: grupos + catálogos en lista vertical */}
      <aside className="w-44 shrink-0 border-r border-slate-200 bg-slate-50 py-3">
        {GROUPS.map((g) => {
          const cats = groupCats(g);
          return (
            <div key={g.key} className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 mb-1">
                {g.label}
              </p>
              {cats.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setActive(c.key)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    active === c.key
                      ? "bg-brand-primary-light text-brand-primary-dark font-medium border-r-2 border-brand-primary"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          );
        })}
      </aside>

      {/* Panel derecho: catálogo activo */}
      <div className="flex-1 px-6 py-4">
        {current && <CatalogPanel category={current} />}
      </div>
    </div>
  );
}
