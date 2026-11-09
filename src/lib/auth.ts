import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getUserRepository } from '@/repositories/user.repository';
import { UserEntity } from '@/types/user';
import { cookies } from 'next/headers';

/**
 * Obtém o usuário autenticado de forma segura para as rotas da API.
 */
export async function getAuthenticatedUser(): Promise<UserEntity | null> {
  const repo = getUserRepository();

  // 1. Tenta validar token assinado via Supabase Auth (caso haja sessão ativa no Supabase Auth)
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser();

      if (!error && data.user?.email) {
        const supabaseUser = await repo.findByEmail(data.user.email);
        if (supabaseUser) return supabaseUser;
      }
    } catch {
      // Se falhar ou não houver sessão no Supabase Auth, prossegue para o cookie de sessão da aplicação
    }
  }

  // 2. Valida o cookie HttpOnly 'reaproveita_session' emitido pelo endpoint POST /auth/login
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('reaproveita_session');

    if (sessionCookie?.value) {
      const userData = JSON.parse(sessionCookie.value);
      if (userData?.email) {
        return await repo.findByEmail(userData.email);
      }
      if (userData?.id) {
        return await repo.findById(userData.id);
      }
    }
  } catch {
    return null;
  }

  return null;
}