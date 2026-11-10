import { randomUUID } from 'crypto';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { PublishFoodBatchInput } from '@/schemas/food-batch.schema';

export class FoodBatchPublicationConflict extends Error {}

const store = globalThis as typeof globalThis & {
  foodBatches?: Map<string, PublishFoodBatchInput & { id: string; publishedBy: string; publishedAt: string }>;
};

export async function saveFoodBatch(donorId: string, input: PublishFoodBatchInput) {
  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
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
  store.foodBatches.set(id, { ...input, id, publishedBy: donorId, publishedAt: publishedAt.toISOString() });
  return { id, publishedAt: publishedAt.toISOString() };
}
