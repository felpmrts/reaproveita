import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ManageFoodBatchForm } from '@/components/food-batches/ManageFoodBatchForm';
import { ForbiddenError, requireRole, UnauthorizedError } from '@/lib/rbac';
import { listDonorFoodBatches } from '@/repositories/food-batch.repository';

export default async function DonorOffersPage() {
  const donor = await requireRole(['DONOR']).catch((error: unknown) => {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    throw error;
  });
  const offers = await listDonorFoodBatches(donor.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/painel/doador" className="text-sm font-semibold text-emerald-700">Voltar ao Painel do Doador</Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Minhas ofertas</h1>
        <Link href="/painel/doador/lotes/novo" className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
          Publicar lote
        </Link>
      </div>
      {offers.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">Você ainda não publicou ofertas.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {offers.map((offer) => <li key={offer.id}><ManageFoodBatchForm offer={offer} /></li>)}
        </ul>
      )}
    </main>
  );
}
