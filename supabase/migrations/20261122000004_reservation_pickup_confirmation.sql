-- História ST19 / SCRUM-37 / SCRUM-96 — Confirmação de retirada presencial idempotente, auditoria e indicadores de impacto (RF11, RF12, RN03, RN10, RN11, RN12, RN14, RN15, RN16)

ALTER TABLE public.food_batch_reservations
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pickup_confirmation_request_id UUID;

CREATE INDEX IF NOT EXISTS food_batch_reservations_completed_idx
  ON public.food_batch_reservations(batch_id, completed_at DESC)
  WHERE status = 'COMPLETED';

-- RN03 / RN10 / RN11 / RN12 / RN14 / RN15: Confirmação atômica e idempotente de retirada presencial.
CREATE FUNCTION public.confirm_food_batch_pickup(
  p_reservation_id UUID,
  p_donor_id UUID,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  reservation public.food_batch_reservations%ROWTYPE;
  batch public.food_batches%ROWTYPE;
  establishment public.establishments%ROWTYPE;
  history_entry public.food_batch_reservation_history%ROWTYPE;
  checked_at TIMESTAMPTZ;
BEGIN
  IF p_reservation_id IS NULL OR p_donor_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_INVALID_INPUT' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM public.users
   WHERE id = p_donor_id
     AND role = 'DONOR'
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

  SELECT *
    INTO batch
    FROM public.food_batches
   WHERE id = reservation.batch_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO establishment
    FROM public.establishments
   WHERE id = batch.establishment_id
   FOR SHARE;

  IF NOT FOUND OR establishment.owner_id <> p_donor_id THEN
    RAISE EXCEPTION 'RESERVATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- RN12: Retentativa com a mesma chave de idempotência retorna o registro já concluído sem duplicidade;
  -- qualquer outra tentativa duplicada é bloqueada com conflito.
  IF reservation.status = 'COMPLETED' THEN
    IF p_request_id IS NOT NULL AND reservation.pickup_confirmation_request_id = p_request_id THEN
      SELECT *
        INTO history_entry
        FROM public.food_batch_reservation_history
       WHERE reservation_id = reservation.id
         AND action = 'COMPLETED'
       ORDER BY occurred_at DESC
       LIMIT 1;

      RETURN jsonb_build_object(
        'reservation', to_jsonb(reservation),
        'history_entry', to_jsonb(history_entry),
        'idempotent_replay', true
      );
    END IF;

    RAISE EXCEPTION 'RESERVATION_ALREADY_COMPLETED' USING ERRCODE = '23514';
  END IF;

  IF reservation.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLED' USING ERRCODE = '23514';
  END IF;

  checked_at := clock_timestamp();

  -- RN11: Apenas reservas ativas e dentro da validade podem ter retirada registrada.
  IF batch.status = 'EXPIRED'
     OR batch.expires_at <= checked_at
     OR batch.pickup_ends_at <= checked_at THEN
    RAISE EXCEPTION 'RESERVATION_EXPIRED' USING ERRCODE = '23514';
  END IF;

  IF batch.fit_for_consumption IS NOT TRUE THEN
    RAISE EXCEPTION 'RESERVATION_UNFIT' USING ERRCODE = '23514';
  END IF;

  -- RN12: Atualização atômica condicional WHERE status = 'ACTIVE'
  UPDATE public.food_batch_reservations
     SET status = 'COMPLETED',
         completed_at = checked_at,
         completed_by = p_donor_id,
         pickup_confirmation_request_id = COALESCE(p_request_id, pickup_confirmation_request_id)
   WHERE id = reservation.id
     AND status = 'ACTIVE'
   RETURNING * INTO reservation;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_COMPLETED' USING ERRCODE = '23514';
  END IF;

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
    p_donor_id,
    'COMPLETED',
    'ACTIVE',
    'COMPLETED',
    reservation.quantity,
    false,
    0,
    NULL,
    checked_at
  )
  RETURNING * INTO history_entry;

  RETURN jsonb_build_object(
    'reservation', to_jsonb(reservation),
    'history_entry', to_jsonb(history_entry),
    'idempotent_replay', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_food_batch_pickup(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_food_batch_pickup(UUID, UUID, UUID) TO service_role;
