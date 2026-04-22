-- ─────────────────────────────────────────────────────────────
-- 0008 — Prompts editables con versionado (hardcoded + override DB).
--
-- Modelo: el código tiene DEFAULT_PROMPTS como fuente de verdad inicial.
-- La tabla `prompts` solo existe cuando un admin EDITA un prompt; su
-- presencia en DB significa "override activo". DELETE de una fila
-- devuelve al default del código.
--
-- Cada UPDATE dispara auto-snapshot en prompt_versions. Retention:
-- 100 versiones sin label por key + labeled (pin) infinitas.
--
-- Aditiva.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prompts (
  key         text PRIMARY KEY,
  content     text NOT NULL,
  description text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompts_key_format CHECK (key ~ '^(system|role)\.[a-z_]+$')
);

COMMENT ON TABLE public.prompts IS
  'Overrides de prompts IA. Si no hay fila para una key, usa DEFAULT_PROMPTS del código.';

ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
-- Solo service role (admin client) lee/escribe.

CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key     text NOT NULL,
  content        text NOT NULL,
  version_number integer NOT NULL,
  label          text,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prompt_key, version_number)
);

COMMENT ON TABLE public.prompt_versions IS
  'Historial de versiones. Auto-populado por trigger antes de cada UPDATE en prompts.
   Versiones con label se conservan indefinidamente; sin label se mantienen las últimas 100.';

CREATE INDEX IF NOT EXISTS idx_prompt_versions_key_time
  ON public.prompt_versions (prompt_key, created_at DESC);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_prompts_updated_at ON public.prompts;
CREATE TRIGGER trg_prompts_updated_at
  BEFORE UPDATE ON public.prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Función: snapshot antes de update ────────────────────────
CREATE OR REPLACE FUNCTION public.snapshot_prompt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_version integer;
BEGIN
  -- Solo snapshot si el content cambió
  IF OLD.content IS NOT DISTINCT FROM NEW.content THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM public.prompt_versions
  WHERE prompt_key = OLD.key;

  INSERT INTO public.prompt_versions (prompt_key, content, version_number, created_by)
  VALUES (OLD.key, OLD.content, next_version, OLD.updated_by);

  -- Retention: mantener últimas 100 sin label + TODAS las labeled.
  DELETE FROM public.prompt_versions
  WHERE prompt_key = OLD.key
    AND label IS NULL
    AND id NOT IN (
      SELECT id FROM public.prompt_versions
      WHERE prompt_key = OLD.key AND label IS NULL
      ORDER BY version_number DESC
      LIMIT 100
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompts_snapshot ON public.prompts;
CREATE TRIGGER trg_prompts_snapshot
  BEFORE UPDATE ON public.prompts
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_prompt();

-- Sin seeds: los prompts viven en código hasta que un admin los edite.
