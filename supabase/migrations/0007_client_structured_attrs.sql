-- ─────────────────────────────────────────────────────────────
-- 0007 — Atributos estructurados en clients.
-- Aditiva. 9 columnas nuevas consumidas por los dropdowns de /clientes
-- alimentados desde catalog_items.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS subsector                  text,
  ADD COLUMN IF NOT EXISTS business_segments          text[],
  ADD COLUMN IF NOT EXISTS frameworks                 text[],
  ADD COLUMN IF NOT EXISTS applicable_regulations     text[],
  ADD COLUMN IF NOT EXISTS policies_in_place          text[],
  ADD COLUMN IF NOT EXISTS certifications             text[],
  ADD COLUMN IF NOT EXISTS material_topics            text[],
  ADD COLUMN IF NOT EXISTS maturity_level             text,
  ADD COLUMN IF NOT EXISTS has_double_materiality     boolean,
  ADD COLUMN IF NOT EXISTS has_sustainability_report  boolean,
  ADD COLUMN IF NOT EXISTS has_sustainability_strategy boolean;

COMMENT ON COLUMN public.clients.frameworks IS
  'Valores canónicos de catalog_items.value donde category=frameworks.';
COMMENT ON COLUMN public.clients.material_topics IS
  'Temas materiales priorizados. Valores canónicos de catalog_items.';

-- Index GIN para filtrar por arreglo sin full scan.
CREATE INDEX IF NOT EXISTS idx_clients_frameworks
  ON public.clients USING GIN (frameworks);
CREATE INDEX IF NOT EXISTS idx_clients_material_topics
  ON public.clients USING GIN (material_topics);
CREATE INDEX IF NOT EXISTS idx_clients_certifications
  ON public.clients USING GIN (certifications);
