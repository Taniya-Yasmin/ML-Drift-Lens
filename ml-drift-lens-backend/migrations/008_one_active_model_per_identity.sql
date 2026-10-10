BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_model_versions_one_active_per_model
  ON public.model_versions (model_id)
  WHERE is_active = true;

COMMIT;