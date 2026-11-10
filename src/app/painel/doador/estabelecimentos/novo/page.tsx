import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EstablishmentForm } from '@/components/establishments/EstablishmentForm';
import { ForbiddenError, UnauthorizedError, requireRole } from '@/lib/rbac';

export default async function NovoEstabelecimentoPage() {
  try {
    await requireRole(['DONOR']);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/acesso-negado');
    redirect('/');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/painel/doador" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          <ArrowLeft className="h-4 w-4" />Voltar ao painel
        </Link>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Cadastrar estabelecimento</h1>
          <p className="mt-2 text-sm text-slate-600">O cadastro ficará pendente de aprovação antes da publicação de ofertas.</p>
          <div className="mt-7"><EstablishmentForm /></div>
        </div>
      </div>
    </main>
  );
}
