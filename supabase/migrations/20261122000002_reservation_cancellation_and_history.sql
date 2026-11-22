-- História ST16 / SCRUM-33 / SCRUM-90 — Cancelamento de reserva com estorno atômico, imutabilidade de concluídas e histórico (RF10, RF12, RN08, RN09, RN10, RN14, RN15)

ALTER TABLE public.food_batch_reservations
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE TABLE public.food_batch_reservation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.food_batch_reservations(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES public.food_batches(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('CREATED', 'CANCELLED', 'COMPLETED', 'EXPIRED')),
  previous_status TEXT CHECK (previous_status IN ('ACTIVE', 'CANCELLED', 'COMPLETED')),
  new_status TEXT NOT NULL CHECK (new_status IN ('ACTIVE', 'CANCELLED', 'COMPLETED')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  restored_to_batch BOOLEAN NOT NULL DEFAULT false,
  restored_quantity INTEGER NOT NULL DEFAULT 0 CHECK (restored_quantity >= 0),
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX food_batch_reservation_history_reservation_idx
  ON public.food_batch_reservation_history(reservation_id, occurred_at DESC);

CREATE INDEX food_batch_reservation_history_actor_idx
  ON public.food_batch_reservation_history(actor_id, occurred_at DESC);

ALTER TABLE public.food_batch_reservation_history ENABLE ROW LEVEL SECURITY;

-- RN10: Reservas concluídas (COMPLETED) são imutáveis; reservas canceladas não podem ser reabertas.
CREATE FUNCTION public.enforce_reservation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'RESERVATION_COMPLETED' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_CANCELLED' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_reservation_status_transition
BEFORE UPDATE ON public.food_batch_reservations
FOR EACH ROW EXECUTE FUNCTION public.enforce_reservation_status_transition();

-- RN08 / RN09 / RN10 / RN14 / RN15: Cancelamento atômico de reserva ativa com estorno condicional ao lote válido e trilha de auditoria.
CREATE FUNCTION public.cancel_food_batch_reservation(
  p_reservation_id UUID,
  p_receiver_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  reservation public.food_batch_reservations%ROWTYPE;
  batch public.food_batches%ROWTYPE;
  history_entry public.food_batch_reservation_history%ROWTYPE;
  checked_at TIMESTAMPTZ;
  v_clean_reason TEXT;
  v_batch_valid BOOLEAN := false;
  v_restored_to_batch BOOLEAN := false;
  v_restored_quantity INTEGER := 0;
BEGIN
  IF p_reservation_id IS NULL OR p_receiver_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM public.users
   WHERE id = p_receiver_id
     AND role = 'RECEIVER'
     AND is_active = true
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO reservation
    FROM public.food_batch_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF reservation.receiver_id <> p_receiver_id THEN
    RAISE EXCEPTION 'RESERVATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF reservation.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'RESERVATION_COMPLETED' USING ERRCODE = '23514';
  END IF;

  IF reservation.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_CANCELLED' USING ERRCODE = '23514';
  END IF;

  checked_at := clock_timestamp();
  v_clean_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

  SELECT *
    INTO batch
    FROM public.food_batches
   WHERE id = reservation.batch_id
   FOR UPDATE;

  v_batch_valid := FOUND
    AND batch.status = 'ACTIVE'
    AND batch.fit_for_consumption IS TRUE
    AND batch.expires_at > checked_at
    AND batch.pickup_ends_at > checked_at;

  IF v_batch_valid THEN
    UPDATE public.food_batches
       SET available_quantity = available_quantity + reservation.quantity
     WHERE id = batch.id;
    v_restored_to_batch := true;
    v_restored_quantity := reservation.quantity;
  END IF;

  UPDATE public.food_batch_reservations
     SET status = 'CANCELLED',
         cancelled_at = checked_at,
         cancellation_reason = v_clean_reason
   WHERE id = reservation.id
   RETURNING * INTO reservation;

  INSERT INTO public.food_batch_reservation_history (
    reservation_id,
    batch_id,
    actor_id,
    action,
    previous_status,
    new_status,
    quantity,
    restored_to_batch,
    restored_quantity,
    reason,
    occurred_at
  ) VALUES (
    reservation.id,
    reservation.batch_id,
    p_receiver_id,
    'CANCELLED',
    'ACTIVE',
    'CANCELLED',
    reservation.quantity,
    v_restored_to_batch,
    v_restored_quantity,
    v_clean_reason,
    checked_at
  )
  RETURNING * INTO history_entry;

  RETURN jsonb_build_object(
    'reservation', to_jsonb(reservation),
    'restored_to_batch', v_restored_to_batch,
    'restored_quantity', v_restored_quantity,
    'history_entry', to_jsonb(history_entry)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_food_batch_reservation(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_food_batch_reservation(UUID, UUID, TEXT) TO service_role;
