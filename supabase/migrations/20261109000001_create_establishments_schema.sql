-- História ST05 / SCRUM-16 - Cadastro de estabelecimento (RF02, RN02, RN03)
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'establishment_status') THEN
    CREATE TYPE public.establishment_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.establishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  cnpj VARCHAR(14) NOT NULL UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(11) NOT NULL CHECK (phone ~ '^[0-9]{10,11}$'),
  zip_code VARCHAR(8) NOT NULL CHECK (zip_code ~ '^[0-9]{8}$'),
  street VARCHAR(160) NOT NULL,
  number VARCHAR(20) NOT NULL,
  complement VARCHAR(120),
  neighborhood VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  ) STORED NOT NULL,
  status public.establishment_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS establishments_owner_id_idx ON public.establishments(owner_id);
CREATE INDEX IF NOT EXISTS establishments_status_idx ON public.establishments(status);
CREATE INDEX IF NOT EXISTS establishments_location_gist_idx ON public.establishments USING GIST(location);

ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.establishments IS 'Estabelecimentos doadores; mutações ocorrem exclusivamente pelo BFF.';
COMMENT ON COLUMN public.establishments.status IS 'PENDING até aprovação administrativa, pré-condição da RN02.';
COMMENT ON COLUMN public.establishments.location IS 'Localização geográfica obrigatória usada nas consultas de proximidade.';
