'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Mail,
  MapPin,
  Package,
  Phone,
  Store,
  Thermometer,
} from 'lucide-react';
import type {
  FoodBatchDetails,
  FoodBatchUnavailableReason,
} from '@/services/food-batch.service';
import {
  URGENCY_STYLES,
  formatDateTime,
  formatUrgencyDescription,
} from './food-batch-format';

const UNAVAILABLE_MESSAGES: Record<FoodBatchUnavailableReason, { title: string; description: string }> = {
  EXPIRED: {
    title: 'Reservas indisponíveis — Lote expirado',
    description: 'O prazo de validade ou a janela de retirada deste lote já foi encerrado.',
  },
  INACTIVE: {
    title: 'Reservas indisponíveis — Lote inativo',
    description: 'Este lote foi pausado pelo estabelecimento doador e não aceita reservas no momento.',
  },
  CLOSED: {
    title: 'Reservas indisponíveis — Lote encerrado',
    description: 'Esta oferta foi encerrada definitivamente pelo estabelecimento doador.',
  },
  OUT_OF_STOCK: {
    title: 'Reservas indisponíveis — Estoque esgotado',
    description: 'Todas as unidades disponíveis deste lote já foram reservadas.',
  },
};

function formatAddress(establishment: NonNullable<FoodBatchDetails['establishment']>): string {
  const complement = establishment.complement ? `, ${establishment.complement}` : '';
  return `${establishment.street}, ${establishment.number}${complement} — ${establishment.neighborhood}, ${establishment.city}/${establishment.state} · CEP ${establishment.zipCode}`;
}

