import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { POST as EXPIRE } from '@/app/api/food-batches/expire/route';
import { GET as GET_CATALOG, POST as PUBLISH } from '@/app/food-batches/route';
import { GET as GET_DETAILS, PATCH as PATCH_BATCH } from '@/app/food-batches/[id]/route';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  clearFoodBatchesStore,
  listDonorFoodBatches,
} from '@/repositories/food-batch.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import {
  FoodBatchUnavailableForReservationError,
  getFoodBatchHistory,
  validateFoodBatchForReservation,
} from '@/services/food-batch.service';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const users = getInMemoryUserRepository();
const establishments = getInMemoryEstablishmentRepository();

let admin: UserEntity;
let donor: UserEntity;
let receiver: UserEntity;
let establishmentId: string;

function authenticate(user?: UserEntity) {
  vi.mocked(cookies).mockReturnValue({
    get: () => (user ? { value: JSON.stringify({ email: user.email, role: user.role }) } : undefined),
  } as ReturnType<typeof cookies>);
}

async function publishOffer(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const offset = (hours: number) => new Date(now + hours * 3600_000).toISOString();

  const response = await PUBLISH(
    new NextRequest('http://localhost/food-batches', {
      method: 'POST',
      body: JSON.stringify({
        establishmentId,
        name: 'Oferta Padrão',
        category: 'Padaria',
        description: 'Pães do expediente',
        availableQuantity: 6,
        expiresAt: offset(2),
        pickupStartsAt: offset(0.25),
        pickupEndsAt: offset(1),
        storageConditions: 'Local seco',
        fitForConsumption: true,
        ...overrides,
      }),
    })
  );

  expect(response.status).toBe(201);
  return (await response.json()).data.id as string;
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T14:00:00.000Z'));

  await users.clear();
  await establishments.clear();
  clearFoodBatchesStore();

  admin = await users.create({
    name: 'Admin Expiração',
    email: 'admin-exp@test.com',
    passwordHash: 'hash',
    role: 'ADMIN',
  });
  donor = await users.create({
    name: 'Doador Expiração',
    email: 'donor-exp@test.com',
    passwordHash: 'hash',
    role: 'DONOR',
  });
  receiver = await users.create({
    name: 'Receptor Expiração',
    email: 'receiver-exp@test.com',
    passwordHash: 'hash',
    role: 'RECEIVER',
  });

  const est = await establishments.create(donor.id, {
    name: 'Padaria Central',
    cnpj: '11222333000181',
    email: 'padaria@test.com',
    phone: '34999990001',
    zipCode: '38400100',
    street: 'Av. Brasil',
    number: '100',
    neighborhood: 'Centro',
    city: 'Uberlândia',
    state: 'MG',
    latitude: -18.9186,
    longitude: -48.2772,
  });
  await establishments.updateStatus(est.id, 'APPROVED');
  establishmentId = est.id;
  authenticate(donor);
});

