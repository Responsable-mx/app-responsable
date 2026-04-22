import { CATALOG_CATEGORIES } from "@/lib/catalogs/seeds";
import { CatalogsManager } from "@/components/config/CatalogsManager";

export const dynamic = "force-dynamic";

export default function CatalogosPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900">Catálogos</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        Los valores que los consultores pueden elegir al llenar el contexto de
        un cliente. Los ítems marcados con 🔒 son del sistema: se pueden
        desactivar o renombrar, pero no eliminar.
      </p>
      <CatalogsManager categories={CATALOG_CATEGORIES} />
    </div>
  );
}
