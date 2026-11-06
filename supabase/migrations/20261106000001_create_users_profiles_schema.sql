-- ============================================================================
-- Migration: 20261106000001_create_users_profiles_schema.sql
-- Story: Cadastro de usuários (RF01, RN01, RN14)
-- Subtask: [BE] Modelagem e schema de usuário
-- ============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 1. Enum de papéis de usuário (RBAC - Seção 3 de agent/rules/contex.md)
-- DONOR: Doador / Comerciante
-- RECEIVER: Receptor / Beneficiário
-- ADMIN: Administrador da plataforma
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('DONOR', 'RECEIVER', 'ADMIN');
  END IF;
END
$$;

-- 2. Tabela de Usuários / Perfis (RF01 & RN01 - Unicidade de Usuário e E-mail)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'RECEIVER',
  phone VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints de validação de domínio
  CONSTRAINT users_name_min_length CHECK (char_length(btrim(name)) >= 3),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_format_check CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

-- Índice único case-insensitive para garantir RN01 mesmo com variação de caixa
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
  ON public.users (LOWER(btrim(email)));

-- Índice por papel para consultas de RBAC e auditoria (ADMIN / DONOR / RECEIVER)
CREATE INDEX IF NOT EXISTS users_role_idx
  ON public.users (role);

-- 3. Trigger para manter updated_at e normalizar e-mail em minúsculas
CREATE OR REPLACE FUNCTION public.handle_users_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email := LOWER(btrim(NEW.email));
  NEW.name := btrim(NEW.name);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_before_write ON public.users;
CREATE TRIGGER trg_users_before_write
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_users_before_write();

-- 4. Row Level Security (RLS) - Diretriz 1 de agent/rules/contex.md:
-- Proibição de escrita direta pelo cliente (Client-Side).
-- Mutações ocorrem exclusivamente via BFF (Server Actions / Route Handlers).
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
CREATE POLICY "Users can view their own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id OR auth.uid() = id);

COMMENT ON TABLE public.users IS 'Tabela de usuários da plataforma Reaproveita com suporte a Doador (DONOR) e Receptor (RECEIVER) e unicidade de e-mail (RN01).';
COMMENT ON COLUMN public.users.role IS 'Papel do usuário no RBAC: DONOR (Doador/Comerciante), RECEIVER (Receptor/Beneficiário) ou ADMIN.';
