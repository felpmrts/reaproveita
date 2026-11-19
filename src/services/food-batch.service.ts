import { getEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  assertFoodBatchReservable,
  expireOverdueFoodBatches,
  findFoodBatchById,
  FoodBatchUnavailableForReservationError,
  getFoodBatchHistory,
  listAvailableFoodBatches,
  type AvailableFoodBatchQueryBounds,
  type FoodBatch,
  type FoodBatchExpirationResult,
  type FoodBatchHistoryEntry,
  type FoodBatchStatus,
} from '@/repositories/food-batch.repository';
import {
  resolveCatalogDateEndMs,
  resolveCatalogDateStartMs,
  type FoodBatchCatalogQuery,
} from '@/schemas/food-batch.schema';
import type { EstablishmentEntity } from '@/types/establishment';

export {
  FoodBatchUnavailableForReservationError,
  getFoodBatchHistory,
  type FoodBatchExpirationResult,
  type FoodBatchHistoryEntry,
};

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'EXPIRED';

export type FoodBatchUnavailableReason = 'EXPIRED' | 'INACTIVE' | 'CLOSED' | 'OUT_OF_STOCK';

export interface FoodBatchUrgency {
  level: UrgencyLevel;
  label: string;
  hoursRemaining: number;
}

export interface FoodBatchEstablishmentSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}

export interface FoodBatchDetails extends FoodBatch {
  establishment: FoodBatchEstablishmentSummary | null;
  urgency: FoodBatchUrgency;
  isExpired: boolean;
  reservable: boolean;
  unavailableReason: FoodBatchUnavailableReason | null;
}

