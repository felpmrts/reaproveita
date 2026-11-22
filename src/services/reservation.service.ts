import { findFoodBatchById, listFoodBatchReservations } from '@/repositories/food-batch.repository';
import { getEstablishmentRepository } from '@/repositories/establishment.repository';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';
import type { ReceiverReservationDetails } from '@/types/reservation';
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


export async function listReceiverReservations(
  user: Pick<UserEntity, 'id' | 'role'>
): Promise<ReceiverReservationDetails[]> {
  if (user.role !== 'RECEIVER') throw new ForbiddenError('Acesso exclusivo ao Receptor.');

  const [reservations, legacy] = await Promise.all([
    listFoodBatchReservations(user.id),
    getRbacResourceRepository().findReservationsByReceiver(user.id),
  ]);
  const batchIds = Array.from(new Set(reservations.map(({ batchId }) => batchId)));
  const batches = new Map(await Promise.all(batchIds.map(async (id) =>
    [id, await findFoodBatchById(id)] as const
  )));
  const establishmentIds = Array.from(new Set(Array.from(batches.values())
    .filter((batch) => batch !== null).map((batch) => batch.establishmentId)));
  const repository = getEstablishmentRepository();
  const establishments = new Map(await Promise.all(establishmentIds.map(async (id) =>
    [id, await repository.findById(id)] as const
  )));

  const items: ReceiverReservationDetails[] = reservations.map((reservation) => {
    const batch = batches.get(reservation.batchId);
    const establishment = batch ? establishments.get(batch.establishmentId) : null;
    return {
      id: reservation.id, batchId: reservation.batchId, batchTitle: reservation.batchTitle,
      quantity: reservation.quantity, status: reservation.status, createdAt: reservation.createdAt,
      cancelledAt: reservation.cancelledAt, cancellationReason: reservation.cancellationReason,
      pickupStartsAt: batch?.pickupStartsAt ?? null, pickupEndsAt: batch?.pickupEndsAt ?? null,
      establishment: establishment ? {
        id: establishment.id, name: establishment.name,
        address: [
          establishment.street + ', ' + establishment.number,
          establishment.complement,
          establishment.neighborhood,
          establishment.city + '/' + establishment.state,
          'CEP ' + establishment.zipCode,
        ].filter(Boolean).join(' · '),
      } : null,
    };
  });
  const ids = new Set(items.map(({ id }) => id));
  return [
    ...items,
    ...legacy.filter(({ id }) => !ids.has(id)).map((reservation) => ({
      id: reservation.id, batchTitle: reservation.batchTitle, quantity: reservation.quantity,
      status: reservation.status, establishment: null, pickupStartsAt: null, pickupEndsAt: null,
    })),
  ];
}
