-- Glosario global: términos que usa ResponSable vs cómo los llama el mercado
CREATE TABLE IF NOT EXISTS terminology_synonyms (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  responsable_term TEXT    NOT NULL,
  category     TEXT        NOT NULL DEFAULT 'general',
  synonyms_es  TEXT[]      NOT NULL DEFAULT '{}',
  synonyms_en  TEXT[]      NOT NULL DEFAULT '{}',
  active       BOOLEAN     NOT NULL DEFAULT true,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminology_synonyms_active
  ON terminology_synonyms(active, sort_order);

ALTER TABLE terminology_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ts_authenticated_read" ON terminology_synonyms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ts_service_write" ON terminology_synonyms
  FOR ALL TO service_role USING (true);

-- Seed inicial con términos clave de RSE
INSERT INTO terminology_synonyms (responsable_term, category, synonyms_es, synonyms_en, sort_order) VALUES
  ('Doble Materialidad',         'Metodología', ARRAY['materialidad','evaluación de materialidad','análisis de materialidad','materialidad doble'], ARRAY['double materiality','materiality assessment','materiality analysis'], 10),
  ('RSE',                        'Marco',       ARRAY['responsabilidad social empresarial','responsabilidad corporativa','sostenibilidad corporativa','ESG'], ARRAY['CSR','corporate social responsibility','corporate sustainability','ESG'], 20),
  ('Grupos de Interés',          'Actores',     ARRAY['partes interesadas','públicos de interés','actores clave'], ARRAY['stakeholders','key stakeholders'], 30),
  ('Temas Materiales',           'Metodología', ARRAY['temas relevantes','prioridades de sostenibilidad','asuntos materiales'], ARRAY['material topics','material issues','ESG priorities'], 40),
  ('Impactos',                   'Metodología', ARRAY['efectos','consecuencias','externalidades'], ARRAY['impacts','effects','externalities'], 50),
  ('Informe de Sostenibilidad',  'Reporte',     ARRAY['reporte de sustentabilidad','memoria de sostenibilidad','reporte ESG','reporte de RSE'], ARRAY['sustainability report','ESG report','CSR report','non-financial report'], 60),
  ('Estrategia de Sostenibilidad','Estrategia', ARRAY['agenda de sustentabilidad','plan de sostenibilidad','hoja de ruta ESG'], ARRAY['sustainability strategy','ESG roadmap','sustainability roadmap'], 70),
  ('Gobierno Corporativo',       'Marco',       ARRAY['gobernanza','gobierno empresarial'], ARRAY['corporate governance','governance'], 80),
  ('Cadena de Valor',            'Operación',   ARRAY['cadena de suministro','cadena productiva'], ARRAY['value chain','supply chain'], 90),
  ('Huella de Carbono',          'Ambiental',   ARRAY['emisiones de carbono','emisiones GEI','huella climática'], ARRAY['carbon footprint','GHG emissions','carbon emissions'], 100)
ON CONFLICT DO NOTHING;
