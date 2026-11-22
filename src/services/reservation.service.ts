import { ForbiddenError, requireEstablishmentOwnership } from '@/lib/rbac';
import { getEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  cancelFoodBatchReservation,
  findFoodBatchById,
  findFoodBatchReservationById,
  listFoodBatchReservationHistory,
  listFoodBatchReservations,
  listFoodBatchReservationsByBatchIds,
  listFoodBatchesByEstablishmentIds,
  ReservationCancellationError,
  type CancelFoodBatchReservationResult,
  type FoodBatch,
  type FoodBatchReservation,
  type FoodBatchReservationHistoryEntry,
  type FoodBatchReservationStatus,
  type FoodBatchStatus,
} from '@/repositories/food-batch.repository';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';
import { getUserRepository } from '@/repositories/user.repository';
import type {
  CancelReservationInput,
  DonorReservationsQueryInput,
} from '@/schemas/reservation.schema';
import type { ReceiverReservationDetails } from '@/types/reservation';
import type { UserEntity } from '@/types/user';

export {
  findFoodBatchReservationById,
  listFoodBatchReservationHistory,
  ReservationCancellationError,
  type CancelFoodBatchReservationResult,
  type FoodBatchReservation,
  type FoodBatchReservationHistoryEntry,
  type FoodBatchReservationStatus,
};

export interface CancelReceiverReservationResponse extends CancelFoodBatchReservationResult {
  message: string;
}

export class DonorEstablishmentNotFoundError extends Error {
  public readonly code = 'NOT_FOUND' as const;
  public readonly statusCode = 404 as const;

  constructor(message = 'Estabelecimento não encontrado.') {
    super(message);
    this.name = 'DonorEstablishmentNotFoundError';
  }
}

export interface DonorReservationReceiverSummary {
  id: string;
  name: string;
  phone: string | null;
}

export interface DonorReservationItem {
  id: string;
  batchId: string;
  batchTitle: string;
  batchCategory: string;
  batchStatus: FoodBatchStatus;
  establishmentId: string;
  establishmentName: string;
  quantity: number;
  status: FoodBatchReservationStatus;
  pickupStartsAt: string;
  pickupEndsAt: string;
  expiresAt: string;
  createdAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  receiver: DonorReservationReceiverSummary;
}

export interface DonorReservationsSummary {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  activeUnits: number;
}

export interface DonorReservationsResult {
  items: DonorReservationItem[];
  summary: DonorReservationsSummary;
  establishments: Array<{ id: string; name: string }>;
  updatedAt: string;
}

