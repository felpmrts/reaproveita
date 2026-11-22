'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { formatDateTime } from '@/components/food-batches/food-batch-format';

import type { ReceiverReservationDetails } from '@/types/reservation';

export type ReceiverReservationItem = ReceiverReservationDetails;

const STATUS_META: Record<
  ReceiverReservationItem['status'],
  { label: string; badgeClass: string }
> = {
  ACTIVE: {
    label: 'Ativa',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  CANCELLED: {
    label: 'Cancelada',
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  COMPLETED: {
    label: 'Concluída',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
  },
};

export function ReceiverReservationsList({
  initialReservations,
}: {
  initialReservations: ReceiverReservationItem[];
}) {
  const router = useRouter();
  const push = router.push;
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [reservations, setReservations] =
    useState<ReceiverReservationItem[]>(initialReservations);
  const [selectedReservation, setSelectedReservation] =
    useState<ReceiverReservationItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);

  useEffect(() => {
    setReservations(initialReservations);
  }, [initialReservations]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (selectedReservation) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [selectedReservation]);

  useEffect(() => {
    if (pending || selectedReservation) return;
    const controller = new AbortController();
    let loading = false;

    async function refreshReservations() {
      if (loading) return;
      loading = true;
      setRefreshing(true);
      try {
        const response = await fetch('/api/receiver/reservations', {
          cache: 'no-store', signal: controller.signal,
        });
        if (response.status === 401) {
          push('/login');
          return;
        }
        const body = await response.json();
        if (!response.ok) throw new Error('Não foi possível atualizar suas reservas.');
        if (!controller.signal.aborted) {
          setReservations(body.data);
          setRefreshError(null);
        }
      } catch {
        if (!controller.signal.aborted) setRefreshError('Não foi possível atualizar suas reservas. Tente novamente.');
      } finally {
        loading = false;
        if (!controller.signal.aborted) setRefreshing(false);
      }
    }

    if (refreshKey > 0) void refreshReservations();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshReservations();
    }, 30000);
    function onFocus() { void refreshReservations(); }
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [pending, selectedReservation, refreshKey, push]);

  function openCancelDialog(reservation: ReceiverReservationItem) {
    if (pending || reservation.status !== 'ACTIVE') return;
    setDialogError(null);
    setReason('');
    setSelectedReservation(reservation);
  }

  function closeCancelDialog() {
    if (pending) return;
    setDialogError(null);
    setReason('');
    setSelectedReservation(null);
  }

  async function handleConfirmCancel() {
    if (!selectedReservation || pending) return;
    setPending(true);
    setDialogError(null);
    setFeedback(null);

    const trimmedReason = reason.trim();
    const payload: { status: 'CANCELLED'; reason?: string } = {
      status: 'CANCELLED',
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    };

    try {
      const response = await fetch(
        `/api/receiver/reservations/${selectedReservation.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? 'Não foi possível cancelar a reserva.'
        );
      }

      const cancelledAt: string | null =
        body?.data?.cancelledAt ?? new Date().toISOString();
      const cancellationReason: string | null =
        body?.data?.cancellationReason ?? (trimmedReason || null);

      setReservations((current) =>
        current.map((item) =>
          item.id === selectedReservation.id
            ? {
                ...item,
                status: 'CANCELLED',
                cancelledAt,
                cancellationReason,
              }
            : item
        )
      );

      setFeedback({
        message:
          body?.message ??
          'Reserva cancelada com sucesso.',
        isError: false,
      });
      setSelectedReservation(null);
      setReason('');
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha de comunicação ao cancelar a reserva. Tente novamente.';
      setDialogError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label="Minhas Reservas"
      className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Minhas Reservas ({reservations.length})
        </h2>
        <button type="button" disabled={refreshing || pending || !!selectedReservation}
          onClick={() => setRefreshKey((key) => key + 1)}
          className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60">
          {refreshing ? 'Atualizando…' : 'Atualizar reservas'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Atualização automática a cada 30 segundos.</p>
      {refreshError && <p role="alert" className="mt-2 text-sm text-red-700">{refreshError}</p>}

      {feedback && (
        <div
          role={feedback.isError ? 'alert' : 'status'}
          className={`mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
            feedback.isError
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback.isError ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {reservations.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Você ainda não possui reservas vinculadas ao seu perfil.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {reservations.map((res) => {
            const statusInfo = STATUS_META[res.status];
            return (
              <li
                key={res.id}
                data-reservation-id={res.id}
                data-reservation-status={res.status}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {res.batchId ? (
                      <Link
                        href={`/lotes/${res.batchId}`}
                        className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                      >
                        {res.batchTitle}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-900">
                        {res.batchTitle}
                      </span>
                    )}
                    <span className="text-slate-400">·</span>
                    <span className="font-medium text-slate-700">
                      {res.quantity}{' '}
                      {res.quantity === 1 ? 'unidade' : 'unidades'}
                    </span>
                  </div>

                  <p className="mt-1 break-all text-xs text-slate-500">
                    Código da reserva: <span className="font-mono">{res.id}</span>
                  </p>

                  <dl className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-slate-800">Estabelecimento e endereço</dt>
                      <dd className="mt-1 break-words text-slate-600">
                        {res.establishment ? (
                          <><span className="block font-medium text-slate-900">{res.establishment.name}</span>{res.establishment.address}</>
                        ) : 'Informações do estabelecimento indisponíveis.'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-800">Janela de retirada (Brasília)</dt>
                      <dd className="mt-1 text-slate-600">
                        {res.pickupStartsAt && res.pickupEndsAt
                          ? formatDateTime(res.pickupStartsAt) + ' até ' + formatDateTime(res.pickupEndsAt)
                          : 'Período de retirada indisponível.'}
                      </dd>
                    </div>
                  </dl>

                  {res.createdAt && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Reservada em {formatDateTime(res.createdAt)}
                      {res.cancelledAt
                        ? ` · Cancelada em ${formatDateTime(res.cancelledAt)}`
                        : ''}
                    </p>
                  )}

                  {res.cancellationReason && (
                    <p className="mt-1 text-xs text-slate-600">
                      Motivo: {res.cancellationReason}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusInfo.badgeClass}`}
                  >
                    {statusInfo.label}
                  </span>

                  {res.status === 'ACTIVE' && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => openCancelDialog(res)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1 disabled:opacity-60"
                    >
                      Cancelar reserva
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="cancel-reservation-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeCancelDialog();
        }}
        onClose={() => {
          if (!pending) setSelectedReservation(null);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-900/50"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h3
              id="cancel-reservation-dialog-title"
              className="text-lg font-bold text-slate-900"
            >
              Cancelar reserva
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Tem certeza de que deseja cancelar esta reserva? Se o lote ainda
              estiver válido, a quantidade será liberada automaticamente para
              outros receptores.
            </p>
          </div>
        </div>

        {selectedReservation && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3.5 text-sm">
            <p className="font-semibold text-slate-900">
              {selectedReservation.batchTitle}
            </p>
            <p className="mt-0.5 text-slate-700">
              {selectedReservation.quantity}{' '}
              {selectedReservation.quantity === 1 ? 'unidade' : 'unidades'}
            </p>
          </div>
        )}

        <div className="mt-4">
          <label
            htmlFor="cancel-reservation-reason"
            className="block text-xs font-semibold text-slate-700"
          >
            Motivo do cancelamento (opcional)
          </label>
          <textarea
            id="cancel-reservation-reason"
            rows={2}
            maxLength={300}
            disabled={pending}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: Não conseguirei comparecer na janela de retirada."
            className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
          />
        </div>

        {dialogError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {dialogError}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            disabled={pending}
            onClick={closeCancelDialog}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Manter reserva
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleConfirmCancel}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      </dialog>
    </section>
  );
}
