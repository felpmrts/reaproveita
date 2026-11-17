import { getEstablishmentRepository } from '@/repositories/establishment.repository';
import { findFoodBatchById, type FoodBatch } from '@/repositories/food-batch.repository';
import type { EstablishmentEntity } from '@/types/establishment';

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

const HOUR_MS = 60 * 60 * 1000;

/**
 * Computes the urgency indicator for a food batch based on the earliest deadline
 * between expiration and pickup window end.
 */
export function calculateFoodBatchUrgency(
  batch: Pick<FoodBatch, 'expiresAt' | 'pickupEndsAt'>,
  now: Date = new Date()
): FoodBatchUrgency {
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
  const isExpired = Date.parse(batch.expiresAt) <= nowMs || Date.parse(batch.pickupEndsAt) <= nowMs;

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

/**
 * Loads full details for a food batch, including establishment info, urgency, and reservability.
 */
export async function getFoodBatchDetails(
  id: string,
  now: Date = new Date()
): Promise<FoodBatchDetails | null> {
  const batch = await findFoodBatchById(id);
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
