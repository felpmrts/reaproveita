'use client';

import type { FormEvent } from 'react';
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';

export type CatalogAvailabilityOption = '' | 'PICKUP_NOW' | 'PICKUP_TODAY';

export interface FoodBatchCatalogFilterState {
  search: string;
  category: string;
  expiresUntil: string;
  availability: CatalogAvailabilityOption;
  minQuantity: string;
}

export const EMPTY_CATALOG_FILTERS: FoodBatchCatalogFilterState = {
  search: '',
  category: '',
  expiresUntil: '',
  availability: '',
  minQuantity: '',
};

const AVAILABILITY_LABELS: Record<Exclude<CatalogAvailabilityOption, ''>, string> = {
  PICKUP_NOW: 'Retirada imediata (agora)',
  PICKUP_TODAY: 'Retirada hoje',
};

export function hasActiveCatalogFilters(filters: FoodBatchCatalogFilterState): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.category.trim().length > 0 ||
    filters.expiresUntil.trim().length > 0 ||
    filters.availability.trim().length > 0 ||
    filters.minQuantity.trim().length > 0
  );
}

export function countActiveCatalogFilters(filters: FoodBatchCatalogFilterState): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.category.trim()) count += 1;
  if (filters.expiresUntil.trim()) count += 1;
  if (filters.availability.trim()) count += 1;
  if (filters.minQuantity.trim()) count += 1;
  return count;
}

export function buildCatalogQueryString(filters: FoodBatchCatalogFilterState): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.category.trim()) params.set('category', filters.category.trim());
  if (filters.expiresUntil.trim()) params.set('expiresUntil', filters.expiresUntil.trim());
  if (filters.availability.trim()) params.set('availability', filters.availability.trim());
  if (filters.minQuantity.trim()) params.set('minQuantity', filters.minQuantity.trim());
  return params.toString();
}

export function buildCatalogApiUrl(filters: FoodBatchCatalogFilterState): string {
  const query = buildCatalogQueryString(filters);
  return query ? `/food-batches?${query}` : '/food-batches';
}

function formatDateInputDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export interface FoodBatchSearchFiltersProps {
  filters: FoodBatchCatalogFilterState;
  appliedFilters: FoodBatchCatalogFilterState;
  categories: string[];
  isLoading: boolean;
  onChange: (next: FoodBatchCatalogFilterState) => void;
  onApply: (next: FoodBatchCatalogFilterState) => void;
  onClear: () => void;
  onRemoveFilter: (field: keyof FoodBatchCatalogFilterState) => void;
}

export function FoodBatchSearchFilters({
  filters,
  appliedFilters,
  categories,
  isLoading,
  onChange,
  onApply,
  onClear,
  onRemoveFilter,
}: FoodBatchSearchFiltersProps) {
  const hasAnyFilter =
    hasActiveCatalogFilters(filters) || hasActiveCatalogFilters(appliedFilters);
  const activeCount = countActiveCatalogFilters(appliedFilters);

  const activeChips: Array<{
    field: keyof FoodBatchCatalogFilterState;
    label: string;
    removeAriaLabel: string;
  }> = [];

  if (appliedFilters.search.trim()) {
    const value = appliedFilters.search.trim();
    activeChips.push({
      field: 'search',
      label: `Busca: "${value}"`,
      removeAriaLabel: 'Remover filtro de busca',
    });
  }
  if (appliedFilters.category.trim()) {
    const value = appliedFilters.category.trim();
    activeChips.push({
      field: 'category',
      label: `Categoria: ${value}`,
      removeAriaLabel: 'Remover filtro de categoria',
    });
  }
  if (appliedFilters.expiresUntil.trim()) {
    const value = formatDateInputDisplay(appliedFilters.expiresUntil);
    activeChips.push({
      field: 'expiresUntil',
      label: `Validade até: ${value}`,
      removeAriaLabel: 'Remover filtro de validade',
    });
  }
  if (appliedFilters.availability) {
    const label = AVAILABILITY_LABELS[appliedFilters.availability];
    activeChips.push({
      field: 'availability',
      label: `Disponibilidade: ${label}`,
      removeAriaLabel: 'Remover filtro de disponibilidade',
    });
  }
  if (appliedFilters.minQuantity.trim()) {
    const value = appliedFilters.minQuantity.trim();
    activeChips.push({
      field: 'minQuantity',
      label: `Qtd. mínima: ${value} un.`,
      removeAriaLabel: 'Remover filtro de quantidade mínima',
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply(filters);
  }

  return (
    <form
      role="search"
      aria-label="Pesquisar e filtrar ofertas"
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
          <span>Pesquisar e filtrar ofertas</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {activeCount} {activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={!hasAnyFilter || isLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpar filtros
        </button>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="catalog-search"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Pesquisar alimento
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="catalog-search"
              name="search"
              type="search"
              value={filters.search}
              onChange={(event) => onChange({ ...filters, search: event.target.value })}
              placeholder="Buscar pelo nome do alimento..."
              maxLength={120}
              className="block w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Search className="h-4 w-4" />
          Buscar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="catalog-category"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Categoria
          </label>
          <select
            id="catalog-category"
            name="category"
            value={filters.category}
            onChange={(event) => {
              const next = { ...filters, category: event.target.value };
              onApply(next);
            }}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="catalog-expires-until"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Data de validade (até)
          </label>
          <input
            id="catalog-expires-until"
            name="expiresUntil"
            type="date"
            value={filters.expiresUntil}
            onChange={(event) => {
              const next = { ...filters, expiresUntil: event.target.value };
              onApply(next);
            }}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label
            htmlFor="catalog-availability"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Disponibilidade
          </label>
          <select
            id="catalog-availability"
            name="availability"
            value={filters.availability}
            onChange={(event) => {
              const next = {
                ...filters,
                availability: event.target.value as CatalogAvailabilityOption,
              };
              onApply(next);
            }}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="">Todas disponíveis</option>
            <option value="PICKUP_NOW">Retirada imediata (agora)</option>
            <option value="PICKUP_TODAY">Retirada hoje</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="catalog-min-quantity"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Quantidade mínima
          </label>
          <input
            id="catalog-min-quantity"
            name="minQuantity"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={filters.minQuantity}
            onChange={(event) => onChange({ ...filters, minQuantity: event.target.value })}
            placeholder="Ex.: 2"
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
      </div>

      {activeChips.length > 0 && (
        <div
          aria-label="Filtros aplicados"
          className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
        >
          {activeChips.map((chip) => (
            <span
              key={chip.field}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                aria-label={chip.removeAriaLabel}
                onClick={() => onRemoveFilter(chip.field)}
                disabled={isLoading}
                className="rounded-full p-0.5 text-emerald-700 transition hover:bg-emerald-200 hover:text-emerald-950 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </form>
  );
}
