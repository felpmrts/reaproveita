import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeartHandshake, ArrowLeft, ShieldCheck } from 'lucide-react';
import { ForbiddenError, UnauthorizedError, requireRole } from '@/lib/rbac';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';

export default async function PainelReceptorPage() {
  let user;
  try {
    user = await requireRole(['RECEIVER']);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    redirect('/');
  }

  const repo = getRbacResourceRepository();
  const reservations = await repo.findReservationsByReceiver(user.id);

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
              <HeartHandshake className="h-5 w-5" />
            </span>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Acesso Exclusivo: Receptor (RECEIVER)
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Painel do Receptor</h1>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            Olá, <strong>{user.name}</strong>. Aqui você visualiza e gerencia exclusivamente suas
            próprias reservas de alimentos.
          </p>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Minhas Reservas ({reservations.length})
            </h2>
            {reservations.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                Você ainda não possui reservas vinculadas ao seu perfil.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {reservations.map((res) => (
                  <li
                    key={res.id}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                  >
                    <span className="font-medium text-slate-900">{res.batchTitle}</span>
                    <span className="text-xs font-semibold text-emerald-700">{res.status}</span>
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
