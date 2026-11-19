import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { POST } from '@/app/food-batches/route';
import { GET, PATCH } from '@/app/food-batches/[id]/route';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { FoodBatch } from '@/repositories/food-batch.repository';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const users = getInMemoryUserRepository();
const establishments = getInMemoryEstablishmentRepository();
const store = globalThis as typeof globalThis & { foodBatches?: Map<string, FoodBatch> };

let donor: UserEntity;
let establishmentId: string;

function authenticate(user?: UserEntity) {
  vi.mocked(cookies).mockReturnValue({
    get: () => (user ? { value: JSON.stringify({ email: user.email, role: user.role }) } : undefined),
  } as ReturnType<typeof cookies>);
}

async function createBatch(hoursToExpiry = 2) {
  const now = Date.now();
  const later = (hours: number) => new Date(now + hours * 3600000).toISOString();

  const response = await POST(
    new NextRequest('http://localhost/food-batches', {
      method: 'POST',
      body: JSON.stringify({
        establishmentId,
        name: 'Cesta de Hortifruti',
        category: 'Hortifruti',
        description: 'Legumes e verduras frescas selecionadas no fim do expediente.',
        availableQuantity: 8,
        expiresAt: later(hoursToExpiry + 1),
        pickupStartsAt: later(0.5),
        pickupEndsAt: later(hoursToExpiry),
        storageConditions: 'Manter refrigerado entre 4°C e 8°C',
        fitForConsumption: true,
      }),
    })
  );

  const json = await response.json();
  return json.data.id as string;
}

beforeEach(async () => {
  await users.clear();
  await establishments.clear();
  store.foodBatches?.clear();

  donor = await users.create({
    name: 'Doador Detalhes',
    email: 'doador-detalhes@test.com',
    passwordHash: 'hash',
    role: 'DONOR',
  });

  const establishment = await establishments.create(donor.id, {
    name: 'Sacolão Central',
    cnpj: '11222333000181',
    email: 'contato@sacolao.com',
    phone: '34999991111',
    zipCode: '38400100',
    street: 'Avenida Afonso Pena',
    number: '450',
    complement: 'Loja 2',
    neighborhood: 'Centro',
    city: 'Uberlândia',
    state: 'MG',
    latitude: -18.9186,
    longitude: -48.2772,
  });

  await establishments.updateStatus(establishment.id, 'APPROVED');
  establishmentId = establishment.id;
  authenticate(donor);
});

describe('GET /food-batches/[id]', () => {
  it('retorna detalhes completos do lote, estabelecimento, urgência e disponibilidade para reserva', async () => {
    const batchId = await createBatch(2);
    authenticate();

    const response = await GET(new NextRequest(`http://localhost/food-batches/${batchId}`), {
      params: { id: batchId },
    });

    expect(response.status).toBe(200);
    const { success, data } = await response.json();
    expect(success).toBe(true);
    expect(data).toMatchObject({
      id: batchId,
      name: 'Cesta de Hortifruti',
      description: 'Legumes e verduras frescas selecionadas no fim do expediente.',
      availableQuantity: 8,
      storageConditions: 'Manter refrigerado entre 4°C e 8°C',
      reservable: true,
      isExpired: false,
      unavailableReason: null,
      urgency: {
        level: 'CRITICAL',
        label: 'Urgência máxima',
      },
      establishment: {
        id: establishmentId,
        name: 'Sacolão Central',
        street: 'Avenida Afonso Pena',
        number: '450',
        complement: 'Loja 2',
        neighborhood: 'Centro',
        city: 'Uberlândia',
        state: 'MG',
        zipCode: '38400100',
        phone: '34999991111',
        email: 'contato@sacolao.com',
        latitude: -18.9186,
        longitude: -48.2772,
      },
    });
  });

  it('marca lote inativo como não reservável', async () => {
    const batchId = await createBatch(5);

    await PATCH(
      new NextRequest(`http://localhost/food-batches/${batchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: 0, status: 'INACTIVE' }),
      }),
      { params: { id: batchId } }
    );

    const response = await GET(new NextRequest(`http://localhost/food-batches/${batchId}`), {
      params: { id: batchId },
    });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.reservable).toBe(false);
    expect(data.unavailableReason).toBe('INACTIVE');
  });

  it('marca lote expirado como não reservável', async () => {
    const batchId = await createBatch(5);
    const stored = store.foodBatches?.get(batchId);
    expect(stored).toBeDefined();
    if (stored) {
      store.foodBatches?.set(batchId, {
        ...stored,
        expiresAt: '2020-01-01T00:00:00.000Z',
        pickupEndsAt: '2020-01-01T00:00:00.000Z',
      });
    }

    const response = await GET(new NextRequest(`http://localhost/food-batches/${batchId}`), {
      params: { id: batchId },
    });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.isExpired).toBe(true);
    expect(data.reservable).toBe(false);
    expect(data.unavailableReason).toBe('EXPIRED');
    expect(data.urgency.level).toBe('EXPIRED');
  });

  it('retorna 404 para ID inválido ou inexistente', async () => {
    const invalid = await GET(new NextRequest('http://localhost/food-batches/nao-e-uuid'), {
      params: { id: 'nao-e-uuid' },
    });
    expect(invalid.status).toBe(404);

    const missing = await GET(
      new NextRequest('http://localhost/food-batches/00000000-0000-4000-8000-000000000000'),
      { params: { id: '00000000-0000-4000-8000-000000000000' } }
    );
    expect(missing.status).toBe(404);
  });
});
