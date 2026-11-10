import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FoodBatchForm } from '@/components/food-batches/FoodBatchForm';
import { ForbiddenError, requireRole, UnauthorizedError } from '@/lib/rbac';
import { getEstablishmentRepository } from '@/repositories/establishment.repository';
import { ArrowLeft } from 'lucide-react';

export default async function NewFoodBatchPage() {
  const donor = await requireRole(['DONOR']).catch((error: unknown) => {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    throw error;
  });
  const establishments = (await getEstablishmentRepository().findByOwner(donor.id))
    .filter(({ status }) => status === 'APPROVED')
    .map(({ id, name }) => ({ id, name }));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/painel/doador" className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Painel do Doador
        </Link>
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Publicar lote de alimentos</h1>
          {establishments.length > 0 ? (
            <FoodBatchForm establishments={establishments} />
          ) : (
            <p className="mt-4 text-sm text-slate-700">
              Você precisa de um estabelecimento aprovado para publicar um lote.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
