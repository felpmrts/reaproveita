import { randomUUID } from 'crypto';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { ManageFoodBatchInput, PublishFoodBatchInput } from '@/schemas/food-batch.schema';

export class FoodBatchPublicationConflict extends Error {}

export type FoodBatchStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'EXPIRED';

export type FoodBatchHistoryReason = 'MANUAL_UPDATE' | 'AUTOMATIC_EXPIRATION';

export type FoodBatch = PublishFoodBatchInput & {
  id: string;
  publishedBy: string;
  publishedAt: string;
  status: FoodBatchStatus;
  revision: number;
  expiredAt?: string | null;
};

export interface FoodBatchHistoryEntry {
  changedAt: string;
  reason: FoodBatchHistoryReason;
  revision: number;
  previous: FoodBatch;
  current: FoodBatch;
}

export interface FoodBatchExpirationResult {
  checkedAt: string;
  expiredCount: number;
  expiredIds: string[];
}

export type FoodBatchReservationBlockReason =
  | 'EXPIRED'
  | 'INACTIVE'
  | 'CLOSED'
  | 'OUT_OF_STOCK'
  | 'NOT_FOUND'
  | 'INVALID_QUANTITY';

export class FoodBatchUnavailableForReservationError extends Error {
  public readonly code: 'BATCH_UNAVAILABLE' | 'BATCH_EXPIRED';
  public readonly reason: FoodBatchReservationBlockReason;

  constructor(reason: FoodBatchReservationBlockReason, message?: string) {
    const defaultMessages: Record<FoodBatchReservationBlockReason, string> = {
      EXPIRED: 'Este lote atingiu o prazo de expiração e teve reservas bloqueadas.',
      INACTIVE: 'Este lote está inativo no momento.',
      CLOSED: 'Este lote foi encerrado pelo estabelecimento doador.',
      OUT_OF_STOCK: 'Não há estoque disponível suficiente para esta reserva.',
      NOT_FOUND: 'Oferta não encontrada para reserva.',
      INVALID_QUANTITY: 'A quantidade solicitada para reserva deve ser um inteiro positivo.',
    };
    super(message ?? defaultMessages[reason]);
    this.name = 'FoodBatchUnavailableForReservationError';
    this.reason = reason;
    this.code = reason === 'EXPIRED' ? 'BATCH_EXPIRED' : 'BATCH_UNAVAILABLE';
  }
}

const store = globalThis as typeof globalThis & {
  foodBatches?: Map<string, FoodBatch>;
  foodBatchHistory?: Map<string, FoodBatchHistoryEntry[]>;
};

const useSupabase = () => isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const selection =
  'id, establishmentId:establishment_id, publishedBy:published_by, publishedAt:published_at, name, category, description, availableQuantity:available_quantity, expiresAt:expires_at, pickupStartsAt:pickup_starts_at, pickupEndsAt:pickup_ends_at, storageConditions:storage_conditions, fitForConsumption:fit_for_consumption, status, revision, expiredAt:expired_at';

function normalizeStoredBatch(batch: FoodBatch): FoodBatch {
  return {
    ...batch,
    status: batch.status ?? 'ACTIVE',
    revision: batch.revision ?? 0,
    expiredAt: batch.expiredAt ?? null,
  };
}

function localBatches(): FoodBatch[] {
  return Array.from(store.foodBatches?.values() ?? [], normalizeStoredBatch).reverse();
}

function expireOverdueFoodBatchesInMemory(now: Date): FoodBatchExpirationResult {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const expiredIds: string[] = [];

  if (!store.foodBatches) {
    return { checkedAt: nowIso, expiredCount: 0, expiredIds };
  }

  for (const [id, stored] of Array.from(store.foodBatches.entries())) {
    const previous = normalizeStoredBatch(stored);
    if (previous.status !== 'ACTIVE' && previous.status !== 'INACTIVE') {
      continue;
    }

    const expiresAtMs = Date.parse(previous.expiresAt);
    const pickupEndsAtMs = Date.parse(previous.pickupEndsAt);
    if (expiresAtMs > nowMs && pickupEndsAtMs > nowMs) {
      continue;
    }

    const current: FoodBatch = {
      ...previous,
      status: 'EXPIRED',
      expiredAt: previous.expiredAt ?? nowIso,
      revision: previous.revision + 1,
    };

    store.foodBatches.set(id, current);
    store.foodBatchHistory ??= new Map();
    const history = store.foodBatchHistory.get(id) ?? [];
    history.push({
      changedAt: nowIso,
      reason: 'AUTOMATIC_EXPIRATION',
      revision: current.revision,
      previous,
      current,
    });
    store.foodBatchHistory.set(id, history);
    expiredIds.push(id);
  }

  return {
    checkedAt: nowIso,
    expiredCount: expiredIds.length,
    expiredIds,
  };
}

