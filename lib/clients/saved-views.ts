export type SavedView = {
  id: string;
  name: string;
  query: string;
  sectorFilter: string;
  view: "cards" | "table";
};

export const SAVED_VIEWS_KEY = "rs.clientes.savedViews.v1";

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedViews(views: SavedView[]) {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Quota excedida o storage bloqueado — silent fail OK.
  }
}
