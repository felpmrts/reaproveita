import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getUserRepository } from '@/repositories/user.repository';
import { UserEntity } from '@/types/user';
import { cookies } from 'next/headers';

/**
 * Obtém o usuário autenticado de forma segura para as rotas da API.
 */
export async function getAuthenticatedUser(): Promise<UserEntity | null> {
  const repo = getUserRepository();

  // 1. Comportamento Oficial/Produção: Validar token assinado via Supabase Auth
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseServerClient();
    // A função getUser() valida a sessão de forma segura diretamente no servidor
    const { data, error } = await supabase.auth.getUser();
    
    if (error || !data.user || !data.user.email) return null;
    
    // Busca o usuário interno usando o e-mail validado pelo Supabase
    return await repo.findByEmail(data.user.email);
  }
  
  // 2. Comportamento de Desenvolvimento: Fallback para o cookie legado/inseguro
  // ATENÇÃO: Isso evita travar a ST03 enquanto a equipe não finaliza a refatoração do login,
  // mas NUNCA será executado em produção se o Supabase estiver configurado.
  if (process.env.NODE_ENV !== 'production') {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('reaproveita_session');
    
    if (sessionCookie?.value) {
      try {
        const userData = JSON.parse(sessionCookie.value);
        if (userData.email) {
          return await repo.findByEmail(userData.email);
        }
      } catch (e) {
        return null;
      }
    }
  }

  return null;
}