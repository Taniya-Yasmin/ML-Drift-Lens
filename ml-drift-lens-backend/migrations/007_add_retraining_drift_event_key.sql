BEGIN;

ALTER TABLE public.retraining_jobs
  ADD COLUMN IF NOT EXISTS drift_score_id integer REFERENCES public.drift_scores(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retraining_jobs_drift_score_id
  ON public.retraining_jobs (drift_score_id)
  WHERE drift_score_id IS NOT NULL;

COMMIT;