export interface FoodBatchCatalogEstablishment {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface FoodBatchCatalogItem {
  id: string;
  establishmentId: string;
  name: string;
  category: string;
  description: string;
  availableQuantity: number;
  expiresAt: string;
  pickupStartsAt: string;
  pickupEndsAt: string;
  publishedAt: string;
  status: 'ACTIVE';
  revision: number;
  establishment: FoodBatchCatalogEstablishment | null;
  urgency: FoodBatchUrgency;
  reservable: true;
}

export interface FoodBatchCatalogResult {
  items: FoodBatchCatalogItem[];
  total: number;
  updatedAt: string;
}

export type FoodBatchCatalogFilters = FoodBatchCatalogQuery;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const saoPauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Computes the urgency indicator for a food batch based on the earliest deadline
 * between expiration and pickup window end.
 */
export function calculateFoodBatchUrgency(
  batch: Pick<FoodBatch, 'expiresAt' | 'pickupEndsAt'> & { status?: FoodBatchStatus },
  now: Date = new Date()
): FoodBatchUrgency {
  if (batch.status === 'EXPIRED') {
    return { level: 'EXPIRED', label: 'Expirado', hoursRemaining: 0 };
  }

  const deadlineMs = Math.min(Date.parse(batch.expiresAt), Date.parse(batch.pickupEndsAt));
  const remainingMs = deadlineMs - now.getTime();

  if (Number.isNaN(remainingMs) || remainingMs <= 0) {
    return { level: 'EXPIRED', label: 'Expirado', hoursRemaining: 0 };
  }

  const hoursRemaining = Math.max(1, Math.ceil(remainingMs / HOUR_MS));

  if (remainingMs <= 2 * HOUR_MS) {
    return { level: 'CRITICAL', label: 'Urgência máxima', hoursRemaining };
  }
  if (remainingMs <= 6 * HOUR_MS) {
    return { level: 'HIGH', label: 'Alta urgência', hoursRemaining };
  }
  if (remainingMs <= 24 * HOUR_MS) {
    return { level: 'MEDIUM', label: 'Urgência moderada', hoursRemaining };
  }

  return { level: 'LOW', label: 'Prazo confortável', hoursRemaining };
}

/**
 * Evaluates whether a food batch can currently be reserved and why it may be unavailable.
 */
export function evaluateFoodBatchAvailability(
  batch: Pick<FoodBatch, 'status' | 'availableQuantity' | 'expiresAt' | 'pickupEndsAt'>,
  now: Date = new Date()
): { isExpired: boolean; reservable: boolean; unavailableReason: FoodBatchUnavailableReason | null } {
  const nowMs = now.getTime();
  const isExpired =
    batch.status === 'EXPIRED' ||
    Date.parse(batch.expiresAt) <= nowMs ||
    Date.parse(batch.pickupEndsAt) <= nowMs;

  if (batch.status === 'EXPIRED') {
    return { isExpired: true, reservable: false, unavailableReason: 'EXPIRED' };
  }
  if (batch.status === 'INACTIVE') {
    return { isExpired, reservable: false, unavailableReason: 'INACTIVE' };
  }
  if (batch.status === 'CLOSED') {
    return { isExpired, reservable: false, unavailableReason: 'CLOSED' };
  }
  if (isExpired) {
    return { isExpired: true, reservable: false, unavailableReason: 'EXPIRED' };
  }
  if (batch.availableQuantity <= 0) {
    return { isExpired: false, reservable: false, unavailableReason: 'OUT_OF_STOCK' };
  }

  return { isExpired: false, reservable: true, unavailableReason: null };
}

function toEstablishmentSummary(establishment: EstablishmentEntity): FoodBatchEstablishmentSummary {
  return {
    id: establishment.id,
    name: establishment.name,
    phone: establishment.phone,
    email: establishment.email,
    zipCode: establishment.zipCode,
    street: establishment.street,
    number: establishment.number,
    complement: establishment.complement ?? null,
    neighborhood: establishment.neighborhood,
    city: establishment.city,
    state: establishment.state,
    latitude: establishment.latitude ?? null,
    longitude: establishment.longitude ?? null,
  };
}

function toCatalogEstablishmentSummary(establishment: EstablishmentEntity): FoodBatchCatalogEstablishment {
  return {
    id: establishment.id,
    name: establishment.name,
    neighborhood: establishment.neighborhood,
    city: establishment.city,
    state: establishment.state,
  };
}

function getEffectiveDeadlineMs(batch: Pick<FoodBatch, 'expiresAt' | 'pickupEndsAt'>): number {
  return Math.min(Date.parse(batch.expiresAt), Date.parse(batch.pickupEndsAt));
}

/**
 * Checks whether a food batch is eligible to appear in the active offers catalog.
 */
export function isFoodBatchEligibleForCatalog(
  batch: Pick<FoodBatch, 'status' | 'availableQuantity' | 'expiresAt' | 'pickupEndsAt' | 'fitForConsumption'>,
  now: Date = new Date()
): boolean {
  return batch.fitForConsumption === true && evaluateFoodBatchAvailability(batch, now).reservable;
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getEndOfSaoPauloDayMs(now: Date): number {
  const todaySp = saoPauloDateFormatter.format(now);
  return Date.parse(`${todaySp}T23:59:59.999-03:00`);
}

function resolveValidityPresetUpperBoundMs(
  validity: NonNullable<FoodBatchCatalogFilters['validity']>,
  now: Date
): number {
  switch (validity) {
    case 'TODAY':
      return getEndOfSaoPauloDayMs(now);
    case 'NEXT_24H':
      return now.getTime() + 24 * HOUR_MS;
    case 'NEXT_48H':
      return now.getTime() + 48 * HOUR_MS;
    case 'NEXT_7D':
      return now.getTime() + 7 * DAY_MS;
  }
}

/**
 * Evaluates whether a food batch matches all active search and filter criteria.
 */
export function matchesFoodBatchCatalogFilters(
  batch: Pick<
    FoodBatch,
    'name' | 'category' | 'availableQuantity' | 'expiresAt' | 'pickupStartsAt' | 'pickupEndsAt'
  >,
  filters: FoodBatchCatalogFilters,
  now: Date = new Date()
): boolean {
  if (filters.search) {
    if (!normalizeSearchText(batch.name).includes(normalizeSearchText(filters.search))) {
      return false;
    }
  }

  if (filters.category) {
    if (normalizeSearchText(batch.category) !== normalizeSearchText(filters.category)) {
      return false;
    }
  }

  const expiresAtMs = Date.parse(batch.expiresAt);
  if (filters.expiresFrom && expiresAtMs < resolveCatalogDateStartMs(filters.expiresFrom)) {
    return false;
  }
  if (filters.expiresUntil && expiresAtMs > resolveCatalogDateEndMs(filters.expiresUntil)) {
    return false;
  }
  if (filters.validity && expiresAtMs > resolveValidityPresetUpperBoundMs(filters.validity, now)) {
    return false;
  }

  if (filters.minQuantity !== undefined && batch.availableQuantity < filters.minQuantity) {
    return false;
  }

  if (filters.availability === 'PICKUP_NOW') {
    const startsAtMs = Date.parse(batch.pickupStartsAt);
    const endsAtMs = Date.parse(batch.pickupEndsAt);
    if (startsAtMs > now.getTime() || endsAtMs <= now.getTime()) {
      return false;
    }
  } else if (filters.availability === 'PICKUP_TODAY') {
    const startsAtMs = Date.parse(batch.pickupStartsAt);
    const endsAtMs = Date.parse(batch.pickupEndsAt);
    if (startsAtMs > getEndOfSaoPauloDayMs(now) || endsAtMs <= now.getTime()) {
      return false;
    }
  }

  return true;
}

function buildCatalogQueryBounds(
  filters: FoodBatchCatalogFilters,
  now: Date
): AvailableFoodBatchQueryBounds {
  const upperExpiresCandidates: number[] = [];
  if (filters.expiresUntil) {
    upperExpiresCandidates.push(resolveCatalogDateEndMs(filters.expiresUntil));
  }
  if (filters.validity) {
    upperExpiresCandidates.push(resolveValidityPresetUpperBoundMs(filters.validity, now));
  }

  const expiresUntilMs =
    upperExpiresCandidates.length > 0 ? Math.min(...upperExpiresCandidates) : undefined;

  let pickupStartsBeforeIso: string | undefined;
  if (filters.availability === 'PICKUP_NOW') {
    pickupStartsBeforeIso = now.toISOString();
  } else if (filters.availability === 'PICKUP_TODAY') {
    pickupStartsBeforeIso = new Date(getEndOfSaoPauloDayMs(now)).toISOString();
  }

  return {
    minQuantity: filters.minQuantity,
    expiresFromIso: filters.expiresFrom
      ? new Date(resolveCatalogDateStartMs(filters.expiresFrom)).toISOString()
      : undefined,
    expiresUntilIso:
      expiresUntilMs !== undefined ? new Date(expiresUntilMs).toISOString() : undefined,
    pickupStartsBeforeIso,
  };
}

/**
 * Lists currently active and reservable food batches matching the given filters,
 * with summarized establishment data and urgency sorting.
 */
export async function listActiveFoodBatchCatalog(now?: Date): Promise<FoodBatchCatalogResult>;
export async function listActiveFoodBatchCatalog(
  filters: FoodBatchCatalogFilters,
  now?: Date
): Promise<FoodBatchCatalogResult>;
export async function listActiveFoodBatchCatalog(
  filtersOrNow: FoodBatchCatalogFilters | Date = {},
  nowArg?: Date
): Promise<FoodBatchCatalogResult> {
  const filters: FoodBatchCatalogFilters = filtersOrNow instanceof Date ? {} : filtersOrNow;
  const now: Date = filtersOrNow instanceof Date ? filtersOrNow : (nowArg ?? new Date());

  const bounds = buildCatalogQueryBounds(filters, now);
  const batches = await listAvailableFoodBatches(now, bounds);
  const establishmentIds = Array.from(new Set(batches.map((batch) => batch.establishmentId)));
  const establishments =
    establishmentIds.length > 0 ? await getEstablishmentRepository().findByIds(establishmentIds) : [];
  const establishmentsById = new Map(establishments.map((est) => [est.id, est]));

  const items: FoodBatchCatalogItem[] = batches
    .filter((batch) => {
      if (!isFoodBatchEligibleForCatalog(batch, now)) return false;
      const establishment = establishmentsById.get(batch.establishmentId);
      if (establishment && establishment.status !== 'APPROVED') return false;
      return matchesFoodBatchCatalogFilters(batch, filters, now);
    })
    .map((batch) => {
      const establishment = establishmentsById.get(batch.establishmentId);
      return {
        id: batch.id,
        establishmentId: batch.establishmentId,
        name: batch.name,
        category: batch.category,
        description: batch.description,
        availableQuantity: batch.availableQuantity,
        expiresAt: batch.expiresAt,
        pickupStartsAt: batch.pickupStartsAt,
        pickupEndsAt: batch.pickupEndsAt,
        publishedAt: batch.publishedAt,
        status: 'ACTIVE' as const,
        revision: batch.revision,
        establishment: establishment ? toCatalogEstablishmentSummary(establishment) : null,
        urgency: calculateFoodBatchUrgency(batch, now),
        reservable: true as const,
      };
    })
    .sort((a, b) => {
      const deadlineDiff = getEffectiveDeadlineMs(a) - getEffectiveDeadlineMs(b);
      if (deadlineDiff !== 0) return deadlineDiff;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });

  return {
    items,
    total: items.length,
    updatedAt: now.toISOString(),
  };
}

/**
 * Runs the automatic expiration sweep for overdue active or inactive food batches.
 */
export async function runFoodBatchExpirationSweep(
  now: Date = new Date()
): Promise<FoodBatchExpirationResult> {
  return expireOverdueFoodBatches(now);
}

/**
 * Validates whether a food batch can receive a reservation for the requested quantity.
 */
export async function validateFoodBatchForReservation(
  batchId: string,
  requestedQuantity: number,
  now: Date = new Date()
): Promise<FoodBatch> {
  return assertFoodBatchReservable(batchId, requestedQuantity, now);
}

/**
 * Loads full details for a food batch, including establishment info, urgency, and reservability.
 */
export async function getFoodBatchDetails(
  id: string,
  now: Date = new Date()
): Promise<FoodBatchDetails | null> {
  const batch = await findFoodBatchById(id, now);
  if (!batch) return null;

  const establishment = await getEstablishmentRepository().findById(batch.establishmentId);
  const urgency = calculateFoodBatchUrgency(batch, now);
  const availability = evaluateFoodBatchAvailability(batch, now);

  return {
    ...batch,
    establishment: establishment ? toEstablishmentSummary(establishment) : null,
    urgency,
    ...availability,
  };
}