describe('Ciclo automático de expiração de ofertas (ST13 / SCRUM-86)', () => {
  it('expira lote vencido via rotina, bloqueia reservas e edições, preserva histórico e atualiza o catálogo', async () => {
    const offerAId = await publishOffer({
      name: 'Pães com Vencimento Curto',
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), // +1h
      pickupEndsAt: new Date(Date.now() + 50 * 60_000).toISOString(),
    });

    const offerBId = await publishOffer({
      name: 'Pães com Prazo Maior',
      expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(), // +6h
      pickupEndsAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
    });

    authenticate(receiver);
    const initialCatalog = await GET_CATALOG(new NextRequest('http://localhost/food-batches'));
    expect(initialCatalog.status).toBe(200);
    expect((await initialCatalog.json()).meta.total).toBe(2);

    // Avança o relógio em 61 minutos (Oferta A expira; Oferta B permanece ativa)
    vi.advanceTimersByTime(61 * 60_000);

    // RBAC no endpoint operacional POST /api/food-batches/expire
    authenticate();
    const unauthRes = await EXPIRE(
      new NextRequest('http://localhost/api/food-batches/expire', { method: 'POST' })
    );
    expect(unauthRes.status).toBe(401);

    authenticate(donor);
    const donorRes = await EXPIRE(
      new NextRequest('http://localhost/api/food-batches/expire', { method: 'POST' })
    );
    expect(donorRes.status).toBe(403);

    authenticate(receiver);
    const receiverRes = await EXPIRE(
      new NextRequest('http://localhost/api/food-batches/expire', { method: 'POST' })
    );
    expect(receiverRes.status).toBe(403);

    authenticate(admin);
    const adminExpireRes = await EXPIRE(
      new NextRequest('http://localhost/api/food-batches/expire', { method: 'POST' })
    );
    expect(adminExpireRes.status).toBe(200);
    expect(adminExpireRes.headers.get('Cache-Control')).toBe('no-store');
    expect(await adminExpireRes.json()).toEqual({
      success: true,
      data: {
        checkedAt: expect.any(String),
        expiredCount: 1,
        expiredIds: [offerAId],
      },
    });

    // Preserva oferta expirada no histórico e no painel do doador
    const donorOffers = await listDonorFoodBatches(donor.id);
    const expiredOffer = donorOffers.find((item) => item.id === offerAId);
    expect(expiredOffer).toMatchObject({
      id: offerAId,
      status: 'EXPIRED',
      revision: 1,
      expiredAt: expect.any(String),
    });

    const history = await getFoodBatchHistory(offerAId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      reason: 'AUTOMATIC_EXPIRATION',
      revision: 1,
      previous: expect.objectContaining({ status: 'ACTIVE' }),
      current: expect.objectContaining({ status: 'EXPIRED' }),
    });

    // Bloqueia novas reservas e mutações pelo doador
    authenticate(receiver);
    const detailsRes = await GET_DETAILS(
      new NextRequest(`http://localhost/food-batches/${offerAId}`),
      { params: { id: offerAId } }
    );
    expect(detailsRes.status).toBe(200);
    expect((await detailsRes.json()).data).toMatchObject({
      id: offerAId,
      status: 'EXPIRED',
      isExpired: true,
      reservable: false,
      unavailableReason: 'EXPIRED',
    });

    await expect(validateFoodBatchForReservation(offerAId, 1)).rejects.toBeInstanceOf(
      FoodBatchUnavailableForReservationError
    );
    await expect(validateFoodBatchForReservation(offerAId, 1)).rejects.toMatchObject({
      reason: 'EXPIRED',
      code: 'BATCH_EXPIRED',
    });

    authenticate(donor);
    const patchAfterExpiry = await PATCH_BATCH(
      new NextRequest(`http://localhost/food-batches/${offerAId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: 1, name: 'Editado após expiração' }),
      }),
      { params: { id: offerAId } }
    );
    expect(patchAfterExpiry.status).toBe(409);

    // Atualiza imediatamente a disponibilidade apresentada no catálogo
    authenticate(receiver);
    const updatedCatalog = await GET_CATALOG(new NextRequest('http://localhost/food-batches'));
    const updatedJson = await updatedCatalog.json();
    expect(updatedJson.meta.total).toBe(1);
    expect(updatedJson.data.map((offer: { id: string }) => offer.id)).toEqual([offerBId]);
  });

  it('sincroniza expiração automaticamente no catálogo/reserva ao ultrapassar pickupEndsAt e aceita CRON_SECRET', async () => {
    const offerId = await publishOffer({
      name: 'Oferta Janela Curta',
      expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
      pickupEndsAt: new Date(Date.now() + 30 * 60_000).toISOString(), // +30m
    });

    // Avança 31 minutos sem chamar /api/food-batches/expire antes
    vi.advanceTimersByTime(31 * 60_000);

    authenticate(receiver);
    const catalogRes = await GET_CATALOG(new NextRequest('http://localhost/food-batches'));
    const catalogJson = await catalogRes.json();
    expect(catalogJson.meta.total).toBe(0);
    expect(catalogJson.data).toEqual([]);

    await expect(validateFoodBatchForReservation(offerId, 1)).rejects.toMatchObject({
      reason: 'EXPIRED',
    });

    // Testa disparo via Bearer CRON_SECRET após publicar outro lote que vence
    process.env.CRON_SECRET = 'segredo-cron-teste-st13';
    authenticate(donor);
    const secondOfferId = await publishOffer({
      name: 'Oferta Cron Secret',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      pickupEndsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    });

    vi.advanceTimersByTime(25 * 60_000);
    authenticate();

    const cronRes = await EXPIRE(
      new NextRequest('http://localhost/api/food-batches/expire', {
        method: 'POST',
        headers: { authorization: 'Bearer segredo-cron-teste-st13' },
      })
    );
    expect(cronRes.status).toBe(200);
    expect(await cronRes.json()).toEqual({
      success: true,
      data: {
        checkedAt: expect.any(String),
        expiredCount: 1,
        expiredIds: [secondOfferId],
      },
    });
  });
});
