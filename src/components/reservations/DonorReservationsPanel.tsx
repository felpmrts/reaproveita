'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  Package,
  Phone,
  RefreshCw,
  Search,
  Store,
  User,
  XCircle,
} from 'lucide-react';
import { formatDateTime } from '@/components/food-batches/food-batch-format';
import type {
  DonorReservationDetails,
  DonorReservationItem,
  DonorReservationsResult,
  DonorReservationsSummary,
  FoodBatchReservationStatus,
} from '@/services/reservation.service';

type StatusFilter = 'ALL' | FoodBatchReservationStatus;

const STATUS_META: Record<
  FoodBatchReservationStatus,
  { label: string; description: string; badgeClass: string }
> = {
  ACTIVE: {
    label: 'Ativa',
    description: 'Aguardando separação e retirada presencial dentro da janela prevista.',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  COMPLETED: {
    label: 'Concluída',
    description: 'Retirada presencial confirmada e contabilizada como alimento resgatado.',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  CANCELLED: {
    label: 'Cancelada',
    description: 'Reserva cancelada antes da retirada.',
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
  },
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  CREATED: 'Reserva criada',
  CANCELLED: 'Reserva cancelada',
  COMPLETED: 'Retirada concluída',
  EXPIRED: 'Reserva expirada',
};

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function DonorReservationsPanel({
  initialData,
}: {
  initialData: DonorReservationsResult;
}) {
  const router = useRouter();
  const detailsDialogRef = useRef<HTMLDialogElement>(null);
  const pickupDialogRef = useRef<HTMLDialogElement>(null);
  const pickupRequestRef = useRef<{ reservationId: string; requestId: string } | null>(null);

  const [data, setData] = useState<DonorReservationsResult>(initialData);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [establishmentFilter, setEstablishmentFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);

  // Confirmação direta por código da reserva (ST19)
  const [codeInput, setCodeInput] = useState('');
  const [codePending, setCodePending] = useState(false);

  // Diálogo de confirmação de retirada no card (ST19)
  const [pickupTarget, setPickupTarget] = useState<DonorReservationItem | null>(null);
  const [pickupPending, setPickupPending] = useState(false);
  const [pickupDialogError, setPickupDialogError] = useState<string | null>(null);

  // Diálogo de consulta de status/histórico (ST18)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<DonorReservationDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const dialog = detailsDialogRef.current;
    if (!dialog) return;

    if (selectedId) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [selectedId]);

  useEffect(() => {
    const dialog = pickupDialogRef.current;
    if (!dialog) return;

    if (pickupTarget) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pickupTarget]);

  const filteredItems = useMemo(() => {
    const normalized = normalizeSearch(searchTerm);
    return data.items.filter((item) => {
      if (establishmentFilter !== 'ALL' && item.establishmentId !== establishmentFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      if (normalized) {
        const haystack = normalizeSearch(
          `${item.id} ${item.batchTitle} ${item.establishmentName} ${item.receiver.name} ${item.receiver.id}`
        );
        if (!haystack.includes(normalized)) return false;
      }
      return true;
    });
  }, [data.items, establishmentFilter, statusFilter, searchTerm]);

  const activeSummary = useMemo<DonorReservationsSummary>(() => {
    const scoped =
      establishmentFilter === 'ALL'
        ? data.items
        : data.items.filter((item) => item.establishmentId === establishmentFilter);

    return scoped.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === 'ACTIVE') {
          acc.active += 1;
          acc.activeUnits += item.quantity;
        } else if (item.status === 'COMPLETED') {
          acc.completed += 1;
          acc.rescuedUnits += item.quantity;
        } else if (item.status === 'CANCELLED') {
          acc.cancelled += 1;
        }
        return acc;
      },
      { total: 0, active: 0, completed: 0, cancelled: 0, activeUnits: 0, rescuedUnits: 0 }
    );
  }, [data.items, establishmentFilter]);

  function applyConfirmedPickup(
    updatedItem: DonorReservationItem,
    updatedSummary?: DonorReservationsSummary
  ) {
    setData((current) => {
      const exists = current.items.some((item) => item.id === updatedItem.id);
      const nextItems = exists
        ? current.items.map((item) => (item.id === updatedItem.id ? updatedItem : item))
        : [updatedItem, ...current.items];

      return {
        ...current,
        items: nextItems,
        summary: updatedSummary ?? current.summary,
      };
    });
  }

  async function executePickupConfirmation(reservationCode: string, requestId: string) {
    const response = await fetch(
      `/api/donor/reservations/${encodeURIComponent(reservationCode)}/confirm-pickup`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId }),
      }
    );

    if (response.status === 401) {
      router.push('/login');
      return null;
    }
    if (response.status === 403) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.error?.message ??
          'Acesso negado. Apenas o responsável pelo estabelecimento pode confirmar esta retirada.'
      );
    }

    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.data) {
      throw new Error(
        body?.error?.message ?? 'Não foi possível confirmar a retirada presencial.'
      );
    }

    const confirmedItem: DonorReservationItem = {
      id: body.data.id,
      batchId: body.data.batchId,
      batchTitle: body.data.batchTitle,
      batchCategory: body.data.batchCategory,
      batchStatus: body.data.batchStatus,
      establishmentId: body.data.establishmentId,
      establishmentName: body.data.establishmentName,
      quantity: body.data.quantity,
      status: body.data.status,
      pickupStartsAt: body.data.pickupStartsAt,
      pickupEndsAt: body.data.pickupEndsAt,
      expiresAt: body.data.expiresAt,
      createdAt: body.data.createdAt,
      cancelledAt: body.data.cancelledAt ?? null,
      cancellationReason: body.data.cancellationReason ?? null,
      completedAt: body.data.completedAt ?? null,
      completedBy: body.data.completedBy ?? null,
      completedByName: body.data.completedByName ?? null,
      receiver: body.data.receiver,
    };

    applyConfirmedPickup(confirmedItem, body.data.summary);

    return {
      message:
        body.message ??
        'Retirada presencial confirmada com sucesso! Indicadores de alimentos resgatados atualizados.',
      item: confirmedItem,
    };
  }

  function openPickupDialog(reservation: DonorReservationItem) {
    if (pickupPending || reservation.status !== 'ACTIVE') return;
    setPickupDialogError(null);
    pickupRequestRef.current = {
      reservationId: reservation.id,
      requestId: crypto.randomUUID(),
    };
    setPickupTarget(reservation);
  }

  function closePickupDialog() {
    if (pickupPending) return;
    setPickupDialogError(null);
    setPickupTarget(null);
    pickupRequestRef.current = null;
  }

  async function handleConfirmPickupFromDialog() {
    if (!pickupTarget || pickupPending) return;
    setPickupPending(true);
    setPickupDialogError(null);
    setActionFeedback(null);

    if (
      !pickupRequestRef.current ||
      pickupRequestRef.current.reservationId !== pickupTarget.id
    ) {
      pickupRequestRef.current = {
        reservationId: pickupTarget.id,
        requestId: crypto.randomUUID(),
      };
    }

    try {
      const outcome = await executePickupConfirmation(
        pickupTarget.id,
        pickupRequestRef.current.requestId
      );
      if (!outcome) return;

      setActionFeedback({ message: outcome.message, isError: false });
      setPickupTarget(null);
      pickupRequestRef.current = null;
      router.refresh();
    } catch (error) {
      pickupRequestRef.current = null;
      setPickupDialogError(
        error instanceof Error
          ? error.message
          : 'Falha de comunicação ao confirmar a retirada. Tente novamente.'
      );
    } finally {
      setPickupPending(false);
    }
  }

  async function handleConfirmByCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (codePending) return;

    const trimmedCode = codeInput.trim();
    if (!trimmedCode) {
      setActionFeedback({
        message: 'Informe o código da reserva apresentado pelo receptor.',
        isError: true,
      });
      return;
    }

    setCodePending(true);
    setActionFeedback(null);

    try {
      const outcome = await executePickupConfirmation(trimmedCode, crypto.randomUUID());
      if (!outcome) return;

      setCodeInput('');
      setActionFeedback({ message: outcome.message, isError: false });
      router.refresh();
    } catch (error) {
      setActionFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'Falha de comunicação ao confirmar a retirada por código.',
        isError: true,
      });
    } finally {
      setCodePending(false);
    }
  }

  async function handleRefresh(nextEstablishmentId = establishmentFilter) {
    setRefreshing(true);
    setListError(null);

    try {
      const params = new URLSearchParams();
      if (nextEstablishmentId !== 'ALL') {
        params.set('establishmentId', nextEstablishmentId);
      }

      const queryString = params.toString();
      const response = await fetch(
        `/api/donor/reservations${queryString ? `?${queryString}` : ''}`,
        { cache: 'no-store' }
      );

      if (response.status === 401) {
        router.push('/login');
        return;
      }
      if (response.status === 403) {
        router.push('/acesso-negado');
        return;
      }

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        throw new Error(
          body?.error?.message ?? 'Não foi possível atualizar a lista de reservas.'
        );
      }

      setData(body.data as DonorReservationsResult);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : 'Falha de comunicação ao atualizar as reservas.'
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleInspectStatus(reservation: DonorReservationItem) {
    setSelectedId(reservation.id);
    setSelectedDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);

    try {
      const response = await fetch(`/api/donor/reservations/${reservation.id}`, {
        cache: 'no-store',
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }
      if (response.status === 403) {
        router.push('/acesso-negado');
        return;
      }

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        throw new Error(
          body?.error?.message ?? 'Não foi possível consultar o status da reserva.'
        );
      }

      const details = body.data as DonorReservationDetails;
      setSelectedDetails(details);

      setData((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === details.id
            ? {
                ...item,
                status: details.status,
                cancelledAt: details.cancelledAt,
                cancellationReason: details.cancellationReason,
                completedAt: details.completedAt,
                completedBy: details.completedBy,
                completedByName: details.completedByName,
              }
            : item
        ),
      }));
    } catch (error) {
      setDetailsError(
        error instanceof Error
          ? error.message
          : 'Falha de comunicação ao consultar o status da reserva.'
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeDetailsDialog() {
    setSelectedId(null);
    setSelectedDetails(null);
    setDetailsError(null);
    setDetailsLoading(false);
  }

  function clearFilters() {
    setStatusFilter('ALL');
    setEstablishmentFilter('ALL');
    setSearchTerm('');
  }

  const hasActiveFilters =
    statusFilter !== 'ALL' || establishmentFilter !== 'ALL' || searchTerm.trim() !== '';

  return (
    <div className="space-y-6">
      <section
        aria-label="Resumo operacional de reservas"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Reservas ativas
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">
            {activeSummary.active}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800">
            {activeSummary.activeUnits}{' '}
            {activeSummary.activeUnits === 1 ? 'unidade' : 'unidades'} para separar
          </p>
        </div>

        <div
          data-testid="rescued-food-indicator"
          className="rounded-xl border border-sky-200 bg-sky-50/70 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            Alimentos resgatados
          </p>
          <p className="mt-1 text-2xl font-bold text-sky-950">
            {activeSummary.rescuedUnits}{' '}
            <span className="text-sm font-semibold">
              {activeSummary.rescuedUnits === 1 ? 'unidade' : 'unidades'}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-sky-800">
            {activeSummary.completed}{' '}
            {activeSummary.completed === 1
              ? 'retirada confirmada'
              : 'retiradas confirmadas'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Canceladas
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {activeSummary.cancelled}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">Liberadas pelo receptor</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Total recebido
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {activeSummary.total}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Em {data.establishments.length}{' '}
            {data.establishments.length === 1
              ? 'estabelecimento'
              : 'estabelecimentos'}
          </p>
        </div>
      </section>

      <section
        aria-label="Confirmar retirada por código"
        className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
      >
        <form onSubmit={handleConfirmByCodeSubmit} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-700" />
            <label
              htmlFor="pickup-reservation-code"
              className="text-sm font-semibold text-emerald-950"
            >
              Confirmar retirada presencial por código da reserva
            </label>
          </div>
          <p className="text-xs text-emerald-800">
            Digite ou cole o código apresentado pelo receptor para dar baixa na reserva e
            contabilizar os alimentos resgatados.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              id="pickup-reservation-code"
              type="text"
              value={codeInput}
              disabled={codePending}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="Ex.: 11111111-1111-4111-8111-111111111111"
              className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={codePending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {codePending ? 'Confirmando…' : 'Confirmar por código'}
            </button>
          </div>
        </form>

        {actionFeedback && (
          <div
            role={actionFeedback.isError ? 'alert' : 'status'}
            className={`mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
              actionFeedback.isError
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-white text-emerald-800'
            }`}
          >
            {actionFeedback.isError ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}
      </section>

      <section
        aria-label="Filtros de reservas recebidas"
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-2">
            {(
              [
                { key: 'ALL', label: `Todas (${activeSummary.total})` },
                { key: 'ACTIVE', label: `Ativas (${activeSummary.active})` },
                { key: 'COMPLETED', label: `Concluídas (${activeSummary.completed})` },
                { key: 'CANCELLED', label: `Canceladas (${activeSummary.cancelled})` },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="donor-reservations-search"
              className="block text-xs font-semibold text-slate-700"
            >
              Buscar por receptor, lote ou código
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="donor-reservations-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Ex.: Maria, Pães ou código da reserva"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          </div>

          {data.establishments.length > 1 && (
            <div>
              <label
                htmlFor="donor-reservations-establishment"
                className="block text-xs font-semibold text-slate-700"
              >
                Estabelecimento
              </label>
              <select
                id="donor-reservations-establishment"
                value={establishmentFilter}
                onChange={(event) => setEstablishmentFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="ALL">Todos os meus estabelecimentos</option>
                {data.establishments.map((est) => (
                  <option key={est.id} value={est.id}>
                    {est.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {listError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {listError}
          </p>
        )}
      </section>

      <section aria-label="Lista de reservas recebidas">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {data.items.length === 0
                ? 'Nenhuma reserva recebida até o momento.'
                : 'Nenhuma reserva encontrada com os filtros aplicados.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {data.items.length === 0
                ? 'Quando receptores reservarem unidades dos lotes do seu estabelecimento, elas aparecerão aqui.'
                : 'Tente limpar os filtros ou atualizar a lista.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {filteredItems.map((res) => {
              const statusInfo = STATUS_META[res.status];
              return (
                <li
                  key={res.id}
                  data-donor-reservation-id={res.id}
                  data-donor-reservation-status={res.status}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">
                          {res.batchTitle}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {res.batchCategory}
                        </span>
                      </div>

                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <Store className="h-3.5 w-3.5 text-slate-400" />
                        {res.establishmentName}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusInfo.badgeClass}`}
                      >
                        {statusInfo.label}
                      </span>

                      {res.status === 'ACTIVE' && (
                        <button
                          type="button"
                          disabled={pickupPending}
                          onClick={() => openPickupDialog(res)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirmar Retirada
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleInspectStatus(res)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        Consultar status
                      </button>
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3.5 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="flex items-center gap-1 font-semibold text-slate-600">
                        <User className="h-3.5 w-3.5 text-emerald-700" />
                        Receptor
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {res.receiver.name}
                      </dd>
                      <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-500">
                        ID: {res.receiver.id}
                      </dd>
                      {res.receiver.phone && (
                        <dd className="mt-0.5 inline-flex items-center gap-1 text-slate-600">
                          <Phone className="h-3 w-3" />
                          {res.receiver.phone}
                        </dd>
                      )}
                    </div>

                    <div>
                      <dt className="flex items-center gap-1 font-semibold text-slate-600">
                        <Package className="h-3.5 w-3.5 text-emerald-700" />
                        Quantidade reservada
                      </dt>
                      <dd className="mt-1 text-sm font-bold text-slate-900">
                        {res.quantity} {res.quantity === 1 ? 'unidade' : 'unidades'}
                      </dd>
                      <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-500">
                        Reserva: {res.id}
                      </dd>
                    </div>

                    <div>
                      <dt className="flex items-center gap-1 font-semibold text-slate-600">
                        <CalendarClock className="h-3.5 w-3.5 text-emerald-700" />
                        Horário previsto para retirada
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {formatDateTime(res.pickupStartsAt)}
                      </dd>
                      <dd className="mt-0.5 text-slate-600">
                        até {formatDateTime(res.pickupEndsAt)}
                      </dd>
                    </div>
                  </dl>

                  {res.status === 'COMPLETED' && res.completedAt && (
                    <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      Retirada confirmada em{' '}
                      <strong>{formatDateTime(res.completedAt)}</strong>
                      {res.completedByName ? (
                        <>
                          {' '}
                          por <strong>{res.completedByName}</strong>
                        </>
                      ) : null}
                      .
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <dialog
        ref={pickupDialogRef}
        aria-labelledby="confirm-pickup-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closePickupDialog();
        }}
        onClose={() => {
          if (!pickupPending) closePickupDialog();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-900/50"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <h3
              id="confirm-pickup-dialog-title"
              className="text-lg font-bold text-slate-900"
            >
              Confirmar retirada presencial
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Confira o código da reserva e os dados do receptor antes de concluir a
              retirada. Esta operação não poderá ser desfeita.
            </p>
          </div>
        </div>

        {pickupTarget && (
          <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 p-3.5 text-sm">
            <p className="font-semibold text-slate-900">{pickupTarget.batchTitle}</p>
            <p className="text-slate-700">
              {pickupTarget.quantity}{' '}
              {pickupTarget.quantity === 1 ? 'unidade' : 'unidades'} · Receptor:{' '}
              <strong>{pickupTarget.receiver.name}</strong>
            </p>
            <p className="break-all font-mono text-xs text-slate-600">
              Código: {pickupTarget.id}
            </p>
          </div>
        )}

        {pickupDialogError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {pickupDialogError}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            disabled={pickupPending}
            onClick={closePickupDialog}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pickupPending}
            onClick={() => void handleConfirmPickupFromDialog()}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {pickupPending ? 'Confirmando…' : 'Confirmar retirada'}
          </button>
        </div>
      </dialog>

      <dialog
        ref={detailsDialogRef}
        aria-labelledby="donor-reservation-status-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDetailsDialog();
        }}
        onClose={() => closeDetailsDialog()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-900/50"
      >
        <h3
          id="donor-reservation-status-title"
          className="text-lg font-bold text-slate-900"
        >
          Status da reserva
        </h3>

        {detailsLoading && (
          <p className="mt-4 text-sm text-slate-600">
            Consultando status atualizado da reserva…
          </p>
        )}

        {detailsError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {detailsError}
          </p>
        )}

        {selectedDetails && !detailsLoading && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3.5">
              <div>
                <p className="font-semibold text-slate-900">
                  {selectedDetails.batchTitle}
                </p>
                <p className="text-xs text-slate-600">
                  {selectedDetails.establishmentName} · {selectedDetails.quantity}{' '}
                  {selectedDetails.quantity === 1 ? 'unidade' : 'unidades'}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[selectedDetails.status].badgeClass}`}
              >
                {STATUS_META[selectedDetails.status].label}
              </span>
            </div>

            <p className="text-xs text-slate-600">
              {STATUS_META[selectedDetails.status].description}
            </p>

            <dl className="grid gap-2 rounded-xl border border-slate-200 p-3.5 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-600">Receptor</dt>
                <dd className="mt-0.5 text-slate-900">{selectedDetails.receiver.name}</dd>
                <dd className="break-all font-mono text-[11px] text-slate-500">
                  {selectedDetails.receiver.id}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Janela de retirada</dt>
                <dd className="mt-0.5 text-slate-900">
                  {formatDateTime(selectedDetails.pickupStartsAt)} até{' '}
                  {formatDateTime(selectedDetails.pickupEndsAt)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Código da reserva</dt>
                <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-700">
                  {selectedDetails.id}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Criada em</dt>
                <dd className="mt-0.5 text-slate-900">
                  {formatDateTime(selectedDetails.createdAt)}
                </dd>
              </div>
              {selectedDetails.completedAt && (
                <div className="sm:col-span-2">
                  <dt className="font-semibold text-sky-700">Confirmação de retirada</dt>
                  <dd className="mt-0.5 text-slate-900">
                    Confirmada em {formatDateTime(selectedDetails.completedAt)}
                    {selectedDetails.completedByName
                      ? ` por ${selectedDetails.completedByName}`
                      : ''}
                  </dd>
                </div>
              )}
            </dl>

            {selectedDetails.cancellationReason && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <span className="font-semibold text-slate-700">
                  Motivo do cancelamento:
                </span>{' '}
                <span className="text-slate-600">
                  {selectedDetails.cancellationReason}
                </span>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Histórico da reserva
              </h4>
              {selectedDetails.history.length === 0 ? (
                <p className="mt-1.5 text-xs text-slate-500">
                  Nenhum evento adicional registrado após a criação da reserva.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selectedDetails.history.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                        <span className="text-slate-500">
                          {formatDateTime(entry.occurredAt)}
                        </span>
                      </div>
                      {entry.action === 'CANCELLED' && (
                        <p className="mt-1 text-slate-600">
                          {entry.restoredToBatch
                            ? `${entry.restoredQuantity} unidade(s) restituída(s) ao lote.`
                            : 'Lote indisponível/expirado — saldo não reaberto.'}
                        </p>
                      )}
                      {entry.action === 'COMPLETED' && (
                        <p className="mt-1 text-sky-800">
                          {entry.quantity} unidade(s) contabilizada(s) como alimento
                          resgatado.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={closeDetailsDialog}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </dialog>
    </div>
  );
}