function fromHistorySnapshot(raw: Record<string, unknown>): FoodBatch {
  if ('establishmentId' in raw && 'availableQuantity' in raw) {
    return normalizeStoredBatch(raw as unknown as FoodBatch);
  }

  return {
    id: String(raw.id),
    establishmentId: String(raw.establishment_id),
    publishedBy: String(raw.published_by),
    publishedAt: String(raw.published_at),
    name: String(raw.name),
    category: String(raw.category),
    description: String(raw.description),
    availableQuantity: Number(raw.available_quantity),
    expiresAt: String(raw.expires_at),
    pickupStartsAt: String(raw.pickup_starts_at),
    pickupEndsAt: String(raw.pickup_ends_at),
    storageConditions: String(raw.storage_conditions),
    fitForConsumption: Boolean(raw.fit_for_consumption) as true,
    status: (raw.status as FoodBatchStatus) ?? 'ACTIVE',
    revision: Number(raw.revision ?? 0),
    expiredAt: raw.expired_at ? String(raw.expired_at) : null,
  };
}

export async function expireOverdueFoodBatches(
  now: Date = new Date()
): Promise<FoodBatchExpirationResult> {
  if (!useSupabase()) {
    return expireOverdueFoodBatchesInMemory(now);
  }

  const nowIso = now.toISOString();
  const { data, error } = await createSupabaseAdminClient().rpc('expire_overdue_food_batches', {
    reference_time: nowIso,
  });
  if (error) throw new Error(error.message);

  const expiredIds = Array.isArray(data)
    ? data.map((row: { batch_id: string }) => row.batch_id)
    : [];

  return {
    checkedAt: nowIso,
    expiredCount: expiredIds.length,
    expiredIds,
  };
}

export async function getFoodBatchHistory(batchId: string): Promise<FoodBatchHistoryEntry[]> {
  if (!useSupabase()) {
    return [...(store.foodBatchHistory?.get(batchId) ?? [])];
  }

  const { data, error } = await createSupabaseAdminClient()
    .from('food_batch_history')
    .select('changed_at, change_reason, revision, previous, current')
    .eq('batch_id', batchId)
    .order('revision', { ascending: true });
  if (error) throw new Error(error.message);

  return (
    (data as Array<{
      changed_at: string;
      change_reason?: FoodBatchHistoryReason;
      revision: number;
      previous: Record<string, unknown>;
      current: Record<string, unknown>;
    }> | null) ?? []
  ).map((row) => ({
    changedAt: row.changed_at,
    reason: row.change_reason ?? 'MANUAL_UPDATE',
    revision: row.revision,
    previous: fromHistorySnapshot(row.previous),
    current: fromHistorySnapshot(row.current),
  }));
}

