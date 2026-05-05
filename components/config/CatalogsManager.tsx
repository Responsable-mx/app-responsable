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
  const [activeGroup, setActiveGroup] = useState<string>(GROUPS[0].key);
  const [active, setActive] = useState<CatalogCategory>(
    GROUPS[0].members[0]
  );

  const groupCats = (g: (typeof GROUPS)[number]) =>
    g.members
      .map((m) => categories.find((c) => c.key === m))
      .filter((c): c is Category => Boolean(c));

  const currentGroup = GROUPS.find((g) => g.key === activeGroup) ?? GROUPS[0];
  const groupCategories = groupCats(currentGroup);
  const current =
    groupCategories.find((c) => c.key === active) ?? groupCategories[0];

  return (
    <div>
      {/* Nivel 1: grupos principales */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg mb-3">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => {
              setActiveGroup(g.key);
              const first = groupCats(g)[0];
              if (first) setActive(first.key);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeGroup === g.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {g.label}
            <span className="ml-1.5 text-[10px] text-slate-400 tabular-nums">
              ({groupCats(g).length})
            </span>
          </button>
        ))}
      </div>

      {/* Nivel 2: catálogos del grupo activo */}
      <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200 pb-3">
        {groupCategories.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              active === c.key
                ? "bg-brand-primary-light text-brand-primary-dark border border-brand-primary/30"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {current && <CatalogPanel category={current} />}
    </div>
  );
}
