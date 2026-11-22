import { ForbiddenError } from '@/lib/rbac';
import {
  cancelFoodBatchReservation,
  findFoodBatchReservationById,
  listFoodBatchReservationHistory,
  ReservationCancellationError,
  type CancelFoodBatchReservationResult,
  type FoodBatchReservation,
  type FoodBatchReservationHistoryEntry,
} from '@/repositories/food-batch.repository';
import type { CancelReservationInput } from '@/schemas/reservation.schema';
import type { UserEntity } from '@/types/user';

export {
  findFoodBatchReservationById,
  listFoodBatchReservationHistory,
  ReservationCancellationError,
  type CancelFoodBatchReservationResult,
  type FoodBatchReservation,
  type FoodBatchReservationHistoryEntry,
};

export interface CancelReceiverReservationResponse extends CancelFoodBatchReservationResult {
  message: string;
}

/**
 * Cancela uma reserva ativa do Receptor autenticado (ST16 / RN09 / RN10 / RN14 / RN15):
 * - Exige papel RECEIVER e titularidade da reserva.
 * - Impede cancelamento de reservas concluídas (COMPLETED) ou já canceladas (CANCELLED).
 * - Restitui a quantidade ao lote somente quando ainda válido para novas reservas.
 * - Registra o evento no histórico auditável de reservas.
 */
export async function cancelReceiverReservation(
  user: Pick<UserEntity, 'id' | 'role'>,
  reservationId: string,
  input: CancelReservationInput,
  now?: Date
): Promise<CancelReceiverReservationResponse> {
  if (user.role !== 'RECEIVER') {
    throw new ForbiddenError('Apenas usuários com perfil Receptor podem cancelar reservas.');
  }

  const result = await cancelFoodBatchReservation(reservationId, user.id, {
    reason: input.reason,
    now,
  });

  const message = result.restoredToBatch
    ? 'Reserva cancelada com sucesso. A quantidade foi restituída ao lote.'
    : 'Reserva cancelada com sucesso. O lote não está mais válido para novas reservas, portanto o saldo não foi reaberto.';

  return {
    ...result,
    message,
  };
}
