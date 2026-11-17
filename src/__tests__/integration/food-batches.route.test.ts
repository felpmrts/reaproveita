import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { POST } from '@/app/food-batches/route';
import { PATCH } from '@/app/food-batches/[id]/route';
import { listAvailableFoodBatches, listDonorFoodBatches } from '@/repositories/food-batch.repository';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const users = getInMemoryUserRepository();
const establishments = getInMemoryEstablishmentRepository();
let donor: UserEntity;
let establishmentId: string;

function authenticate(user?: UserEntity) {
  vi.mocked(cookies).mockReturnValue({
    get: () => user ? { value: JSON.stringify({ email: user.email, role: user.role }) } : undefined,
  } as ReturnType<typeof cookies>);
}

beforeEach(async () => {
  await users.clear();
  await establishments.clear();
  donor = await users.create({ name: 'Doador', email: 'doador@test.com', passwordHash: 'hash', role: 'DONOR' });
  const establishment = await establishments.create(donor.id, {
    name: 'Padaria', cnpj: '11222333000181', email: donor.email, phone: '34999990000',
    zipCode: '38400100', street: 'Avenida Brasil', number: '10', neighborhood: 'Centro',
    city: 'Uberlândia', state: 'MG', latitude: -18.9, longitude: -48.3,
  });
  establishmentId = establishment.id;
  authenticate(donor);
});

function publish(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const later = (hours: number) => new Date(now + hours * 3600000).toISOString();
  return POST(new NextRequest('http://localhost/food-batches', {
    method: 'POST',
    body: JSON.stringify({
      establishmentId, name: 'Pão integral', category: 'Padaria', description: 'Pães embalados',
      availableQuantity: 10, expiresAt: later(3), pickupStartsAt: later(1), pickupEndsAt: later(2),
      storageConditions: 'Manter em local seco', fitForConsumption: true,
      ...overrides,
    }),
  }));
}

it('publica lote para um estabelecimento aprovado do titular', async () => {
  await establishments.updateStatus(establishmentId, 'APPROVED');
  const response = await publish();
  expect(response.status).toBe(201);
  expect((await response.json()).data).toMatchObject({ id: expect.any(String), publishedAt: expect.any(String) });
});

it('bloqueia estabelecimento pendente, doador sem vínculo e sessão ausente', async () => {
  expect((await publish()).status).toBe(403);
  await establishments.updateStatus(establishmentId, 'APPROVED');
  authenticate(await users.create({
    name: 'Outro doador', email: 'outro@test.com', passwordHash: 'hash', role: 'DONOR',
  }));
  expect((await publish()).status).toBe(403);
  authenticate();
  expect((await publish()).status).toBe(401);
});

it.each([
  { expiresAt: '2000-01-01T00:00:00Z' },
  { pickupEndsAt: '2000-01-01T00:00:00Z' },
  { pickupStartsAt: '2099-01-01T00:00:00Z' },
  { pickupEndsAt: '2099-01-01T00:00:00Z' },
  { availableQuantity: 0 },
  { fitForConsumption: false },
])('rejeita dados inválidos (%j)', async (overrides) => {
  await establishments.updateStatus(establishmentId, 'APPROVED');
  expect((await publish(overrides)).status).toBe(400);
});

it('edita, inativa e encerra uma oferta sem expor o lote indisponível ao receptor', async () => {
  await establishments.updateStatus(establishmentId, 'APPROVED');
  const response = await publish();
  expect(response.status).toBe(201);
  const { data: { id } } = await response.json();
  const update = (body: object) => PATCH(new NextRequest(`http://localhost/food-batches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }), { params: { id } });

  expect(await listAvailableFoodBatches()).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));

  const otherDonor = await users.create({
    name: 'Outro doador', email: 'outro@test.com', passwordHash: 'hash', role: 'DONOR',
  });
  authenticate(otherDonor);
  expect(await listDonorFoodBatches(otherDonor.id)).toEqual([]);
  expect((await update({ revision: 0, status: 'INACTIVE' })).status).toBe(404);

  authenticate(donor);
  expect((await update({ revision: 0, availableQuantity: 100 })).status).toBe(400);
  const edited = await update({ revision: 0, name: 'Pão integral fatiado' });
  expect(edited.status).toBe(200);
  expect((await edited.json()).data).toMatchObject({ name: 'Pão integral fatiado', revision: 1 });
  expect((await update({ revision: 0, status: 'INACTIVE' })).status).toBe(409);

  expect((await update({ revision: 1, status: 'INACTIVE' })).status).toBe(200);
  expect((await listAvailableFoodBatches()).some((batch) => batch.id === id)).toBe(false);
  expect(await listDonorFoodBatches(donor.id)).toEqual([
    expect.objectContaining({ id, status: 'INACTIVE', availableQuantity: 10, revision: 2 }),
  ]);

  expect((await update({ revision: 2, status: 'CLOSED' })).status).toBe(200);
  expect((await update({ revision: 3, name: 'Alteração posterior' })).status).toBe(409);
});
