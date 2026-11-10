ALTER TABLE public.food_batches
  ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'CLOSED')),
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE INDEX food_batches_published_by_idx ON public.food_batches(published_by);

CREATE TABLE public.food_batch_history (
  batch_id UUID NOT NULL REFERENCES public.food_batches(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  previous JSONB NOT NULL,
  current JSONB NOT NULL,
  PRIMARY KEY (batch_id, revision)
);

ALTER TABLE public.food_batch_history ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.record_food_batch_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'CLOSED' AND NEW.status <> OLD.status
    OR OLD.status = 'INACTIVE' AND NEW.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid batch status transition' USING ERRCODE = '23514';
  END IF;

  IF ROW(OLD.name, OLD.category, OLD.description, OLD.storage_conditions, OLD.status)
     IS DISTINCT FROM ROW(NEW.name, NEW.category, NEW.description, NEW.storage_conditions, NEW.status) THEN
    NEW.revision := OLD.revision + 1;
    INSERT INTO public.food_batch_history (batch_id, revision, previous, current)
    VALUES (OLD.id, NEW.revision, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_food_batch_change
BEFORE UPDATE ON public.food_batches
FOR EACH ROW EXECUTE FUNCTION public.record_food_batch_change();

-- A criação de reservas deve chamar esta função na mesma transação da baixa de estoque.
CREATE FUNCTION public.require_reservable_food_batch(batch_id UUID, requested_quantity INTEGER)
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

  IF NOT FOUND OR requested_quantity IS NULL OR requested_quantity <= 0
    OR batch.status <> 'ACTIVE' OR batch.available_quantity < requested_quantity
    OR batch.expires_at <= checked_at OR batch.pickup_ends_at <= checked_at THEN
    RAISE EXCEPTION 'Batch unavailable for reservation' USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.require_reservable_food_batch(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_reservable_food_batch(UUID, INTEGER) TO service_role;
