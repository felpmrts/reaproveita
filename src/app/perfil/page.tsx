import Link from 'next/link';
import { Leaf, Home, LogOut } from 'lucide-react';
import { logoutUserAction } from '@/actions/auth.actions';
import ProfileForm from './profile-form';

export default function PerfilPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-900">Reaproveita</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Home className="h-4 w-4 text-emerald-600" />
              Início
            </Link>
            <form action={logoutUserAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-6 py-8">
            <h1 className="mb-2 text-2xl font-bold text-slate-900">Meu Perfil</h1>
            <p className="mb-6 text-sm text-slate-600">
              Atualize suas informações pessoais abaixo.
            </p>

            <ProfileForm />
          </div>
        </div>
      </div>
    </main>
  );
}