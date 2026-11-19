'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Clock,
  Package,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Store,
} from 'lucide-react';
import { FOOD_BATCH_CATEGORIES } from '@/schemas/food-batch.schema';
import type { FoodBatchCatalogItem } from '@/services/food-batch.service';
import {
  URGENCY_STYLES,
  formatAvailableQuantity,
  formatDateTime,
  formatTime,
  formatUrgencyDescription,
} from './food-batch-format';
import {
  EMPTY_CATALOG_FILTERS,
  FoodBatchSearchFilters,
  buildCatalogApiUrl,
  buildCatalogQueryString,
  hasActiveCatalogFilters,
  type FoodBatchCatalogFilterState,
} from './FoodBatchSearchFilters';

export interface FoodBatchCatalogProps {
  initialOffers: FoodBatchCatalogItem[];
  initialUpdatedAt: string;
  initialFilters?: Partial<FoodBatchCatalogFilterState>;
  refreshIntervalMs?: number;
  embedded?: boolean;
  syncUrl?: boolean;
  showFilters?: boolean;
  searchDebounceMs?: number;
}

interface CatalogApiResponse {
  success?: boolean;
  data?: FoodBatchCatalogItem[];
  meta?: {
    total?: number;
    updatedAt?: string;
  };
  error?: {
    message?: string;
  };
}

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_SEARCH_DEBOUNCE_MS = 300;
const MAX_TIMEOUT_MS = 2_147_483_647;

function mergeInitialFilters(
  initialFilters?: Partial<FoodBatchCatalogFilterState>
): FoodBatchCatalogFilterState {
  return {
    ...EMPTY_CATALOG_FILTERS,
    ...initialFilters,
    availability:
      initialFilters?.availability === 'PICKUP_NOW' ||
      initialFilters?.availability === 'PICKUP_TODAY'
        ? initialFilters.availability
        : '',
  };
}

