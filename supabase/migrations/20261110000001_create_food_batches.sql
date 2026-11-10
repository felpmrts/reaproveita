CREATE TABLE public.food_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  published_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL CHECK (btrim(name) <> ''),
  category VARCHAR(80) NOT NULL CHECK (btrim(category) <> ''),
  description VARCHAR(2000) NOT NULL CHECK (btrim(description) <> ''),
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  pickup_starts_at TIMESTAMPTZ NOT NULL,
  pickup_ends_at TIMESTAMPTZ NOT NULL,
  storage_conditions VARCHAR(500) NOT NULL CHECK (btrim(storage_conditions) <> ''),
  fit_for_consumption BOOLEAN NOT NULL CHECK (fit_for_consumption),
  published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > published_at),
  CHECK (pickup_ends_at > published_at AND pickup_ends_at > pickup_starts_at AND pickup_ends_at <= expires_at)
);

CREATE INDEX food_batches_establishment_id_idx ON public.food_batches(establishment_id);
ALTER TABLE public.food_batches ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.check_food_batch_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.establishments
    WHERE id = NEW.establishment_id AND owner_id = NEW.published_by AND status = 'APPROVED'
    FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication requires an approved establishment owned by the donor'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.available_quantity <= 0 THEN
    RAISE EXCEPTION 'Publication requires positive availability' USING ERRCODE = '23514';
  END IF;

  NEW.published_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_food_batch_publication
BEFORE INSERT ON public.food_batches
FOR EACH ROW EXECUTE FUNCTION public.check_food_batch_publication();
