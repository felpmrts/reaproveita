import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { POST as postReservation } from '@/app/api/receiver/reservations/route';
import {
  GET as getReservationById,
  PATCH as patchReservationById,
} from '@/app/api/receiver/reservations/[id]/route';
import {
  clearFoodBatchesStore,
  findFoodBatchById,
  findFoodBatchReservationById,
  listFoodBatchReservationHistory,
  type FoodBatch,
  type FoodBatchReservation,
} from '@/repositories/food-batch.repository';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const globalStore = globalThis as typeof globalThis & {
  foodBatches?: Map<string, FoodBatch>;
  foodBatchReservations?: Map<string, FoodBatchReservation>;
};

let batch: FoodBatch;
let receiver: UserEntity;
let otherReceiver: UserEntity;
let donor: UserEntity;
let admin: UserEntity;

function authenticate(user?: UserEntity) {
  vi.mocked(cookies).mockReturnValue({
    get: () =>
      user
        ? { value: JSON.stringify({ id: user.id, email: user.email, role: user.role }) }
        : undefined,
  } as ReturnType<typeof cookies>);
}

function later(hours: number) {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

async function createActiveReservation(quantity = 3) {
  authenticate(receiver);
  const response = await postReservation(
    new NextRequest('http://localhost/api/receiver/reservations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        batchId: batch.id,
        quantity,
        requestId: randomUUID(),
      }),
    })
  );
  expect(response.status).toBe(201);
  const body = await response.json();
  return body.data as FoodBatchReservation;
}

