BEGIN;

ALTER TABLE public.retraining_jobs
  DROP CONSTRAINT IF EXISTS retraining_jobs_promoted_check;

COMMIT;