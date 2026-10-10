BEGIN;

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS inference_latency_ms double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.predictions'::regclass
      AND conname = 'predictions_inference_latency_nonnegative'
  ) THEN
    ALTER TABLE public.predictions
      ADD CONSTRAINT predictions_inference_latency_nonnegative
      CHECK (inference_latency_ms IS NULL OR inference_latency_ms >= 0);
  END IF;
END;
$$;

COMMIT;