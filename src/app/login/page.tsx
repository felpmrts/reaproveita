import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';
import { Leaf } from 'lucide-react';

/**
 * Página de Login (Rota: /login).
 * Server Component responsável por renderizar a estrutura visual da tela
 * e instanciar o componente client-side <LoginForm />.
 * Atende ao requisito RF03 (Autenticação).
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="text-center">
          <Link
            href="/"
            className="mx-auto inline-flex items-center gap-2.5 text-emerald-700 transition hover:opacity-90"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Leaf className="h-6 w-6" />
            </span>
            <span className="text-2xl font-extrabold tracking-tight text-slate-900">
              Reaproveita
            </span>
          </Link>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">Acesse sua conta</h2>
          <p className="mt-2 text-sm text-slate-600">
            Bem-vindo de volta ao <span className="font-semibold text-emerald-700">Reaproveita</span>
          </p>
        </div>

        {/* Componente Client-side que contém a lógica de formulário, validação e fetch */}
        <LoginForm />
      </div>
    </div>
  );
}