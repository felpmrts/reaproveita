import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { GET as getDonorReservations } from '@/app/api/donor/reservations/route';
import { GET as getDonorReservationById } from '@/app/api/donor/reservations/[id]/route';
import { POST as postReceiverReservation } from '@/app/api/receiver/reservations/route';
import { PATCH as patchReceiverReservation } from '@/app/api/receiver/reservations/[id]/route';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  clearFoodBatchesStore,
  type FoodBatch,
  type FoodBatchReservation,
} from '@/repositories/food-batch.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { EstablishmentEntity } from '@/types/establishment';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const globalStore = globalThis as typeof globalThis & {
  foodBatches?: Map<string, FoodBatch>;
  foodBatchReservations?: Map<string, FoodBatchReservation>;
};

let donorOne: UserEntity;
let donorTwo: UserEntity;
let receiverOne: UserEntity;
let receiverTwo: UserEntity;
let adminUser: UserEntity;

let estDonorOneA: EstablishmentEntity;
let estDonorOneB: EstablishmentEntity;
let estDonorTwo: EstablishmentEntity;

let batchOneEarly: FoodBatch;
let batchOneLate: FoodBatch;
let batchDonorTwo: FoodBatch;

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

async function createReservationAs(
  receiver: UserEntity,
  batchId: string,
  quantity: number
): Promise<FoodBatchReservation> {
  authenticate(receiver);
  const res = await postReceiverReservation(
    new NextRequest('http://localhost/api/receiver/reservations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batchId, quantity, requestId: randomUUID() }),
    })
  );
  expect(res.status).toBe(201);
  return (await res.json()).data as FoodBatchReservation;
}

