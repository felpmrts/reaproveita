CREATE TABLE public.food_batch_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.food_batches(id) ON DELETE RESTRICT,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  batch_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (receiver_id, request_id)
);
CREATE INDEX food_batch_reservations_receiver_idx ON public.food_batch_reservations(receiver_id);
ALTER TABLE public.food_batch_reservations ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.reserve_food_batch(p_batch_id UUID, p_receiver_id UUID, p_quantity INTEGER, p_request_id UUID)
RETURNS public.food_batch_reservations
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  batch public.food_batches%ROWTYPE;
  reservation public.food_batch_reservations%ROWTYPE;
  checked_at TIMESTAMPTZ;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid quantity or request identifier' USING ERRCODE = '23514';
  END IF;

  -- Serialize retries before reading the idempotency record, including different batch IDs.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_receiver_id::text || p_request_id::text, 0));
  SELECT * INTO reservation FROM public.food_batch_reservations
    WHERE receiver_id = p_receiver_id AND request_id = p_request_id;
  IF FOUND THEN
    IF reservation.batch_id <> p_batch_id OR reservation.quantity <> p_quantity THEN
      RAISE EXCEPTION 'Request identifier already used' USING ERRCODE = '23514';
    END IF;
    RETURN reservation;
  END IF;

  PERFORM 1 FROM public.users WHERE id = p_receiver_id AND role = 'RECEIVER' AND is_active = true FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receiver required' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO batch FROM public.food_batches WHERE id = p_batch_id FOR UPDATE;
  checked_at := clock_timestamp();
  IF NOT FOUND OR batch.status <> 'ACTIVE' OR batch.fit_for_consumption IS NOT TRUE
    OR batch.expires_at <= checked_at OR batch.pickup_ends_at <= checked_at
    OR batch.available_quantity < p_quantity THEN
    RAISE EXCEPTION 'Batch unavailable or insufficient stock' USING ERRCODE = '23514';
  END IF;

  UPDATE public.food_batches SET available_quantity = available_quantity - p_quantity WHERE id = p_batch_id;
  INSERT INTO public.food_batch_reservations (batch_id, receiver_id, request_id, quantity, batch_title)
    VALUES (p_batch_id, p_receiver_id, p_request_id, p_quantity, batch.name)
    RETURNING * INTO reservation;
  RETURN reservation;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_food_batch(UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_food_batch(UUID, UUID, INTEGER, UUID) TO service_role;