function cancelRequest(id: string, body: unknown = { status: 'CANCELLED' }) {
  return patchReservationById(
    new NextRequest(`http://localhost/api/receiver/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: { id } }
  );
}

describe('ST16 (SCRUM-90) — Cancelamento de reserva (RN08, RN09, RN10, RN14, RN15)', () => {
  beforeEach(async () => {
    clearFoodBatchesStore();
    await getRbacResourceRepository().clear();
    const users = getInMemoryUserRepository();
    await users.clear();

    receiver = await users.create({
      name: 'Maria Receptora',
      email: 'maria.receptora@test.com',
      passwordHash: 'hash',
      role: 'RECEIVER',
    });
    otherReceiver = await users.create({
      name: 'João Receptor',
      email: 'joao.receptor@test.com',
      passwordHash: 'hash',
      role: 'RECEIVER',
    });
    donor = await users.create({
      name: 'Padaria Doadora',
      email: 'padaria.doadora@test.com',
      passwordHash: 'hash',
      role: 'DONOR',
    });
    admin = await users.create({
      name: 'Admin Sistema',
      email: 'admin.sistema@test.com',
      passwordHash: 'hash',
      role: 'ADMIN',
    });

    batch = {
      id: randomUUID(),
      establishmentId: randomUUID(),
      publishedBy: donor.id,
      publishedAt: later(-1),
      name: 'Cesta de Pães Artesanais',
      category: 'Padaria',
      description: 'Pães frescos do dia',
      storageConditions: 'Local seco e arejado',
      availableQuantity: 10,
      expiresAt: later(5),
      pickupStartsAt: later(1),
      pickupEndsAt: later(4),
      fitForConsumption: true,
      status: 'ACTIVE',
      revision: 0,
      expiredAt: null,
    };

    globalStore.foodBatches ??= new Map();
    globalStore.foodBatches.set(batch.id, batch);
  });

  it('cancela reserva ativa, restitui a quantidade ao lote válido e registra a operação no histórico', async () => {
    const reservation = await createActiveReservation(4);
    expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(6);

    const response = await cancelRequest(reservation.id, {
      status: 'CANCELLED',
      reason: 'Imprevisto no deslocamento',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: reservation.id,
      batchId: batch.id,
      status: 'CANCELLED',
      cancellationReason: 'Imprevisto no deslocamento',
      restoredToBatch: true,
      restoredQuantity: 4,
      historyEntryId: expect.any(String),
    });
    expect(body.data.cancelledAt).toEqual(expect.any(String));

    // Estoque integralmente restituído (RN09)
    expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(10);

    // Histórico auditável gravado (RN15)
    const history = await listFoodBatchReservationHistory(reservation.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      reservationId: reservation.id,
      batchId: batch.id,
      actorId: receiver.id,
      action: 'CANCELLED',
      previousStatus: 'ACTIVE',
      newStatus: 'CANCELLED',
      quantity: 4,
      restoredToBatch: true,
      restoredQuantity: 4,
      reason: 'Imprevisto no deslocamento',
    });

    // GET da reserva retorna status atualizado e histórico
    const getRes = await getReservationById(
      new NextRequest(`http://localhost/api/receiver/reservations/${reservation.id}`),
      { params: { id: reservation.id } }
    );
    const getBody = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getBody.data.status).toBe('CANCELLED');
    expect(getBody.data.history).toHaveLength(1);
  });

  it.each(['expiresAt', 'pickupEndsAt'] as const)(
    'cancela reserva ativa sem restituir saldo quando o lote venceu em %s (RN09)',
    async (field) => {
      const reservation = await createActiveReservation(3);
      expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(7);

      const currentBatch = globalStore.foodBatches!.get(batch.id)!;
      globalStore.foodBatches!.set(batch.id, {
        ...currentBatch,
        [field]: later(-0.1),
      });

      const response = await cancelRequest(reservation.id);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        id: reservation.id,
        status: 'CANCELLED',
        restoredToBatch: false,
        restoredQuantity: 0,
      });

      // Saldo não foi reaberto em lote expirado
      const updatedBatch = await findFoodBatchById(batch.id);
      expect(updatedBatch?.availableQuantity).toBe(7);
      expect(updatedBatch?.status).toBe('EXPIRED');

      const history = await listFoodBatchReservationHistory(reservation.id);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        action: 'CANCELLED',
        restoredToBatch: false,
        restoredQuantity: 0,
      });
    }
  );

  it.each(['INACTIVE', 'CLOSED', 'EXPIRED'] as const)(
    'cancela reserva ativa sem restituir saldo quando o lote está com status %s',
    async (batchStatus) => {
      const reservation = await createActiveReservation(2);
      const currentBatch = globalStore.foodBatches!.get(batch.id)!;
      globalStore.foodBatches!.set(batch.id, {
        ...currentBatch,
        status: batchStatus,
      });

      const response = await cancelRequest(reservation.id);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({
        status: 'CANCELLED',
        restoredToBatch: false,
        restoredQuantity: 0,
      });
      expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(8);
    }
  );

  it('impede o cancelamento de reservas concluídas (COMPLETED - RN10)', async () => {
    const reservation = await createActiveReservation(3);
    const key = `${receiver.id}:${reservation.requestId}`;
    globalStore.foodBatchReservations!.set(key, {
      ...reservation,
      status: 'COMPLETED',
    });

    const response = await cancelRequest(reservation.id);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'RESERVATION_COMPLETED',
        message: 'Reservas já concluídas não podem ser canceladas.',
      },
    });

    expect((await findFoodBatchReservationById(reservation.id))?.status).toBe('COMPLETED');
    expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(7);
    expect(await listFoodBatchReservationHistory(reservation.id)).toHaveLength(0);
  });

  it('evita estorno duplicado em cancelamentos concorrentes ou repetidos da mesma reserva', async () => {
    const reservation = await createActiveReservation(5);
    expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(5);

    const [first, second] = await Promise.all([
      cancelRequest(reservation.id),
      cancelRequest(reservation.id),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const conflictRes = first.status === 409 ? first : second;
    const conflictBody = await conflictRes.json();
    expect(conflictBody.error.code).toBe('RESERVATION_ALREADY_CANCELLED');

    // Quantidade devolvida exatamente uma vez (5 + 5 = 10, nunca 15)
    expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(10);
    expect(await listFoodBatchReservationHistory(reservation.id)).toHaveLength(1);
  });

  it('bloqueia acesso não autenticado (401), papéis não autorizados e terceiros (403 - RN14)', async () => {
    const reservation = await createActiveReservation(2);

    // Sem sessão -> 401
    authenticate();
    const unauth = await cancelRequest(reservation.id);
    expect(unauth.status).toBe(401);

    // Outro receptor -> 403
    authenticate(otherReceiver);
    const otherRes = await cancelRequest(reservation.id);
    expect(otherRes.status).toBe(403);
    expect((await otherRes.json()).error.code).toBe('FORBIDDEN');

    // Doador -> 403
    authenticate(donor);
    const donorRes = await cancelRequest(reservation.id);
    expect(donorRes.status).toBe(403);

    // Admin -> 403
    authenticate(admin);
    const adminRes = await cancelRequest(reservation.id);
    expect(adminRes.status).toBe(403);

    // Reserva e estoque permaneceram intactos
    expect((await findFoodBatchReservationById(reservation.id))?.status).toBe('ACTIVE');
    expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(8);
  });

  it('retorna 404 para reserva inexistente e 400 para payload inválido', async () => {
    const reservation = await createActiveReservation(1);

    const notFound = await cancelRequest(randomUUID());
    expect(notFound.status).toBe(404);
    expect((await notFound.json()).error.code).toBe('NOT_FOUND');

    const invalidStatus = await cancelRequest(reservation.id, { status: 'COMPLETED' });
    expect(invalidStatus.status).toBe(400);
    expect((await invalidStatus.json()).error.code).toBe('VALIDATION_ERROR');

    const invalidJson = await cancelRequest(reservation.id, '{invalid-json');
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe('INVALID_JSON');

    const tooLongReason = await cancelRequest(reservation.id, {
      status: 'CANCELLED',
      reason: 'a'.repeat(301),
    });
    expect(tooLongReason.status).toBe(400);
    expect((await tooLongReason.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
