import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function AcessoNegadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <span className="mt-4 inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          Erro 403 — Forbidden
        </span>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Acesso Não Autorizado</h1>
        <p className="mt-2 text-sm text-slate-600">
          O seu perfil de usuário não possui permissão para acessar esta área ou realizar esta
          operação restrita.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para a Página Inicial
          </Link>
        </div>
      </div>
    </main>
  );
}
