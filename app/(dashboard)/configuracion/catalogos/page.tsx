import type { Metadata } from "next";
import { CATALOG_CATEGORIES } from "@/lib/catalogs/seeds";
import { CatalogsManager } from "@/components/config/CatalogsManager";

export const metadata: Metadata = { title: "Catálogos · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

export default function CatalogosPage() {
  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Los valores que los consultores pueden elegir al llenar el contexto de
        un cliente. Los ítems marcados con 🔒 son del sistema: se pueden
        desactivar o renombrar, pero no eliminar.
      </p>
      <CatalogsManager categories={CATALOG_CATEGORIES} />
    </div>
  );
}
