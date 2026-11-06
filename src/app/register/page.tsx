import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata = {
  title: 'Criar Conta — Reaproveita',
  description:
    'Cadastre-se no Reaproveita como Doador (estabelecimento comercial) ou Receptor (beneficiário ou instituição social).',
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-emerald-50/60 via-slate-50 to-slate-100 py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-emerald-700 transition hover:opacity-90"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Leaf className="h-6 w-6" />
            </span>
            <span className="text-2xl font-extrabold tracking-tight text-slate-900">
              Reaproveita
            </span>
          </Link>
        </div>

        <h1 className="mt-5 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Crie sua conta gratuita
        </h1>
        <p className="mt-2 px-4 text-center text-sm text-slate-600">
          Conectando estabelecimentos com excedentes alimentares a quem pode aproveitá-los com
          segurança e agilidade.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-8 shadow-sm sm:px-10">
          <RegisterForm />
        </div>
      </div>
    </main>
  );
}
