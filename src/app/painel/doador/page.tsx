import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Store, ArrowLeft, ShieldCheck, Plus } from 'lucide-react';
import { ForbiddenError, UnauthorizedError, requireRole } from '@/lib/rbac';
import { getEstablishmentRepository } from '@/repositories/establishment.repository';

export default async function PainelDoadorPage() {
  let user;
  try {
    user = await requireRole(['DONOR']);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    redirect('/');
  }

  const establishments = await getEstablishmentRepository().findByOwner(user.id);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a Central
        </Link>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Acesso Exclusivo: Doador
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Painel do Doador</h1>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            Olá, <strong>{user.name}</strong>. Aqui você gerencia apenas os estabelecimentos
            comerciais aos quais sua conta está vinculada.
          </p>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-800">
                Estabelecimentos Vinculados ({establishments.length})
              </h2>
              <Link href="/painel/doador/estabelecimentos/novo" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                <Plus className="h-3.5 w-3.5" />Cadastrar estabelecimento
              </Link>
            </div>
            {establishments.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                Nenhum estabelecimento vinculado ao seu identificador ({user.id}) até o momento.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {establishments.map((est) => (
                  <li
                    key={est.id}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                  >
                    <span className="text-slate-900">
                      {est.name} ·{' '}
                      <Link href={`/painel/doador/estabelecimentos/${est.id}`} className="font-medium text-emerald-700 hover:underline">
                        Gerenciar
                      </Link>
                    </span>
                    <span className="text-xs text-slate-500">{est.city} - {est.state} · {est.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
