-- História ST10 / SCRUM-24 / SCRUM-77 - Índice para consulta rápida do catálogo de ofertas ativas (RF06, RNF02)
CREATE INDEX IF NOT EXISTS food_batches_active_catalog_idx
  ON public.food_batches (pickup_ends_at, expires_at, published_at DESC)
  WHERE status = 'ACTIVE' AND available_quantity > 0 AND fit_for_consumption = true;
