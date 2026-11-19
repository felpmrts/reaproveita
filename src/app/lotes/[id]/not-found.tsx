import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function FoodBatchNotFound() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Lote não encontrado</h1>
        <p className="mt-2 text-sm text-slate-600">
          O lote solicitado não existe ou foi removido do catálogo.
        </p>
        <Link
          href="/explorar"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para ofertas
        </Link>
      </div>
    </main>
  );
}
