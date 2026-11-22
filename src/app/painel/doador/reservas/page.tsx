import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ClipboardList, ShieldCheck } from 'lucide-react';
import { DonorReservationsPanel } from '@/components/reservations/DonorReservationsPanel';
import { ForbiddenError, UnauthorizedError, requireRole } from '@/lib/rbac';
import { listDonorReceivedReservations } from '@/services/reservation.service';

export const dynamic = 'force-dynamic';

export default async function PainelDoadorReservasPage() {
  let donor;
  try {
    donor = await requireRole(['DONOR']);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    redirect('/');
  }

  const initialData = await listDonorReceivedReservations(donor);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/painel/doador"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Painel do Doador
        </Link>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Acesso Restrito: Responsável pelo Estabelecimento
                </span>
                <h1 className="text-2xl font-bold text-slate-900">
                  Reservas recebidas
                </h1>
              </div>
            </div>

            <Link
              href="/painel/doador/lotes"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ver minhas ofertas
            </Link>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            Acompanhe as reservas associadas aos lotes dos seus estabelecimentos para
            organizar a separação dos alimentos e as retiradas presenciais.
          </p>

          <div className="mt-6">
            <DonorReservationsPanel initialData={initialData} />
          </div>
        </div>
      </div>
    </main>
  );
}
