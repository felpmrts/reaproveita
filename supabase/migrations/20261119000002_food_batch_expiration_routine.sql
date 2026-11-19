-- História ST13 / SCRUM-27 / SCRUM-85 - Rotina SQL de expiração automática e bloqueio de reservas vencidas (RF13, RN13, RN15)

DO $$
DECLARE
  status_constraint_name TEXT;
BEGIN
  SELECT conname
    INTO status_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'public.food_batches'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%INACTIVE%';

  IF status_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.food_batches DROP CONSTRAINT %I', status_constraint_name);
  END IF;
END
$$;

ALTER TABLE public.food_batches
  ADD CONSTRAINT food_batches_status_check
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'CLOSED', 'EXPIRED'));

ALTER TABLE public.food_batches
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE public.food_batch_history
  ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT 'MANUAL_UPDATE';

CREATE INDEX IF NOT EXISTS food_batches_expiration_scan_idx
  ON public.food_batches (expires_at, pickup_ends_at)
  WHERE status IN ('ACTIVE', 'INACTIVE');

CREATE OR REPLACE FUNCTION public.record_food_batch_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('CLOSED', 'EXPIRED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid batch status transition' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'EXPIRED'
     AND ROW(OLD.name, OLD.category, OLD.description, OLD.storage_conditions)
         IS DISTINCT FROM ROW(NEW.name, NEW.category, NEW.description, NEW.storage_conditions) THEN
    RAISE EXCEPTION 'Expired food batch cannot be modified' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'INACTIVE' AND NEW.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid batch status transition' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'EXPIRED' AND OLD.status <> 'EXPIRED' THEN
    NEW.expired_at := COALESCE(NEW.expired_at, clock_timestamp());
  END IF;

  IF ROW(OLD.name, OLD.category, OLD.description, OLD.storage_conditions, OLD.status)
     IS DISTINCT FROM ROW(NEW.name, NEW.category, NEW.description, NEW.storage_conditions, NEW.status) THEN
    NEW.revision := OLD.revision + 1;
    INSERT INTO public.food_batch_history (batch_id, revision, previous, current, change_reason)
    VALUES (
      OLD.id,
      NEW.revision,
      to_jsonb(OLD),
      to_jsonb(NEW),
      CASE
        WHEN NEW.status = 'EXPIRED' AND OLD.status <> 'EXPIRED' THEN 'AUTOMATIC_EXPIRATION'
        ELSE 'MANUAL_UPDATE'
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_overdue_food_batches(
  reference_time TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS TABLE (
  batch_id UUID,
  previous_status TEXT,
  expired_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  checked_at TIMESTAMPTZ := COALESCE(reference_time, clock_timestamp());
BEGIN
  RETURN QUERY
  WITH overdue AS (
    SELECT fb.id, fb.status AS prev_status
    FROM public.food_batches AS fb
    WHERE fb.status IN ('ACTIVE', 'INACTIVE')
      AND (fb.expires_at <= checked_at OR fb.pickup_ends_at <= checked_at)
    FOR UPDATE OF fb SKIP LOCKED
  ),
  updated AS (
    UPDATE public.food_batches AS fb
    SET status = 'EXPIRED',
        expired_at = checked_at
    FROM overdue
    WHERE fb.id = overdue.id
    RETURNING fb.id, overdue.prev_status, fb.expired_at
  )
  SELECT updated.id, updated.prev_status, updated.expired_at
  FROM updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_overdue_food_batches(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_food_batches(TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.require_reservable_food_batch(batch_id UUID, requested_quantity INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  batch public.food_batches%ROWTYPE;
  checked_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO batch FROM public.food_batches WHERE id = batch_id FOR UPDATE;
  checked_at := clock_timestamp();

  IF NOT FOUND OR requested_quantity IS NULL OR requested_quantity <= 0 THEN
    RAISE EXCEPTION 'Batch unavailable for reservation' USING ERRCODE = '23514';
  END IF;

  IF batch.status = 'EXPIRED' OR batch.expires_at <= checked_at OR batch.pickup_ends_at <= checked_at THEN
    RAISE EXCEPTION 'Batch expired and unavailable for reservation' USING ERRCODE = '23514';
  END IF;

  IF batch.status <> 'ACTIVE' OR batch.available_quantity < requested_quantity THEN
    RAISE EXCEPTION 'Batch unavailable for reservation' USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.require_reservable_food_batch(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_reservable_food_batch(UUID, INTEGER) TO service_role;
