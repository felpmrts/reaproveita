import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  Leaf,
  Store,
  HeartHandshake,
  ArrowRight,
  LogIn,
  User,
  LogOut,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { logoutUserAction } from '@/actions/auth.actions';
import { getAuthenticatedUser } from '@/lib/auth';
import { RoleNavigation } from '@/components/auth/RoleNavigation';
import { UserRole } from '@/types/user';

export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('reaproveita_session');

  let loggedUser: { name?: string; email?: string; role?: UserRole } | null = null;
  if (sessionCookie?.value) {
    try {
      loggedUser = JSON.parse(sessionCookie.value);
    } catch {
      loggedUser = null;
    }
  }

  // Busca dados atualizados do banco caso o usuário tenha editado o perfil
  const dbUser = sessionCookie ? await getAuthenticatedUser() : null;
  if (dbUser) {
    loggedUser = {
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
    };
  }

  const isAuthenticated = Boolean(loggedUser);

  // ============================================================================
  // VISÃO LOGADA: PÁGINA INICIAL / HUB DE FERRAMENTAS
  // ============================================================================
  if (isAuthenticated && loggedUser) {
    const activeRole: UserRole =
      loggedUser.role === 'DONOR' || loggedUser.role === 'ADMIN' || loggedUser.role === 'RECEIVER'
        ? loggedUser.role
        : 'RECEIVER';

    const roleLabel =
      activeRole === 'DONOR'
        ? 'Doador / Comerciante'
        : activeRole === 'ADMIN'
          ? 'Administrador'
          : 'Receptor / Beneficiário';

    return (
      <main className="min-h-screen bg-slate-50">
        {/* Cabeçalho do Hub */}
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Leaf className="h-5 w-5" />
              </span>
              <span className="text-xl font-bold tracking-tight text-slate-900">Reaproveita</span>
            </Link>

            <nav className="flex items-center gap-3">
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-sm text-slate-600">
                  Olá, <strong className="font-semibold text-slate-900">{loggedUser.name || 'Usuário'}</strong>
                </span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  {roleLabel}
                </span>
              </div>

              <Link
                href="/perfil"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <User className="h-4 w-4" />
                Meu Perfil
              </Link>

              <form action={logoutUserAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </form>
            </nav>
          </div>
        </header>

        {/* Conteúdo Principal do Hub */}
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          {/* Banner de Boas-vindas */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                <Sparkles className="h-3.5 w-3.5" />
                Página Inicial
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Bem-vindo(a), {loggedUser.name || 'Usuário'}!
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Esta é a sua central no Reaproveita. Acesse suas ferramentas autorizadas para o perfil de{' '}
                <strong>{roleLabel}</strong> ou atualize os dados da sua conta.
              </p>
            </div>

            <Link
              href="/perfil"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-600 hover:text-emerald-700"
            >
              <User className="h-4 w-4 text-emerald-600" />
              Gerenciar Meu Perfil
            </Link>
          </div>

          {/* Hub de Ferramentas com controle visual de RBAC (RN14) */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <LayoutGrid className="h-5 w-5 text-emerald-600" />
                Hub de Ferramentas ({roleLabel})
              </h2>
            </div>

            <RoleNavigation role={activeRole} />
          </section>
        </div>
      </main>
    );
  }

  // ============================================================================
  // VISÃO PÚBLICA (DESLOGADO): LANDING PAGE
  // ============================================================================
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-900">Reaproveita</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <LogIn className="h-4 w-4 text-emerald-600" />
              Entrar
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Combate ao desperdício alimentar
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Conectando alimentos excedentes a quem precisa
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
          Restaurantes, padarias, mercados e hortifrutis publicam lotes próximos do vencimento ou
          sobras do expediente para retirada presencial rápida por pessoas e instituições sociais.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Começar agora
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <LogIn className="h-4 w-4 text-emerald-600" />
            Já tenho conta
          </Link>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 text-left sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Store className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Para Doadores (Comerciantes)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Publique lotes excedentes em poucos segundos, gerencie a fila de reservas e confirme a
              retirada presencial no seu estabelecimento.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              Para Receptores (Beneficiários)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Explore ofertas próximas no mapa, filtre por validade e urgência e reserve alimentos
              gratuitamente para coleta presencial.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