export function FoodBatchCatalog({
  initialOffers,
  initialUpdatedAt,
  initialFilters,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  embedded = false,
  syncUrl = false,
  showFilters = true,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: FoodBatchCatalogProps) {
  const normalizedInitialFilters = useMemo(
    () => mergeInitialFilters(initialFilters),
    [initialFilters]
  );

  const [offers, setOffers] = useState<FoodBatchCatalogItem[]>(initialOffers);
  const [updatedAt, setUpdatedAt] = useState<string>(initialUpdatedAt);
  const [draftFilters, setDraftFilters] = useState<FoodBatchCatalogFilterState>(
    normalizedInitialFilters
  );
  const [appliedFilters, setAppliedFilters] = useState<FoodBatchCatalogFilterState>(
    normalizedInitialFilters
  );
  const [discoveredCategories, setDiscoveredCategories] = useState<string[]>(() =>
    initialOffers.map((offer) => offer.category)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const appliedFiltersRef = useRef<FoodBatchCatalogFilterState>(normalizedInitialFilters);
  const debounceTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setOffers(initialOffers);
    setUpdatedAt(initialUpdatedAt);
    setDiscoveredCategories((prev) =>
      Array.from(new Set([...prev, ...initialOffers.map((offer) => offer.category)]))
    );
  }, [initialOffers, initialUpdatedAt]);

  const cancelPendingDebounce = useCallback(() => {
    if (debounceTimerRef.current !== undefined) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => () => cancelPendingDebounce(), [cancelPendingDebounce]);

  const syncUrlToHistory = useCallback(
    (next: FoodBatchCatalogFilterState) => {
      if (!syncUrl || typeof window === 'undefined') return;
      const query = buildCatalogQueryString(next);
      const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
      window.history.replaceState(null, '', nextUrl);
    },
    [syncUrl]
  );

  const fetchOffers = useCallback(async (filtersToFetch: FoodBatchCatalogFilterState) => {
    const requestId = ++requestIdRef.current;
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const response = await fetch(buildCatalogApiUrl(filtersToFetch), { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as CatalogApiResponse | null;

      if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
        throw new Error(
          payload?.error?.message ?? 'Não foi possível atualizar a disponibilidade das ofertas.'
        );
      }

      if (requestId === requestIdRef.current) {
        const fetchedOffers = payload.data;
        setOffers(fetchedOffers);
        setUpdatedAt(payload.meta?.updatedAt ?? new Date().toISOString());
        if (fetchedOffers.length > 0) {
          setDiscoveredCategories((prev) =>
            Array.from(new Set([...prev, ...fetchedOffers.map((offer) => offer.category)]))
          );
        }
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar a disponibilidade das ofertas.'
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsRefreshing(false);
      }
    }
  }, []);

  const refreshOffers = useCallback(() => {
    return fetchOffers(appliedFiltersRef.current);
  }, [fetchOffers]);

  const handleApplyFilters = useCallback(
    (next: FoodBatchCatalogFilterState) => {
      cancelPendingDebounce();
      setDraftFilters(next);
      setAppliedFilters(next);
      appliedFiltersRef.current = next;
      syncUrlToHistory(next);
      void fetchOffers(next);
    },
    [cancelPendingDebounce, fetchOffers, syncUrlToHistory]
  );

  const handleDraftChange = useCallback(
    (next: FoodBatchCatalogFilterState) => {
      setDraftFilters(next);
      cancelPendingDebounce();

      if (searchDebounceMs <= 0) return;

      const trimmedQty = next.minQuantity.trim();
      if (trimmedQty !== '' && !/^[1-9]\d*$/.test(trimmedQty)) {
        return;
      }

      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = undefined;
        setAppliedFilters(next);
        appliedFiltersRef.current = next;
        syncUrlToHistory(next);
        void fetchOffers(next);
      }, searchDebounceMs);
    },
    [cancelPendingDebounce, fetchOffers, searchDebounceMs, syncUrlToHistory]
  );

  const handleClearFilters = useCallback(() => {
    cancelPendingDebounce();
    setDraftFilters(EMPTY_CATALOG_FILTERS);
    setAppliedFilters(EMPTY_CATALOG_FILTERS);
    appliedFiltersRef.current = EMPTY_CATALOG_FILTERS;
    syncUrlToHistory(EMPTY_CATALOG_FILTERS);
    void fetchOffers(EMPTY_CATALOG_FILTERS);
  }, [cancelPendingDebounce, fetchOffers, syncUrlToHistory]);

  const handleRemoveFilter = useCallback(
    (field: keyof FoodBatchCatalogFilterState) => {
      const next: FoodBatchCatalogFilterState = {
        ...appliedFiltersRef.current,
        [field]: '',
      };
      handleApplyFilters(next);
    },
    [handleApplyFilters]
  );

  useEffect(() => {
    if (refreshIntervalMs <= 0) return;

    const intervalId = window.setInterval(() => {
      void refreshOffers();
    }, refreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [refreshIntervalMs, refreshOffers]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refreshOffers();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshOffers]);

  useEffect(() => {
    const nowMs = Date.now();
    let earliestDeadline: number | null = null;

    for (const offer of offers) {
      const deadline = Math.min(Date.parse(offer.expiresAt), Date.parse(offer.pickupEndsAt));
      if (Number.isFinite(deadline) && deadline > nowMs) {
        if (earliestDeadline === null || deadline < earliestDeadline) {
          earliestDeadline = deadline;
        }
      }
    }

    if (earliestDeadline === null) return;

    const delay = Math.min(Math.max(1, earliestDeadline - nowMs), MAX_TIMEOUT_MS);
    const timer = window.setTimeout(() => {
      const currentTime = Date.now();
      setOffers((prev) =>
        prev.filter((offer) => {
          const deadline = Math.min(Date.parse(offer.expiresAt), Date.parse(offer.pickupEndsAt));
          return Number.isFinite(deadline) && deadline > currentTime;
        })
      );
      void refreshOffers();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [offers, refreshOffers]);

  const categories = useMemo(() => {
    const extra = [draftFilters.category.trim(), appliedFilters.category.trim()].filter(Boolean);
    return Array.from(new Set([...FOOD_BATCH_CATEGORIES, ...discoveredCategories, ...extra]));
  }, [appliedFilters.category, discoveredCategories, draftFilters.category]);

  const countLabel =
    offers.length === 1 ? '1 oferta disponível' : `${offers.length} ofertas disponíveis`;
  const filtersApplied = hasActiveCatalogFilters(appliedFilters);

  return (
    <div className="space-y-4">
      {showFilters && (
        <FoodBatchSearchFilters
          filters={draftFilters}
          appliedFilters={appliedFilters}
          categories={categories}
          isLoading={isRefreshing}
          onChange={handleDraftChange}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
          onRemoveFilter={handleRemoveFilter}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span role="status" aria-live="polite" className="font-semibold text-slate-900">
            {countLabel}
          </span>
          <span className="text-xs text-slate-500">
            Atualizado às {formatTime(updatedAt)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void refreshOffers()}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Atualizando...' : 'Atualizar ofertas'}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-700" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshOffers()}
            disabled={isRefreshing}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {offers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <PackageOpen className="h-6 w-6" />
          </div>
          {filtersApplied ? (
            <>
              <h2 className="mt-4 text-lg font-bold text-slate-900">
                Nenhuma oferta encontrada para os filtros aplicados
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
                Tente ajustar os termos de busca ou limpar os filtros para visualizar todas as
                ofertas disponíveis.
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                disabled={isRefreshing}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros e ver todas
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-lg font-bold text-slate-900">
                Nenhuma oferta disponível no momento
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
                Não há lotes ativos e elegíveis para reserva agora. Atualize a lista em alguns
                instantes para verificar novas publicações.
              </p>
              <button
                type="button"
                onClick={() => void refreshOffers()}
                disabled={isRefreshing}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Atualizando...' : 'Atualizar ofertas'}
              </button>
            </>
          )}
        </div>
      ) : (
        <div
          className={
            embedded ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-4 md:grid-cols-2'
          }
        >
          {offers.map((offer) => {
            const urgencyStyle = URGENCY_STYLES[offer.urgency.level];
            const UrgencyIcon = urgencyStyle.icon;

            return (
              <article
                key={offer.id}
                data-testid={`offer-card-${offer.id}`}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {offer.category}
                    </span>

                    <span
                      data-testid="urgency-indicator"
                      data-urgency-level={offer.urgency.level}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${urgencyStyle.badge}`}
                    >
                      <UrgencyIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatUrgencyDescription(offer.urgency)}</span>
                    </span>
                  </div>

                  <h2 className="mt-3 break-words text-lg font-bold text-slate-900">
                    {offer.name}
                  </h2>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">
                    {offer.description}
                  </p>

                  <dl className="mt-4 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <div>
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Disponibilidade
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                          {formatAvailableQuantity(offer.availableQuantity)}
                        </dd>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <div>
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Validade
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                          {formatDateTime(offer.expiresAt)}
                        </dd>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <div>
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Janela de retirada
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                          {formatDateTime(offer.pickupStartsAt)} até{' '}
                          {formatDateTime(offer.pickupEndsAt)}
                        </dd>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 sm:col-span-2">
                      <Store className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <div>
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Estabelecimento
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                          {offer.establishment ? (
                            <>
                              <span>{offer.establishment.name}</span>
                              <span className="block text-xs font-normal text-slate-600">
                                {offer.establishment.neighborhood}, {offer.establishment.city}/
                                {offer.establishment.state}
                              </span>
                            </>
                          ) : (
                            <span className="font-normal text-slate-600">
                              Estabelecimento indisponível
                            </span>
                          )}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                  <Link
                    href={`/lotes/${offer.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                  >
                    Ver detalhes
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