export function FoodBatchDetailsView({
  details,
  backHref = '/explorar',
}: {
  details: FoodBatchDetails;
  backHref?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (dialogOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [dialogOpen]);

  function openConfirmation() {
    setReservationError(null);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > details.availableQuantity) {
      setReservationError('Informe uma quantidade inteira entre 1 e o saldo disponível.');
      return;
    }
    setDialogOpen(true);
  }
  const request = useRef<{ quantity: number; id: string }>();
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reservationNotice, setReservationNotice] = useState<string | null>(null);

  const urgencyStyle = URGENCY_STYLES[details.urgency.level];
  const UrgencyIcon = urgencyStyle.icon;
  const unavailableInfo = details.unavailableReason
    ? UNAVAILABLE_MESSAGES[details.unavailableReason]
    : null;

  const urgencyDescription = formatUrgencyDescription(details.urgency);

  async function handleReserve() {
    if (pending || confirmed) return;
    setReservationError(null);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > details.availableQuantity) {
      setReservationError('Informe uma quantidade inteira entre 1 e o saldo disponível.');
      return;
    }
    if (!request.current || request.current.quantity !== quantity) {
      request.current = { quantity, id: crypto.randomUUID() };
    }
    setPending(true);
    try {
      const response = await fetch('/api/receiver/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId: details.id, quantity, requestId: request.current.id }),
      });
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) request.current = undefined;
        throw new Error(body.error?.message ?? 'Não foi possível reservar este lote.');
      }
      setConfirmed(true);
      setReservationNotice(`Reserva de ${body.data.quantity} unidade(s) realizada com sucesso.`);
      router.refresh();
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : 'Falha de comunicação. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para ofertas
        </Link>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {details.category}
              </span>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{details.name}</h1>
            </div>

            <div
              data-testid="urgency-indicator"
              data-urgency-level={details.urgency.level}
              role="status"
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${urgencyStyle.badge}`}
            >
              <UrgencyIcon className="h-4 w-4 shrink-0" />
              <span>{urgencyDescription}</span>
            </div>
          </div>

          <p className="mt-4 break-words text-base leading-relaxed text-slate-700">
            {details.description}
          </p>

          <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Quantidade disponível
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                  {details.availableQuantity} unidade(s)
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Thermometer className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Condições de armazenamento
                </dt>
                <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900">
                  {details.storageConditions}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Validade do alimento
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                  {formatDateTime(details.expiresAt)}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Janela de retirada
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                  {formatDateTime(details.pickupStartsAt)} até {formatDateTime(details.pickupEndsAt)}
                </dd>
              </div>
            </div>
          </dl>

          <section
            aria-labelledby="establishment-heading"
            className="mt-6 rounded-xl border border-slate-200 p-4 sm:p-5"
          >
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-emerald-700" />
              <h2 id="establishment-heading" className="text-base font-bold text-slate-900">
                Localização e informações do estabelecimento
              </h2>
            </div>

            {details.establishment ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p className="text-base font-semibold text-slate-900">
                  {details.establishment.name}
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span>{formatAddress(details.establishment)}</span>
                </p>
                <div className="flex flex-wrap gap-4 pt-1 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-slate-500" />
                    {details.establishment.phone}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-slate-500" />
                    {details.establishment.email}
                  </span>
                </div>
                {details.establishment.latitude !== null &&
                  details.establishment.longitude !== null && (
                    <div className="pt-2">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${details.establishment.latitude},${details.establishment.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 underline hover:text-emerald-800"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Ver localização no mapa
                      </a>
                    </div>
                  )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Informações do estabelecimento indisponíveis no momento.
              </p>
            )}
          </section>

          <section aria-label="Reserva do lote" className="mt-6 border-t border-slate-200 pt-6">
            {(details.reservable || confirmed) ? (
              <div className="space-y-4">
                {!confirmed && <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label
                      htmlFor="reserve-quantity"
                      className="block text-sm font-semibold text-slate-800"
                    >
                      Quantidade para reserva
                    </label>
                    <input
                      id="reserve-quantity"
                      type="number"
                      min={1}
                      step={1}
                      disabled={pending}
                      max={details.availableQuantity}
                      value={quantity}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setQuantity(Number.isNaN(next) ? 1 : next);
                      }}
                      className="mt-1.5 w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={openConfirmation}
                    disabled={pending}
                    className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    {pending ? 'Confirmando…' : 'Reservar lote'}
                  </button>
                </div>}
                {!dialogOpen && reservationError && <p role="alert" className="text-sm text-red-700">{reservationError}</p>}
                {confirmed && <button type="button" onClick={() => setDialogOpen(true)} className="text-sm font-semibold text-emerald-700 underline">Ver confirmação da reserva</button>}
              </div>
            ) : (
              <div
                role="alert"
                data-testid="reservation-unavailable"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900"
              >
                <p className="font-semibold">
                  {unavailableInfo?.title ?? 'Reservas indisponíveis'}
                </p>
                <p className="mt-1 text-sm text-rose-800">
                  {unavailableInfo?.description ??
                    'Este lote não está disponível para novas reservas no momento.'}
                </p>
              </div>
            )}
          </section>
          <dialog
            ref={dialog}
            aria-labelledby="reservation-dialog-title"
            onCancel={(event) => {
              event.preventDefault();
              if (!pending) setDialogOpen(false);
            }}
            onClose={() => setDialogOpen(false)}
            className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-900/50"
          >
            <h2 id="reservation-dialog-title" className="text-xl font-bold text-slate-900">
              {confirmed ? 'Reserva confirmada' : 'Confirmar reserva'}
            </h2>
            {confirmed ? (
              <div className="mt-4 space-y-5">
                <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{reservationNotice}</p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/painel/receptor" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Ver minhas reservas</Link>
                  <button type="button" onClick={() => setDialogOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Fechar</button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-5">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">{details.name}</p>
                  <p className="mt-1 text-sm text-slate-700">{quantity} unidade(s)</p>
                  <p className="mt-2 text-sm text-slate-600">Retirada de {formatDateTime(details.pickupStartsAt)} até {formatDateTime(details.pickupEndsAt)}.</p>
                </div>
                {reservationError && <p role="alert" className="text-sm text-red-700">{reservationError}</p>}
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={pending} onClick={handleReserve} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                    {pending ? 'Confirmando…' : 'Confirmar reserva'}
                  </button>
                  <button type="button" disabled={pending} onClick={() => setDialogOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-60">Cancelar</button>
                </div>
              </div>
            )}
          </dialog>
        </article>
      </div>
    </main>
  );
}
