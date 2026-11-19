import Link from 'next/link';
import { Leaf, LogIn, Sparkles, User, LayoutDashboard } from 'lucide-react';
import { FoodBatchCatalog } from '@/components/food-batches/FoodBatchCatalog';
import type { FoodBatchCatalogFilterState } from '@/components/food-batches/FoodBatchSearchFilters';
import { getAuthenticatedUser } from '@/lib/auth';
import { parseFoodBatchCatalogSearchParams } from '@/schemas/food-batch.schema';
import { listActiveFoodBatchCatalog } from '@/services/food-batch.service';
import type { UserRole } from '@/types/user';

export const dynamic = 'force-dynamic';

function getPanelRouteForRole(role: UserRole): { href: string; label: string } {
  if (role === 'DONOR') return { href: '/painel/doador', label: 'Painel do Doador' };
  if (role === 'ADMIN') return { href: '/painel/admin', label: 'Painel Admin' };
  return { href: '/painel/receptor', label: 'Minhas Reservas' };
}

export default async function ExplorarOfertasPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const parsedFilters = parseFoodBatchCatalogSearchParams(searchParams ?? {});
  const initialFilters: Partial<FoodBatchCatalogFilterState> = parsedFilters.success
    ? {
        search: parsedFilters.data.search ?? '',
        category: parsedFilters.data.category ?? '',
        expiresUntil:
          parsedFilters.data.expiresUntil && /^\d{4}-\d{2}-\d{2}$/.test(parsedFilters.data.expiresUntil)
            ? parsedFilters.data.expiresUntil
            : '',
        availability:
          parsedFilters.data.availability === 'PICKUP_NOW' ||
          parsedFilters.data.availability === 'PICKUP_TODAY'
            ? parsedFilters.data.availability
            : '',
        minQuantity:
          parsedFilters.data.minQuantity !== undefined
            ? String(parsedFilters.data.minQuantity)
            : '',
      }
    : {};

  const [catalog, user] = await Promise.all([
    parsedFilters.success
      ? listActiveFoodBatchCatalog(parsedFilters.data)
      : listActiveFoodBatchCatalog(),
    getAuthenticatedUser(),
  ]);

  const panelRoute = user ? getPanelRouteForRole(user.role) : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-900">Reaproveita</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
            {user && panelRoute ? (
              <>
                <Link
                  href={panelRoute.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <LayoutDashboard className="h-4 w-4 text-emerald-600" />
                  {panelRoute.label}
                </Link>
                <Link
                  href="/perfil"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <User className="h-4 w-4" />
                  Meu Perfil
                </Link>
              </>
            ) : (
              <>
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
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" />
            Ofertas ativas · Retirada presencial
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Catálogo de ofertas disponíveis
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Consulte lotes ativos, dentro do prazo de validade e com estoque disponível para reserva.
            As ofertas são exibidas por ordem de urgência de retirada para priorizar o resgate dos
            alimentos.
          </p>
        </section>

        <FoodBatchCatalog
          initialOffers={catalog.items}
          initialUpdatedAt={catalog.updatedAt}
          initialFilters={initialFilters}
          syncUrl
        />
      </div>
    </main>
  );
}
