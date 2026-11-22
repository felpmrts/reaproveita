import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeartHandshake, ArrowLeft, ShieldCheck, ArrowRight } from 'lucide-react';
import { FoodBatchCatalog } from '@/components/food-batches/FoodBatchCatalog';
import { ReceiverReservationsList } from '@/components/reservations/ReceiverReservationsList';
import { ForbiddenError, UnauthorizedError, requireRole } from '@/lib/rbac';

import { listReceiverReservations } from '@/services/reservation.service';
import { listActiveFoodBatchCatalog } from '@/services/food-batch.service';

export const dynamic = 'force-dynamic';

export default async function PainelReceptorPage() {
  let user;
  try {
    user = await requireRole(['RECEIVER']);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    redirect('/');
  }

  const [reservations, catalog] = await Promise.all([
    listReceiverReservations(user),
    listActiveFoodBatchCatalog(),
  ]);

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

          <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Ofertas disponíveis</h2>
              <Link
                href="/explorar"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                Abrir catálogo completo
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <FoodBatchCatalog
              initialOffers={catalog.items}
              initialUpdatedAt={catalog.updatedAt}
              embedded
            />
          </section>

          <ReceiverReservationsList initialReservations={reservations} />
        </div>
      </div>
    </main>
  );
}
