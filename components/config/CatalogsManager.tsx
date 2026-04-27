"use client";

import { useState } from "react";
import type {
  CatalogCategory,
  CATALOG_CATEGORIES as CAT_TYPE,
} from "@/lib/catalogs/seeds";
import { CatalogPanel } from "./catalogs/CatalogPanel";

type Category = (typeof CAT_TYPE)[number];

export function CatalogsManager({ categories }: { categories: Category[] }) {
  const [active, setActive] = useState<CatalogCategory>(categories[0].key);
  const current = categories.find((c) => c.key === active) ?? categories[0];

  return (
    <div>
      <div className="flex flex-wrap gap-1 bg-stone-100 p-1 rounded-lg mb-4">
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              active === c.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <CatalogPanel category={current} />
    </div>
  );
}
