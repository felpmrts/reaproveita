-- História ST18 / SCRUM-36 / SCRUM-94 — Índices B-Tree para consulta de reservas recebidas pelo estabelecimento doador (RNF02)

CREATE INDEX IF NOT EXISTS food_batches_establishment_idx
  ON public.food_batches(establishment_id);

CREATE INDEX IF NOT EXISTS food_batch_reservations_batch_status_idx
  ON public.food_batch_reservations(batch_id, status, created_at DESC);
