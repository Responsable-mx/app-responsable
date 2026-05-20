-- Agrega campos sector_iros y sector_iros_status a dm_referentes
-- Sprint B.2: IROs base del sector — generados por IA a partir de referentes habilitados

ALTER TABLE dm_referentes
  ADD COLUMN IF NOT EXISTS sector_iros       jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sector_iros_status text         NOT NULL DEFAULT 'idle'
    CHECK (sector_iros_status IN ('idle', 'generating', 'done', 'failed'));
