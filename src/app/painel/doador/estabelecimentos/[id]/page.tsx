import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EstablishmentForm } from '@/components/establishments/EstablishmentForm';
import { ForbiddenError, requireRole, UnauthorizedError } from '@/lib/rbac';
import { getEstablishmentRepository } from '@/repositories/establishment.repository';

export default async function ManageEstablishmentPage({ params }: { params: { id: string } }) {
  const user = await requireRole(['DONOR']).catch((error: unknown) => {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    throw error;
  });

  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.id)) notFound();
  const establishment = await getEstablishmentRepository().findById(params.id);
  if (!establishment) notFound();
  if (establishment.ownerId !== user.id) redirect('/acesso-negado');

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/painel/doador" className="text-sm font-semibold text-emerald-700">
          Voltar ao Painel do Doador
        </Link>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Gerenciar estabelecimento</h1>
          <p className="mt-2 text-sm text-slate-600">Status: {establishment.status}</p>
          <section className="my-6 rounded-xl bg-slate-50 p-4">
            <h2 className="font-semibold text-slate-900">Responsáveis vinculados</h2>
            <ul className="mt-2 text-sm text-slate-700">
              <li>{user.name} (titular)</li>
            </ul>
          </section>
          <EstablishmentForm establishment={establishment} />
        </div>
      </div>
    </main>
  );
}