export interface DonorReservationDetails extends DonorReservationItem {
  history: FoodBatchReservationHistoryEntry[];
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function mapDonorReservationItem(
  reservation: FoodBatchReservation,
  batch: FoodBatch,
  establishmentName: string,
  receiver?: Pick<UserEntity, 'id' | 'name' | 'phone'> | null
): DonorReservationItem {
  return {
    id: reservation.id,
    batchId: reservation.batchId,
    batchTitle: batch.name || reservation.batchTitle,
    batchCategory: batch.category,
    batchStatus: batch.status,
    establishmentId: batch.establishmentId,
    establishmentName,
    quantity: reservation.quantity,
    status: reservation.status,
    pickupStartsAt: batch.pickupStartsAt,
    pickupEndsAt: batch.pickupEndsAt,
    expiresAt: batch.expiresAt,
    createdAt: reservation.createdAt,
    cancelledAt: reservation.cancelledAt ?? null,
    cancellationReason: reservation.cancellationReason ?? null,
    receiver: {
      id: receiver?.id ?? reservation.receiverId,
      name: receiver?.name ?? 'Receptor identificado por código',
      phone: receiver?.phone ?? null,
    },
  };
}

function compareDonorReservations(a: DonorReservationItem, b: DonorReservationItem): number {
  const priority: Record<FoodBatchReservationStatus, number> = {
    ACTIVE: 0,
    COMPLETED: 1,
    CANCELLED: 2,
  };

  const priorityDiff = priority[a.status] - priority[b.status];
  if (priorityDiff !== 0) return priorityDiff;

  if (a.status === 'ACTIVE') {
    const startDiff = Date.parse(a.pickupStartsAt) - Date.parse(b.pickupStartsAt);
    if (startDiff !== 0) return startDiff;
    const endDiff = Date.parse(a.pickupEndsAt) - Date.parse(b.pickupEndsAt);
    if (endDiff !== 0) return endDiff;
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  }

  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
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
  const batches = new Map(
    await Promise.all(
      batchIds.map(async (id) => [id, await findFoodBatchById(id)] as const)
    )
  );
  const establishmentIds = Array.from(
    new Set(
      Array.from(batches.values())
        .filter((batch) => batch !== null)
        .map((batch) => batch.establishmentId)
    )
  );
  const repository = getEstablishmentRepository();
  const establishments = new Map(
    await Promise.all(
      establishmentIds.map(async (id) => [id, await repository.findById(id)] as const)
    )
  );

  const items: ReceiverReservationDetails[] = reservations.map((reservation) => {
    const batch = batches.get(reservation.batchId);
    const establishment = batch ? establishments.get(batch.establishmentId) : null;
    return {
      id: reservation.id,
      batchId: reservation.batchId,
      batchTitle: reservation.batchTitle,
      quantity: reservation.quantity,
      status: reservation.status,
      createdAt: reservation.createdAt,
      cancelledAt: reservation.cancelledAt,
      cancellationReason: reservation.cancellationReason,
      pickupStartsAt: batch?.pickupStartsAt ?? null,
      pickupEndsAt: batch?.pickupEndsAt ?? null,
      establishment: establishment
        ? {
            id: establishment.id,
            name: establishment.name,
            address: [
              establishment.street + ', ' + establishment.number,
              establishment.complement,
              establishment.neighborhood,
              establishment.city + '/' + establishment.state,
              'CEP ' + establishment.zipCode,
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : null,
    };
  });
  const ids = new Set(items.map(({ id }) => id));
  return [
    ...items,
    ...legacy
      .filter(({ id }) => !ids.has(id))
      .map((reservation) => ({
        id: reservation.id,
        batchTitle: reservation.batchTitle,
        quantity: reservation.quantity,
        status: reservation.status,
        establishment: null,
        pickupStartsAt: null,
        pickupEndsAt: null,
      })),
  ];
}

/**
 * Lista reservas recebidas pelos lotes dos estabelecimentos vinculados ao Doador autenticado
 * (ST18 / SCRUM-36 / SCRUM-94 / RN03 / RN14 / RNF08).
 */
export async function listDonorReceivedReservations(
  donor: Pick<UserEntity, 'id' | 'role'>,
  filters: DonorReservationsQueryInput = {},
  now: Date = new Date()
): Promise<DonorReservationsResult> {
  if (donor.role !== 'DONOR') {
    throw new ForbiddenError(
      'Apenas usuários com perfil Doador podem gerenciar reservas de estabelecimentos.'
    );
  }

  const establishmentRepo = getEstablishmentRepository();
  const ownedEstablishments = await establishmentRepo.findByOwner(donor.id);

  let scopedEstablishments = ownedEstablishments;

  if (filters.establishmentId) {
    const ownedMatch = ownedEstablishments.find((est) => est.id === filters.establishmentId);
    if (ownedMatch) {
      scopedEstablishments = [ownedMatch];
    } else {
      const existing = await establishmentRepo.findById(filters.establishmentId);
      if (!existing) {
        throw new DonorEstablishmentNotFoundError();
      }
      // Garante HTTP 403 padronizado quando o estabelecimento pertence a outro doador (RN03)
      requireEstablishmentOwnership(donor, existing.ownerId);
      scopedEstablishments = [existing];
    }
  }

  const establishmentOptions = ownedEstablishments.map((est) => ({
    id: est.id,
    name: est.name,
  }));

  if (scopedEstablishments.length === 0) {
    return {
      items: [],
      summary: { total: 0, active: 0, completed: 0, cancelled: 0, activeUnits: 0 },
      establishments: establishmentOptions,
      updatedAt: now.toISOString(),
    };
  }

  const establishmentsById = new Map(scopedEstablishments.map((est) => [est.id, est]));
  const batches = await listFoodBatchesByEstablishmentIds(
    scopedEstablishments.map((est) => est.id),
    now
  );

  if (batches.length === 0) {
    return {
      items: [],
      summary: { total: 0, active: 0, completed: 0, cancelled: 0, activeUnits: 0 },
      establishments: establishmentOptions,
      updatedAt: now.toISOString(),
    };
  }

  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
  const allReservations = await listFoodBatchReservationsByBatchIds(
    batches.map((batch) => batch.id)
  );

  const receiverIds = Array.from(new Set(allReservations.map((res) => res.receiverId)));
  const receivers =
    receiverIds.length > 0 ? await getUserRepository().findByIds(receiverIds) : [];
  const receiversById = new Map(receivers.map((user) => [user.id, user]));

  const mappedAll: DonorReservationItem[] = [];
  for (const reservation of allReservations) {
    const batch = batchesById.get(reservation.batchId);
    if (!batch) continue;
    const establishment = establishmentsById.get(batch.establishmentId);
    if (!establishment) continue;
    mappedAll.push(
      mapDonorReservationItem(
        reservation,
        batch,
        establishment.name,
        receiversById.get(reservation.receiverId)
      )
    );
  }

  const summary: DonorReservationsSummary = {
    total: mappedAll.length,
    active: 0,
    completed: 0,
    cancelled: 0,
    activeUnits: 0,
  };

  for (const item of mappedAll) {
    if (item.status === 'ACTIVE') {
      summary.active += 1;
      summary.activeUnits += item.quantity;
    } else if (item.status === 'COMPLETED') {
      summary.completed += 1;
    } else if (item.status === 'CANCELLED') {
      summary.cancelled += 1;
    }
  }

  const searchNormalized = filters.search ? normalizeSearchText(filters.search) : '';
  const items = mappedAll
    .filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (searchNormalized) {
        const haystack = normalizeSearchText(
          `${item.id} ${item.batchTitle} ${item.establishmentName} ${item.receiver.name} ${item.receiver.id}`
        );
        if (!haystack.includes(searchNormalized)) return false;
      }
      return true;
    })
    .sort(compareDonorReservations);

  return {
    items,
    summary,
    establishments: establishmentOptions,
    updatedAt: now.toISOString(),
  };
}

/**
 * Consulta status e histórico de uma reserva específica recebida pelo estabelecimento
 * do Doador autenticado (ST18 / RN03 / RN14).
 */
export async function getDonorReservationDetails(
  donor: Pick<UserEntity, 'id' | 'role'>,
  reservationId: string,
  now: Date = new Date()
): Promise<DonorReservationDetails | null> {
  if (donor.role !== 'DONOR') {
    throw new ForbiddenError(
      'Apenas usuários com perfil Doador podem consultar reservas de estabelecimentos.'
    );
  }

  const reservation = await findFoodBatchReservationById(reservationId);
  if (!reservation) return null;

  const batch = await findFoodBatchById(reservation.batchId, now);
  if (!batch) return null;

  const establishment = await getEstablishmentRepository().findById(batch.establishmentId);
  if (!establishment) return null;

  // Restringe acesso estritamente ao responsável autorizado pelo estabelecimento (RN03)
  requireEstablishmentOwnership(donor, establishment.ownerId);

  const [receiver, history] = await Promise.all([
    getUserRepository().findById(reservation.receiverId),
    listFoodBatchReservationHistory(reservation.id),
  ]);

  return {
    ...mapDonorReservationItem(reservation, batch, establishment.name, receiver),
    history,
  };
}
