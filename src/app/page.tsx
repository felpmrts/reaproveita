import Link from 'next/link';
import { Leaf, Store, HeartHandshake, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-900">Reaproveita</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href="/register"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Combate ao desperdício alimentar
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Conectando alimentos excedentes a quem precisa
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
          Restaurantes, padarias, mercados e hortifrutis publicam lotes próximos do vencimento ou
          sobras do expediente para retirada presencial rápida por pessoas e instituições sociais.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Começar agora
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 text-left sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Store className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Para Doadores (Comerciantes)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Publique lotes excedentes em poucos segundos, gerencie a fila de reservas e confirme a
              retirada presencial no seu estabelecimento.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              Para Receptores (Beneficiários)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Explore ofertas próximas no mapa, filtre por validade e urgência e reserve alimentos
              gratuitamente para coleta presencial.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
