import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para leitura no navegador (Client Components).
 * Diretriz Inegociável 1 (agent/rules/contex.md):
 * NUNCA utilizar este cliente no navegador para INSERT, UPDATE ou DELETE.
 * Toda mutação deve passar obrigatoriamente por Server Actions ou Route Handlers.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
