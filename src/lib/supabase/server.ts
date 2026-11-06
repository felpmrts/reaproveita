import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Garante compatibilidade com @supabase/realtime-js em Node.js < 22 no servidor
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = class DummyServerWebSocket {};
}

/**
 * Verifica se as variáveis de ambiente do Supabase estão configuradas.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id')
  );
}

/**
 * Cria o cliente Supabase SSR mantendo sessão em cookies HttpOnly, Secure e SameSite=Lax
 * conforme especificado em agent/rules/contex.md (Seção 1.2 e Diretriz 3).
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
            })
          );
        } catch {
          // Ignorado quando chamado a partir de Server Component puro sem permissão de setCookie
        }
      },
    },
  });
}

/**
 * Cria cliente administrativo restrito ao servidor (BFF) para operações que exigem service_role.
 * Diretriz 3: A chave SUPABASE_SERVICE_ROLE_KEY jamais possui prefixo NEXT_PUBLIC_.
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Credenciais administrativas do Supabase não configuradas no servidor.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
