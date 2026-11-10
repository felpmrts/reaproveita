import { randomUUID } from 'crypto';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { ManageFoodBatchInput, PublishFoodBatchInput } from '@/schemas/food-batch.schema';

export class FoodBatchPublicationConflict extends Error {}

export type FoodBatch = PublishFoodBatchInput & {
  id: string;
  publishedBy: string;
  publishedAt: string;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  revision: number;
};

const store = globalThis as typeof globalThis & {
  foodBatches?: Map<string, FoodBatch>;
  foodBatchHistory?: Map<string, Array<{ changedAt: string; previous: FoodBatch; current: FoodBatch }>>;
};

const useSupabase = () => isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const selection = 'id, establishmentId:establishment_id, publishedBy:published_by, publishedAt:published_at, name, category, description, availableQuantity:available_quantity, expiresAt:expires_at, pickupStartsAt:pickup_starts_at, pickupEndsAt:pickup_ends_at, storageConditions:storage_conditions, fitForConsumption:fit_for_consumption, status, revision';

function localBatches(): FoodBatch[] {
  return Array.from(store.foodBatches?.values() ?? [], (batch) => ({
    ...batch, status: batch.status ?? 'ACTIVE', revision: batch.revision ?? 0,
  })).reverse();
}

export async function listDonorFoodBatches(donorId: string): Promise<FoodBatch[]> {
  if (!useSupabase()) return localBatches().filter(({ publishedBy }) => publishedBy === donorId);

  const { data, error } = await createSupabaseAdminClient().from('food_batches').select(selection)
    .eq('published_by', donorId).order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as FoodBatch[];
}

export async function listAvailableFoodBatches(): Promise<FoodBatch[]> {
  const now = new Date();
  if (!useSupabase()) {
    return localBatches().filter((batch) => batch.status === 'ACTIVE' && batch.availableQuantity > 0
      && Date.parse(batch.expiresAt) > now.getTime() && Date.parse(batch.pickupEndsAt) > now.getTime());
  }

  const { data, error } = await createSupabaseAdminClient().from('food_batches').select(selection)
    .eq('status', 'ACTIVE').gt('available_quantity', 0).gt('expires_at', now.toISOString())
    .gt('pickup_ends_at', now.toISOString()).order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as FoodBatch[];
}

export async function manageFoodBatch(
  donorId: string,
  id: string,
  { revision, storageConditions, ...changes }: ManageFoodBatchInput
): Promise<FoodBatch | 'missing' | 'conflict'> {
  if (useSupabase()) {
    const database = createSupabaseAdminClient();
    const { data, error } = await database.from('food_batches')
      .update({ ...changes, storage_conditions: storageConditions })
      .eq('id', id).eq('published_by', donorId).eq('revision', revision).neq('status', 'CLOSED')
      .select(selection).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as FoodBatch;

    const existing = await database.from('food_batches').select('id')
      .eq('id', id).eq('published_by', donorId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    return existing.data ? 'conflict' : 'missing';
  }

  const stored = store.foodBatches?.get(id);
  if (!stored || stored.publishedBy !== donorId) return 'missing';
  const previous = { ...stored, status: stored.status ?? 'ACTIVE', revision: stored.revision ?? 0 };
  if (previous.revision !== revision || previous.status === 'CLOSED') return 'conflict';

  const patch = { ...changes, ...(storageConditions === undefined ? {} : { storageConditions }) };
  const changed = Object.entries(patch).some(([field, value]) => previous[field as keyof FoodBatch] !== value);
  if (!changed) return previous;

  const current = { ...previous, ...patch, revision: revision + 1 };
  store.foodBatchHistory ??= new Map();
  const history = store.foodBatchHistory.get(id) ?? [];
  history.push({ changedAt: new Date().toISOString(), previous, current });
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
  store.foodBatches.set(id, { ...input, id, publishedBy: donorId, publishedAt: publishedAt.toISOString(), status: 'ACTIVE', revision: 0 });
  return { id, publishedAt: publishedAt.toISOString() };
}
