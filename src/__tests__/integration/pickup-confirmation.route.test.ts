import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { POST as postConfirmPickup } from '@/app/api/donor/reservations/[id]/confirm-pickup/route';
import { GET as getDonorReservations } from '@/app/api/donor/reservations/route';
import { POST as postReceiverReservation } from '@/app/api/receiver/reservations/route';
import { PATCH as patchReceiverReservation } from '@/app/api/receiver/reservations/[id]/route';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  clearFoodBatchesStore,
  findFoodBatchReservationById,
  getCompletedFoodRescuedMetrics,
  listFoodBatchReservationHistory,
  type FoodBatch,
  type FoodBatchReservation,
} from '@/repositories/food-batch.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { EstablishmentEntity } from '@/types/establishment';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const globalStore = globalThis as typeof globalThis & {
  foodBatches?: Map<string, FoodBatch>;
};

let donorOne: UserEntity;
let donorTwo: UserEntity;
let receiverOne: UserEntity;
let adminUser: UserEntity;
let estDonorOne: EstablishmentEntity;
let batch: FoodBatch;

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

async function createActiveReservation(quantity = 4): Promise<FoodBatchReservation> {
  authenticate(receiverOne);
  const response = await postReceiverReservation(
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
  return (await response.json()).data as FoodBatchReservation;
}

function confirmPickupRequest(code: string, body?: unknown) {
  return postConfirmPickup(
    new NextRequest(`http://localhost/api/donor/reservations/${code}/confirm-pickup`, {
      method: 'POST',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body:
        body === undefined
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    }),
    { params: { id: code } }
  );
}

describe('ST19 (SCRUM-96) — Confirmação de retirada presencial idempotente (RN03, RN10, RN11, RN12, RN14, RN15, RN16)', () => {
  beforeEach(async () => {
    clearFoodBatchesStore();
    const users = getInMemoryUserRepository();
    const establishments = getInMemoryEstablishmentRepository();
    await users.clear();
    await establishments.clear();

    donorOne = await users.create({
      name: 'Padaria Pão Quente',
      email: 'doador1@st19.test',
      passwordHash: 'hash_d1',
      role: 'DONOR',
    });
    donorTwo = await users.create({
      name: 'Mercado Vizinho',
      email: 'doador2@st19.test',
      passwordHash: 'hash_d2',
      role: 'DONOR',
    });
    receiverOne = await users.create({
      name: 'Maria Receptora',
      email: 'maria@st19.test',
      passwordHash: 'hash_r1',
      role: 'RECEIVER',
    });
    adminUser = await users.create({
      name: 'Admin',
      email: 'admin@st19.test',
      passwordHash: 'hash_adm',
      role: 'ADMIN',
    });

    estDonorOne = await establishments.create(donorOne.id, {
      name: 'Padaria Pão Quente Matriz',
      cnpj: '12345678000195',
      email: 'contato@paoquente.test',
      phone: '3432119000',
      zipCode: '38400100',
      street: 'Av. Afonso Pena',
      number: '150',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.9186,
      longitude: -48.2772,
    });
    await establishments.updateStatus(estDonorOne.id, 'APPROVED');

    batch = {
      id: randomUUID(),
      establishmentId: estDonorOne.id,
      publishedBy: donorOne.id,
      publishedAt: later(-1),
      name: 'Pães e Salgados do Dia',
      category: 'Padaria',
      description: 'Assados frescos',
      storageConditions: 'Local seco',
      availableQuantity: 10,
      expiresAt: later(5),
      pickupStartsAt: later(-0.5),
      pickupEndsAt: later(3),
      fitForConsumption: true,
      status: 'ACTIVE',
      revision: 0,
      expiredAt: null,
    };

    globalStore.foodBatches ??= new Map();
    globalStore.foodBatches.set(batch.id, batch);
  });

  it('confirma retirada de reserva ativa e válida por código, registra data/horário/responsável, grava histórico e atualiza indicadores (RN11, RN15, RN16)', async () => {
    const activeRes = await createActiveReservation(4);
    const otherActiveRes = await createActiveReservation(3);
    const cancelledRes = await createActiveReservation(2);

    // Cancela uma reserva para garantir que RN16 ignora canceladas e ativas
    authenticate(receiverOne);
    await patchReceiverReservation(
      new NextRequest(`http://localhost/api/receiver/reservations/${cancelledRes.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }),
      { params: { id: cancelledRes.id } }
    );

    // Antes da confirmação: 0 alimentos resgatados (RN16)
    expect(await getCompletedFoodRescuedMetrics()).toEqual({
      completedReservationsCount: 0,
      rescuedUnits: 0,
    });

    authenticate(donorOne);
    const response = await confirmPickupRequest(activeRes.id, {
      requestId: randomUUID(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: activeRes.id,
      status: 'COMPLETED',
      completedBy: donorOne.id,
      completedByName: 'Padaria Pão Quente',
      historyEntryId: expect.any(String),
      idempotentReplay: false,
      summary: {
        total: 3,
        active: 1,
        completed: 1,
        cancelled: 1,
        activeUnits: 3,
        rescuedUnits: 4,
      },
      globalImpact: {
        completedReservationsCount: 1,
        rescuedUnits: 4,
      },
    });
    expect(body.data.completedAt).toEqual(expect.any(String));

    // Garante que a reserva concluída ficou imutável (RN10) — receptor não consegue mais cancelar
    authenticate(receiverOne);
    const cancelCompleted = await patchReceiverReservation(
      new NextRequest(`http://localhost/api/receiver/reservations/${activeRes.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }),
      { params: { id: activeRes.id } }
    );
    expect(cancelCompleted.status).toBe(409);

    // Histórico auditável registrado
    const history = await listFoodBatchReservationHistory(activeRes.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      reservationId: activeRes.id,
      actorId: donorOne.id,
      action: 'COMPLETED',
      previousStatus: 'ACTIVE',
      newStatus: 'COMPLETED',
      quantity: 4,
    });

    // Painel do Doador reflete rescuedUnits = 4 (somando apenas COMPLETED, ignorando otherActiveRes=3 e cancelledRes=2)
    authenticate(donorOne);
    const listRes = await getDonorReservations(
      new NextRequest('http://localhost/api/donor/reservations')
    );
    const listBody = await listRes.json();
    expect(listBody.data.summary.rescuedUnits).toBe(4);
    expect(otherActiveRes.status).toBe('ACTIVE');
  });

  it('permite confirmar retirada mesmo quando o lote atingiu saldo zero após todas as reservas', async () => {
    const fullReservation = await createActiveReservation(10);
    expect(globalStore.foodBatches!.get(batch.id)?.availableQuantity).toBe(0);

    authenticate(donorOne);
    const response = await confirmPickupRequest(fullReservation.id);
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe('COMPLETED');
  });

  it('impede confirmação duplicada concorrente (409) e garante idempotência em retentativa de rede com o mesmo requestId (RN12)', async () => {
    const reservation = await createActiveReservation(5);
    const retryKey = randomUUID();

    // 1. Retentativa concorrente com MESMO requestId: idempotente, grava 1 único histórico e soma 5 unidades uma única vez
    authenticate(donorOne);
    const [retryA, retryB] = await Promise.all([
      confirmPickupRequest(reservation.id, { requestId: retryKey }),
      confirmPickupRequest(reservation.id, { requestId: retryKey }),
    ]);
    expect(retryA.status).toBe(200);
    expect(retryB.status).toBe(200);
    expect(await listFoodBatchReservationHistory(reservation.id)).toHaveLength(1);
    expect(await getCompletedFoodRescuedMetrics()).toEqual({
      completedReservationsCount: 1,
      rescuedUnits: 5,
    });

    // 2. Nova tentativa duplicada (sem a mesma chave) é bloqueada com 409 RESERVATION_ALREADY_COMPLETED
    const duplicate = await confirmPickupRequest(reservation.id, {
      requestId: randomUUID(),
    });
    const duplicateBody = await duplicate.json();
    expect(duplicate.status).toBe(409);
    expect(duplicateBody.error.code).toBe('RESERVATION_ALREADY_COMPLETED');

    // 3. Duas confirmações simultâneas sem chave compartilhada em outra reserva: exatamente uma 200 e uma 409
    const secondRes = await createActiveReservation(3);
    authenticate(donorOne);
    const [first, second] = await Promise.all([
      confirmPickupRequest(secondRes.id),
      confirmPickupRequest(secondRes.id),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await getCompletedFoodRescuedMetrics()).toEqual({
      completedReservationsCount: 2,
      rescuedUnits: 8,
    });
  });

  it.each(['expiresAt', 'pickupEndsAt'] as const)(
    'bloqueia confirmação de reserva cujo lote expirou em %s (RN11)',
    async (field) => {
      const reservation = await createActiveReservation(2);
      const current = globalStore.foodBatches!.get(batch.id)!;
      globalStore.foodBatches!.set(batch.id, {
        ...current,
        [field]: later(-0.1),
      });

      authenticate(donorOne);
      const response = await confirmPickupRequest(reservation.id);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error.code).toBe('RESERVATION_EXPIRED');
      expect((await findFoodBatchReservationById(reservation.id))?.status).toBe('ACTIVE');
      expect(await getCompletedFoodRescuedMetrics()).toEqual({
        completedReservationsCount: 0,
        rescuedUnits: 0,
      });
    }
  );

  it('bloqueia confirmação de reserva já cancelada (RN11)', async () => {
    const reservation = await createActiveReservation(2);

    authenticate(receiverOne);
    await patchReceiverReservation(
      new NextRequest(`http://localhost/api/receiver/reservations/${reservation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }),
      { params: { id: reservation.id } }
    );

    authenticate(donorOne);
    const response = await confirmPickupRequest(reservation.id);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('RESERVATION_CANCELLED');
    expect(await getCompletedFoodRescuedMetrics()).toEqual({
      completedReservationsCount: 0,
      rescuedUnits: 0,
    });
  });

  it('restringe confirmação estritamente ao Doador responsável pelo estabelecimento e valida entradas (401, 403, 404, 400)', async () => {
    const reservation = await createActiveReservation(2);

    // Sem sessão -> 401
    authenticate();
    expect((await confirmPickupRequest(reservation.id)).status).toBe(401);

    // Receptor -> 403
    authenticate(receiverOne);
    expect((await confirmPickupRequest(reservation.id)).status).toBe(403);

    // Admin -> 403
    authenticate(adminUser);
    expect((await confirmPickupRequest(reservation.id)).status).toBe(403);

    // Outro Doador (não proprietário do estabelecimento) -> 403 (RN03)
    authenticate(donorTwo);
    const otherDonorRes = await confirmPickupRequest(reservation.id);
    expect(otherDonorRes.status).toBe(403);
    expect((await otherDonorRes.json()).error.code).toBe('FORBIDDEN');

    // Código inexistente -> 404
    authenticate(donorOne);
    expect((await confirmPickupRequest(randomUUID())).status).toBe(404);

    // Código malformado -> 400
    expect((await confirmPickupRequest('codigo-invalido')).status).toBe(400);

    // JSON inválido -> 400
    expect((await confirmPickupRequest(reservation.id, '{bad-json')).status).toBe(400);

    // Reserva permaneceu ACTIVE
    expect((await findFoodBatchReservationById(reservation.id))?.status).toBe('ACTIVE');
  });
});