export async function assertFoodBatchReservable(
  batchId: string,
  requestedQuantity: number,
  now: Date = new Date()
): Promise<FoodBatch> {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new FoodBatchUnavailableForReservationError('INVALID_QUANTITY');
  }

  if (useSupabase()) {
    const database = createSupabaseAdminClient();
    const { error } = await database.rpc('require_reservable_food_batch', {
      batch_id: batchId,
      requested_quantity: requestedQuantity,
    });

    if (error) {
      if (error.code === '23514') {
        if (error.message?.toLowerCase().includes('expired')) {
          throw new FoodBatchUnavailableForReservationError('EXPIRED');
        }
        const existing = await findFoodBatchById(batchId, now);
        if (!existing) throw new FoodBatchUnavailableForReservationError('NOT_FOUND');
        if (
          existing.status === 'EXPIRED' ||
          Date.parse(existing.expiresAt) <= now.getTime() ||
          Date.parse(existing.pickupEndsAt) <= now.getTime()
        ) {
          throw new FoodBatchUnavailableForReservationError('EXPIRED');
        }
        if (existing.status === 'INACTIVE') {
          throw new FoodBatchUnavailableForReservationError('INACTIVE');
        }
        if (existing.status === 'CLOSED') {
          throw new FoodBatchUnavailableForReservationError('CLOSED');
        }
        throw new FoodBatchUnavailableForReservationError('OUT_OF_STOCK');
      }
      throw new Error(error.message);
    }

    const batch = await findFoodBatchById(batchId, now);
    if (!batch) throw new FoodBatchUnavailableForReservationError('NOT_FOUND');
    return batch;
  }

  expireOverdueFoodBatchesInMemory(now);
  const stored = store.foodBatches?.get(batchId);
  if (!stored) {
    throw new FoodBatchUnavailableForReservationError('NOT_FOUND');
  }

  const batch = normalizeStoredBatch(stored);
  const nowMs = now.getTime();
  if (
    batch.status === 'EXPIRED' ||
    Date.parse(batch.expiresAt) <= nowMs ||
    Date.parse(batch.pickupEndsAt) <= nowMs
  ) {
    throw new FoodBatchUnavailableForReservationError('EXPIRED');
  }
  if (batch.status === 'INACTIVE') {
    throw new FoodBatchUnavailableForReservationError('INACTIVE');
  }
  if (batch.status === 'CLOSED') {
    throw new FoodBatchUnavailableForReservationError('CLOSED');
  }
  if (batch.availableQuantity < requestedQuantity) {
    throw new FoodBatchUnavailableForReservationError('OUT_OF_STOCK');
  }

  return batch;
}

export async function listDonorFoodBatches(
  donorId: string,
  now: Date = new Date()
): Promise<FoodBatch[]> {
  if (!useSupabase()) {
    expireOverdueFoodBatchesInMemory(now);
    return localBatches().filter(({ publishedBy }) => publishedBy === donorId);
  }

  const { data, error } = await createSupabaseAdminClient()
    .from('food_batches')
    .select(selection)
    .eq('published_by', donorId)
    .order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as FoodBatch[];
}

export async function findFoodBatchById(
  id: string,
  now: Date = new Date()
): Promise<FoodBatch | null> {
  if (!useSupabase()) {
    expireOverdueFoodBatchesInMemory(now);
    const batch = store.foodBatches?.get(id);
    if (!batch) return null;
    return normalizeStoredBatch(batch);
  }

  const { data, error } = await createSupabaseAdminClient()
    .from('food_batches')
    .select(selection)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FoodBatch | null) ?? null;
}

export interface AvailableFoodBatchQueryBounds {
  minQuantity?: number;
  expiresFromIso?: string;
  expiresUntilIso?: string;
  pickupStartsBeforeIso?: string;
}

export async function listAvailableFoodBatches(
  now: Date = new Date(),
  bounds?: AvailableFoodBatchQueryBounds
): Promise<FoodBatch[]> {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const minQuantity = bounds?.minQuantity;
  const expiresFromMs = bounds?.expiresFromIso ? Date.parse(bounds.expiresFromIso) : undefined;
  const expiresUntilMs = bounds?.expiresUntilIso ? Date.parse(bounds.expiresUntilIso) : undefined;
  const pickupStartsBeforeMs = bounds?.pickupStartsBeforeIso
    ? Date.parse(bounds.pickupStartsBeforeIso)
    : undefined;

  if (!useSupabase()) {
    expireOverdueFoodBatchesInMemory(now);
    return localBatches().filter((batch) => {
      const expiresAtMs = Date.parse(batch.expiresAt);
      const pickupStartsAtMs = Date.parse(batch.pickupStartsAt);
      const pickupEndsAtMs = Date.parse(batch.pickupEndsAt);

      if (
        batch.status !== 'ACTIVE' ||
        batch.fitForConsumption !== true ||
        batch.availableQuantity <= 0 ||
        expiresAtMs <= nowMs ||
        pickupEndsAtMs <= nowMs
      ) {
        return false;
      }

      if (minQuantity !== undefined && batch.availableQuantity < minQuantity) return false;
      if (expiresFromMs !== undefined && expiresAtMs < expiresFromMs) return false;
      if (expiresUntilMs !== undefined && expiresAtMs > expiresUntilMs) return false;
      if (pickupStartsBeforeMs !== undefined && pickupStartsAtMs > pickupStartsBeforeMs) return false;

      return true;
    });
  }

  let query = createSupabaseAdminClient()
    .from('food_batches')
    .select(selection)
    .eq('status', 'ACTIVE')
    .eq('fit_for_consumption', true)
    .gt('available_quantity', 0)
    .gt('expires_at', nowIso)
    .gt('pickup_ends_at', nowIso);

  if (minQuantity !== undefined) {
    query = query.gte('available_quantity', minQuantity);
  }
  if (bounds?.expiresFromIso) {
    query = query.gte('expires_at', bounds.expiresFromIso);
  }
  if (bounds?.expiresUntilIso) {
    query = query.lte('expires_at', bounds.expiresUntilIso);
  }
  if (bounds?.pickupStartsBeforeIso) {
    query = query.lte('pickup_starts_at', bounds.pickupStartsBeforeIso);
  }

  const { data, error } = await query.order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as FoodBatch[];
}

