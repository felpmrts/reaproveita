import { randomUUID } from 'crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { POST } from '@/app/api/receiver/reservations/route';
import { clearFoodBatchesStore, findFoodBatchById, listFoodBatchReservations, type FoodBatch } from '@/repositories/food-batch.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
const store = globalThis as typeof globalThis & { foodBatches?: Map<string, FoodBatch> };
let batch: FoodBatch;
let receiver: UserEntity;

function authenticate(user?: UserEntity) {
  vi.mocked(cookies).mockReturnValue({
    get: () => user ? { value: JSON.stringify({ email: user.email, role: user.role }) } : undefined,
  } as ReturnType<typeof cookies>);
}

beforeEach(async () => {
  clearFoodBatchesStore();
  const users = getInMemoryUserRepository();
  await users.clear();
  receiver = await users.create({ name: 'Receptor', email: 'receiver@test.com', passwordHash: 'hash', role: 'RECEIVER' });
  authenticate(receiver);
  const later = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
  batch = {
    id: randomUUID(), establishmentId: randomUUID(), publishedBy: randomUUID(), publishedAt: later(-1),
    name: 'Pães', category: 'Padaria', description: 'Pães do dia', storageConditions: 'Local seco',
    availableQuantity: 10, expiresAt: later(3), pickupStartsAt: later(1), pickupEndsAt: later(2),
    fitForConsumption: true, status: 'ACTIVE', revision: 0,
  };
  store.foodBatches ??= new Map();
  store.foodBatches.set(batch.id, batch);
});

function reserve(quantity: unknown, requestId = randomUUID()) {
  return POST(new NextRequest('http://localhost/api/receiver/reservations', {
    method: 'POST', body: JSON.stringify({ batchId: batch.id, quantity, requestId }),
  }));
}

it('reserva parcialmente e depois esgota o saldo, gerando identificadores', async () => {
  const first = await reserve(4);
  expect(first.status).toBe(201);
  expect((await first.json()).data).toMatchObject({ id: expect.any(String), quantity: 4, receiverId: receiver.id });
  expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(6);
  expect((await reserve(6)).status).toBe(201);
  expect((await reserve(1)).status).toBe(409);
  expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(0);
  expect(await listFoodBatchReservations(receiver.id)).toHaveLength(2);
  expect(await listFoodBatchReservations(randomUUID())).toEqual([]);
});

it('pedidos concorrentes não ultrapassam estoque', async () => {
  const responses = await Promise.all(Array.from({ length: 20 }, () => reserve(1)));
  expect(responses.filter(({ status }) => status === 201)).toHaveLength(10);
  expect(responses.filter(({ status }) => status === 409)).toHaveLength(10);
  expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(0);
  expect((await listFoodBatchReservations(receiver.id)).reduce((sum, item) => sum + item.quantity, 0)).toBe(10);
});

it('retentativas concorrentes descontam o estoque uma única vez', async () => {
  const key = randomUUID();
  const responses = await Promise.all([reserve(3, key), reserve(3, key)]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  expect(bodies[0].data.id).toBe(bodies[1].data.id);
  expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(7);
  expect((await reserve(4, key)).status).toBe(409);
});

it.each([0, -1, 1.5, '2', null, 2147483648])('rejeita quantidade inválida %j', async (quantity) => {
  expect((await reserve(quantity)).status).toBe(400);
  expect((await findFoodBatchById(batch.id))?.availableQuantity).toBe(10);
});

it.each(['INACTIVE', 'CLOSED', 'EXPIRED'] as const)('bloqueia lote %s', async (status) => {
  store.foodBatches!.set(batch.id, { ...batch, status });
  expect((await reserve(1)).status).toBe(409);
});

it.each(['expiresAt', 'pickupEndsAt'] as const)('bloqueia prazo encerrado %s', async (field) => {
  store.foodBatches!.set(batch.id, { ...batch, [field]: new Date(Date.now() - 1000).toISOString() });
  expect((await reserve(1)).status).toBe(409);
});

it('exige sessão e papel de receptor', async () => {
  authenticate();
  expect((await reserve(1)).status).toBe(401);
  const donor = await getInMemoryUserRepository().create({ name: 'Doador', email: 'donor@test.com', passwordHash: 'hash', role: 'DONOR' });
  authenticate(donor);
  expect((await reserve(1)).status).toBe(403);
});