describe('ST18 (SCRUM-94) — Gerenciamento das reservas recebidas pelo Doador (RN03, RN14, RNF08)', () => {
  beforeEach(async () => {
    clearFoodBatchesStore();
    const users = getInMemoryUserRepository();
    const establishments = getInMemoryEstablishmentRepository();
    await users.clear();
    await establishments.clear();

    donorOne = await users.create({
      name: 'Padaria Central (Doador 1)',
      email: 'doador1@st18.test',
      passwordHash: 'secret_hash_donor1',
      role: 'DONOR',
      phone: '34999990001',
    });
    donorTwo = await users.create({
      name: 'Hortifruti Sul (Doador 2)',
      email: 'doador2@st18.test',
      passwordHash: 'secret_hash_donor2',
      role: 'DONOR',
      phone: '34999990002',
    });
    receiverOne = await users.create({
      name: 'Maria Clara Receptora',
      email: 'maria@st18.test',
      passwordHash: 'secret_hash_receiver1',
      role: 'RECEIVER',
      phone: '34999991111',
    });
    receiverTwo = await users.create({
      name: 'Carlos Eduardo Receptor',
      email: 'carlos@st18.test',
      passwordHash: 'secret_hash_receiver2',
      role: 'RECEIVER',
      phone: null,
    });
    adminUser = await users.create({
      name: 'Admin',
      email: 'admin@st18.test',
      passwordHash: 'secret_hash_admin',
      role: 'ADMIN',
    });

    estDonorOneA = await establishments.create(donorOne.id, {
      name: 'Padaria Pão Quente Matriz',
      cnpj: '11222333000181',
      email: 'matriz@paoquente.test',
      phone: '3432110001',
      zipCode: '38400100',
      street: 'Av. Afonso Pena',
      number: '100',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.9186,
      longitude: -48.2772,
    });
    await establishments.updateStatus(estDonorOneA.id, 'APPROVED');

    estDonorOneB = await establishments.create(donorOne.id, {
      name: 'Padaria Pão Quente Filial',
      cnpj: '11222333000262',
      email: 'filial@paoquente.test',
      phone: '3432110002',
      zipCode: '38400200',
      street: 'Av. Rondon Pacheco',
      number: '500',
      neighborhood: 'Saraiva',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.92,
      longitude: -48.28,
    });
    await establishments.updateStatus(estDonorOneB.id, 'APPROVED');

    estDonorTwo = await establishments.create(donorTwo.id, {
      name: 'Hortifruti Bom Campo',
      cnpj: '99888777000110',
      email: 'contato@bomcampo.test',
      phone: '3432110099',
      zipCode: '38400300',
      street: 'Rua Goiás',
      number: '220',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.915,
      longitude: -48.275,
    });
    await establishments.updateStatus(estDonorTwo.id, 'APPROVED');

    batchOneEarly = {
      id: randomUUID(),
      establishmentId: estDonorOneA.id,
      publishedBy: donorOne.id,
      publishedAt: later(-1),
      name: 'Pães Franceses do Dia',
      category: 'Padaria',
      description: 'Pães crocantes',
      storageConditions: 'Local seco',
      availableQuantity: 15,
      expiresAt: later(6),
      pickupStartsAt: later(1),
      pickupEndsAt: later(2),
      fitForConsumption: true,
      status: 'ACTIVE',
      revision: 0,
      expiredAt: null,
    };

    batchOneLate = {
      id: randomUUID(),
      establishmentId: estDonorOneB.id,
      publishedBy: donorOne.id,
      publishedAt: later(-1),
      name: 'Bolo de Cenoura',
      category: 'Confeitaria',
      description: 'Fatias frescas',
      storageConditions: 'Refrigerado',
      availableQuantity: 10,
      expiresAt: later(8),
      pickupStartsAt: later(3),
      pickupEndsAt: later(5),
      fitForConsumption: true,
      status: 'ACTIVE',
      revision: 0,
      expiredAt: null,
    };

    batchDonorTwo = {
      id: randomUUID(),
      establishmentId: estDonorTwo.id,
      publishedBy: donorTwo.id,
      publishedAt: later(-1),
      name: 'Caixa de Maçãs',
      category: 'Hortifruti',
      description: 'Maçãs selecionadas',
      storageConditions: 'Local fresco',
      availableQuantity: 20,
      expiresAt: later(6),
      pickupStartsAt: later(1),
      pickupEndsAt: later(3),
      fitForConsumption: true,
      status: 'ACTIVE',
      revision: 0,
      expiredAt: null,
    };

    globalStore.foodBatches ??= new Map();
    globalStore.foodBatches.set(batchOneEarly.id, batchOneEarly);
    globalStore.foodBatches.set(batchOneLate.id, batchOneLate);
    globalStore.foodBatches.set(batchDonorTwo.id, batchDonorTwo);
  });

  it('lista apenas reservas dos lotes do estabelecimento do Doador com receptor, quantidade, janela de retirada e status', async () => {
    const resLate = await createReservationAs(receiverTwo, batchOneLate.id, 2);
    const resEarly = await createReservationAs(receiverOne, batchOneEarly.id, 5);
    const resOtherDonor = await createReservationAs(receiverOne, batchDonorTwo.id, 4);

    authenticate(donorOne);
    const response = await getDonorReservations(
      new NextRequest('http://localhost/api/donor/reservations')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([
      resEarly.id,
      resLate.id,
    ]);
    expect(body.data.items.some((item: { id: string }) => item.id === resOtherDonor.id)).toBe(
      false
    );

    // Verifica todos os campos exigidos pelos critérios de aceite e ausência de dados sensíveis (LGPD)
    const first = body.data.items[0];
    expect(first).toMatchObject({
      id: resEarly.id,
      batchId: batchOneEarly.id,
      batchTitle: 'Pães Franceses do Dia',
      establishmentId: estDonorOneA.id,
      establishmentName: 'Padaria Pão Quente Matriz',
      quantity: 5,
      status: 'ACTIVE',
      pickupStartsAt: batchOneEarly.pickupStartsAt,
      pickupEndsAt: batchOneEarly.pickupEndsAt,
      receiver: {
        id: receiverOne.id,
        name: 'Maria Clara Receptora',
        phone: '34999991111',
      },
    });
    expect(JSON.stringify(body)).not.toContain('secret_hash');

    expect(body.data.summary).toEqual({
      total: 2,
      active: 2,
      completed: 0,
      cancelled: 0,
      activeUnits: 7,
    });
  });

  it('permite filtrar por status, estabelecimento vinculado e termo de busca', async () => {
    const activeRes = await createReservationAs(receiverOne, batchOneEarly.id, 3);
    const cancelledRes = await createReservationAs(receiverTwo, batchOneLate.id, 2);

    // Cancela a segunda reserva como receiverTwo
    authenticate(receiverTwo);
    const cancelRes = await patchReceiverReservation(
      new NextRequest(`http://localhost/api/receiver/reservations/${cancelledRes.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', reason: 'Imprevisto' }),
      }),
      { params: { id: cancelledRes.id } }
    );
    expect(cancelRes.status).toBe(200);

    // Filtro por status CANCELLED
    authenticate(donorOne);
    const cancelledOnly = await getDonorReservations(
      new NextRequest('http://localhost/api/donor/reservations?status=CANCELLED')
    );
    const cancelledBody = await cancelledOnly.json();
    expect(cancelledOnly.status).toBe(200);
    expect(cancelledBody.data.items).toHaveLength(1);
    expect(cancelledBody.data.items[0].id).toBe(cancelledRes.id);
    expect(cancelledBody.data.items[0].status).toBe('CANCELLED');
    expect(cancelledBody.data.summary).toEqual({
      total: 2,
      active: 1,
      completed: 0,
      cancelled: 1,
      activeUnits: 3,
    });

    // Filtro por estabelecimento vinculado
    const byEst = await getDonorReservations(
      new NextRequest(
        `http://localhost/api/donor/reservations?establishmentId=${estDonorOneA.id}`
      )
    );
    const byEstBody = await byEst.json();
    expect(byEst.status).toBe(200);
    expect(byEstBody.data.items).toHaveLength(1);
    expect(byEstBody.data.items[0].id).toBe(activeRes.id);

    // Filtro por busca (nome do receptor sem acento)
    const bySearch = await getDonorReservations(
      new NextRequest('http://localhost/api/donor/reservations?search=maria')
    );
    const bySearchBody = await bySearch.json();
    expect(bySearch.status).toBe(200);
    expect(bySearchBody.data.items).toHaveLength(1);
    expect(bySearchBody.data.items[0].receiver.name).toBe('Maria Clara Receptora');
  });

  it('permite consultar o status detalhado e o histórico de uma reserva específica do estabelecimento', async () => {
    const reservation = await createReservationAs(receiverOne, batchOneEarly.id, 4);

    authenticate(receiverOne);
    await patchReceiverReservation(
      new NextRequest(`http://localhost/api/receiver/reservations/${reservation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', reason: 'Sem transporte' }),
      }),
      { params: { id: reservation.id } }
    );

    authenticate(donorOne);
    const detailRes = await getDonorReservationById(
      new NextRequest(`http://localhost/api/donor/reservations/${reservation.id}`),
      { params: { id: reservation.id } }
    );
    const detailBody = await detailRes.json();

    expect(detailRes.status).toBe(200);
    expect(detailBody.data).toMatchObject({
      id: reservation.id,
      status: 'CANCELLED',
      cancellationReason: 'Sem transporte',
      quantity: 4,
      pickupStartsAt: batchOneEarly.pickupStartsAt,
      pickupEndsAt: batchOneEarly.pickupEndsAt,
      receiver: {
        id: receiverOne.id,
        name: 'Maria Clara Receptora',
      },
    });
    expect(detailBody.data.history).toHaveLength(1);
    expect(detailBody.data.history[0].action).toBe('CANCELLED');
  });

  it('restringe acesso rigorosamente aos responsáveis autorizados pelo estabelecimento (401 e 403)', async () => {
    const resDonorOne = await createReservationAs(receiverOne, batchOneEarly.id, 2);

    // Não autenticado -> 401
    authenticate();
    expect(
      (await getDonorReservations(new NextRequest('http://localhost/api/donor/reservations')))
        .status
    ).toBe(401);
    expect(
      (
        await getDonorReservationById(
          new NextRequest(`http://localhost/api/donor/reservations/${resDonorOne.id}`),
          { params: { id: resDonorOne.id } }
        )
      ).status
    ).toBe(401);

    // Receptor tentando acessar painel do Doador -> 403
    authenticate(receiverOne);
    expect(
      (await getDonorReservations(new NextRequest('http://localhost/api/donor/reservations')))
        .status
    ).toBe(403);

    // Admin tentando acessar endpoint exclusivo de Doador -> 403
    authenticate(adminUser);
    expect(
      (await getDonorReservations(new NextRequest('http://localhost/api/donor/reservations')))
        .status
    ).toBe(403);

    // Outro Doador tentando filtrar pelo estabelecimento de donorOne -> 403 (RN03)
    authenticate(donorTwo);
    const forbiddenList = await getDonorReservations(
      new NextRequest(
        `http://localhost/api/donor/reservations?establishmentId=${estDonorOneA.id}`
      )
    );
    const forbiddenListBody = await forbiddenList.json();
    expect(forbiddenList.status).toBe(403);
    expect(forbiddenListBody.error.code).toBe('FORBIDDEN');

    // Outro Doador tentando consultar reserva específica de donorOne -> 403 (RN03)
    const forbiddenDetail = await getDonorReservationById(
      new NextRequest(`http://localhost/api/donor/reservations/${resDonorOne.id}`),
      { params: { id: resDonorOne.id } }
    );
    const forbiddenDetailBody = await forbiddenDetail.json();
    expect(forbiddenDetail.status).toBe(403);
    expect(forbiddenDetailBody.error.code).toBe('FORBIDDEN');
  });

  it('retorna 400 para parâmetros inválidos e 404 para estabelecimento ou reserva inexistentes', async () => {
    authenticate(donorOne);

    const invalidStatus = await getDonorReservations(
      new NextRequest('http://localhost/api/donor/reservations?status=INVALID')
    );
    expect(invalidStatus.status).toBe(400);

    const invalidEstId = await getDonorReservations(
      new NextRequest('http://localhost/api/donor/reservations?establishmentId=nao-e-uuid')
    );
    expect(invalidEstId.status).toBe(400);

    const missingEst = await getDonorReservations(
      new NextRequest(`http://localhost/api/donor/reservations?establishmentId=${randomUUID()}`)
    );
    expect(missingEst.status).toBe(404);

    const missingRes = await getDonorReservationById(
      new NextRequest(`http://localhost/api/donor/reservations/${randomUUID()}`),
      { params: { id: randomUUID() } }
    );
    expect(missingRes.status).toBe(404);
  });
});