export function clearFoodBatchesStore(): void {
  store.foodBatches?.clear();
  store.foodBatchHistory?.clear();
}

export async function manageFoodBatch(
  donorId: string,
  id: string,
  { revision, storageConditions, ...changes }: ManageFoodBatchInput,
  now: Date = new Date()
): Promise<FoodBatch | 'missing' | 'conflict'> {
  if (useSupabase()) {
    const database = createSupabaseAdminClient();
    const { data, error } = await database
      .from('food_batches')
      .update({ ...changes, storage_conditions: storageConditions })
      .eq('id', id)
      .eq('published_by', donorId)
      .eq('revision', revision)
      .not('status', 'in', '(CLOSED,EXPIRED)')
      .select(selection)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as FoodBatch;

    const existing = await database
      .from('food_batches')
      .select('id')
      .eq('id', id)
      .eq('published_by', donorId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    return existing.data ? 'conflict' : 'missing';
  }

  expireOverdueFoodBatchesInMemory(now);
  const stored = store.foodBatches?.get(id);
  if (!stored || stored.publishedBy !== donorId) return 'missing';
  const previous = normalizeStoredBatch(stored);
  if (previous.revision !== revision || previous.status === 'CLOSED' || previous.status === 'EXPIRED') {
    return 'conflict';
  }

  const patch = { ...changes, ...(storageConditions === undefined ? {} : { storageConditions }) };
  const changed = Object.entries(patch).some(([field, value]) => previous[field as keyof FoodBatch] !== value);
  if (!changed) return previous;

  const current: FoodBatch = { ...previous, ...patch, revision: revision + 1 };
  store.foodBatchHistory ??= new Map();
  const history = store.foodBatchHistory.get(id) ?? [];
  history.push({
    changedAt: now.toISOString(),
    reason: 'MANUAL_UPDATE',
    revision: current.revision,
    previous,
    current,
  });
  store.foodBatchHistory.set(id, history);
  store.foodBatches?.set(id, current);
  return current;
}

export async function saveFoodBatch(donorId: string, input: PublishFoodBatchInput) {
  if (useSupabase()) {
    const { data, error } = await createSupabaseAdminClient()
      .from('food_batches')
      .insert({
        establishment_id: input.establishmentId,
        published_by: donorId,
        name: input.name,
        category: input.category,
        description: input.description,
        available_quantity: input.availableQuantity,
        expires_at: input.expiresAt,
        pickup_starts_at: input.pickupStartsAt,
        pickup_ends_at: input.pickupEndsAt,
        storage_conditions: input.storageConditions,
        fit_for_consumption: input.fitForConsumption,
      })
      .select('id, published_at')
      .single();

    if (error?.code === '23514' || error?.code === '23503') throw new FoodBatchPublicationConflict();
    if (error || !data) throw new Error(error?.message ?? 'Não foi possível publicar o lote.');
    return { id: data.id as string, publishedAt: data.published_at as string };
  }

  const publishedAt = new Date();
  if (Date.parse(input.expiresAt) <= publishedAt.getTime() || Date.parse(input.pickupEndsAt) <= publishedAt.getTime()) {
    throw new FoodBatchPublicationConflict();
  }

  const id = randomUUID();
  store.foodBatches ??= new Map();
  store.foodBatches.set(id, {
    ...input,
    id,
    publishedBy: donorId,
    publishedAt: publishedAt.toISOString(),
    status: 'ACTIVE',
    revision: 0,
    expiredAt: null,
  });
  return { id, publishedAt: publishedAt.toISOString() };
}
