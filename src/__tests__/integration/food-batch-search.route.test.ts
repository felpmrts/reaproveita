import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { GET, POST } from '@/app/food-batches/route';
import { PATCH } from '@/app/food-batches/[id]/route';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import { clearFoodBatchesStore } from '@/repositories/food-batch.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const users = getInMemoryUserRepository();
const establishments = getInMemoryEstablishmentRepository();

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
  const offset = (hours: number) => new Date(now + hours * 3600000).toISOString();

  const response = await POST(
    new NextRequest('http://localhost/food-batches', {
      method: 'POST',
      body: JSON.stringify({
        establishmentId,
        name: 'Oferta Padrão',
        category: 'Outros',
        description: 'Descrição padrão',
        availableQuantity: 5,
        expiresAt: offset(24),
        pickupStartsAt: offset(-0.5),
        pickupEndsAt: offset(12),
        storageConditions: 'Local fresco',
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
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T14:00:00.000Z'));

  await users.clear();
  await establishments.clear();
  clearFoodBatchesStore();

  donor = await users.create({
    name: 'Doador Pesquisa',
    email: 'doador-pesquisa@test.com',
    passwordHash: 'hash',
    role: 'DONOR',
  });

  receiver = await users.create({
    name: 'Receptor Pesquisa',
    email: 'receptor-pesquisa@test.com',
    passwordHash: 'hash',
    role: 'RECEIVER',
  });

  const est = await establishments.create(donor.id, {
    name: 'Hortifruti Serra',
    cnpj: '11222333000181',
    email: 'contato@serra.com',
    phone: '34999990001',
    zipCode: '38400100',
    street: 'Av. João Naves',
    number: '300',
    neighborhood: 'Santa Mônica',
    city: 'Uberlândia',
    state: 'MG',
    latitude: -18.9186,
    longitude: -48.2772,
  });
  await establishments.updateStatus(est.id, 'APPROVED');
  establishmentId = est.id;
  authenticate(donor);
});

describe('GET /food-batches (Pesquisa e Filtragem — ST11 / SCRUM-80)', () => {
  it('pesquisa pelo nome do alimento e filtra por categoria, validade e disponibilidade individualmente e em conjunto', async () => {
    const hours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

    const breadTodayId = await publishOffer({
      name: 'Pão Francês Artesanal',
      category: 'Pães e produtos de padaria',
      availableQuantity: 8,
      expiresAt: hours(5), // 2026-11-19T19:00Z (16:00 SP)
      pickupStartsAt: hours(-0.5), // já aberto
      pickupEndsAt: hours(4),
    });

    const breadLaterId = await publishOffer({
      name: 'Pão Integral Fatiado',
      category: 'Pães e produtos de padaria',
      availableQuantity: 3,
      expiresAt: hours(36), // 2026-11-21
      pickupStartsAt: hours(3), // hoje mais tarde (14:00 SP)
      pickupEndsAt: hours(24),
    });

    const fruitId = await publishOffer({
      name: 'Cesta de Maçãs e Peras',
      category: 'Frutas, verduras e legumes',
      availableQuantity: 10,
      expiresAt: hours(48),
      pickupStartsAt: hours(28), // amanhã
      pickupEndsAt: hours(40),
    });

    const inactiveBreadId = await publishOffer({
      name: 'Pão Francês Inativo',
      category: 'Pães e produtos de padaria',
      availableQuantity: 10,
      expiresAt: hours(5),
      pickupStartsAt: hours(-0.5),
      pickupEndsAt: hours(4),
    });
    await PATCH(
      new NextRequest(`http://localhost/food-batches/${inactiveBreadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: 0, status: 'INACTIVE' }),
      }),
      { params: { id: inactiveBreadId } }
    );

    authenticate(receiver);

    // 1. Pesquisa por nome (sem acento e case-insensitive) — exclui lote inativo
    const bySearch = await GET(new NextRequest('http://localhost/food-batches?search=pao'));
    expect(bySearch.status).toBe(200);
    expect(bySearch.headers.get('Cache-Control')).toBe('no-store');
    const searchJson = await bySearch.json();
    expect(searchJson.data.map((o: { id: string }) => o.id)).toEqual([breadTodayId, breadLaterId]);

    // 2. Filtro por categoria
    const byCategory = await GET(
      new NextRequest(
        `http://localhost/food-batches?category=${encodeURIComponent('Frutas, verduras e legumes')}`
      )
    );
    expect(byCategory.status).toBe(200);
    expect((await byCategory.json()).data.map((o: { id: string }) => o.id)).toEqual([fruitId]);

    // 3. Filtro por validade (data limite e preset)
    const byExpiresUntil = await GET(
      new NextRequest('http://localhost/food-batches?expiresUntil=2026-11-19')
    );
    expect((await byExpiresUntil.json()).data.map((o: { id: string }) => o.id)).toEqual([
      breadTodayId,
    ]);

    const byValidity = await GET(new NextRequest('http://localhost/food-batches?validity=NEXT_48H'));
    expect((await byValidity.json()).data.map((o: { id: string }) => o.id)).toEqual([
      breadTodayId,
      breadLaterId,
      fruitId,
    ]);

    // 4. Filtro por disponibilidade (retirada imediata, retirada hoje e quantidade mínima)
    const byPickupNow = await GET(
      new NextRequest('http://localhost/food-batches?availability=PICKUP_NOW')
    );
    expect((await byPickupNow.json()).data.map((o: { id: string }) => o.id)).toEqual([breadTodayId]);

    const byPickupToday = await GET(
      new NextRequest('http://localhost/food-batches?availability=PICKUP_TODAY')
    );
    expect((await byPickupToday.json()).data.map((o: { id: string }) => o.id)).toEqual([
      breadTodayId,
      breadLaterId,
    ]);

    const byMinQty = await GET(new NextRequest('http://localhost/food-batches?minQuantity=8'));
    expect((await byMinQty.json()).data.map((o: { id: string }) => o.id)).toEqual([
      breadTodayId,
      fruitId,
    ]);

    // 5. Combinação de diferentes filtros
    const combined = await GET(
      new NextRequest(
        `http://localhost/food-batches?search=pao&category=${encodeURIComponent('Pães e produtos de padaria')}&expiresUntil=2026-11-21&availability=PICKUP_TODAY&minQuantity=5`
      )
    );
    expect(combined.status).toBe(200);
    const combinedJson = await combined.json();
    expect(combinedJson.meta.total).toBe(1);
    expect(combinedJson.data[0].id).toBe(breadTodayId);

    // 6. Sem query params (após limpar filtros) restaura todas as ofertas elegíveis
    const cleared = await GET(new NextRequest('http://localhost/food-batches'));
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data.map((o: { id: string }) => o.id)).toEqual([
      breadTodayId,
      breadLaterId,
      fruitId,
    ]);
  });

  it('retorna 400 VALIDATION_ERROR para parâmetros de filtro inválidos', async () => {
    authenticate(receiver);

    const invalidQty = await GET(new NextRequest('http://localhost/food-batches?minQuantity=0'));
    expect(invalidQty.status).toBe(400);
    expect(invalidQty.headers.get('Cache-Control')).toBe('no-store');
    expect((await invalidQty.json()).error.code).toBe('VALIDATION_ERROR');

    const invalidDate = await GET(
      new NextRequest('http://localhost/food-batches?expiresUntil=2026-02-31')
    );
    expect(invalidDate.status).toBe(400);
    expect((await invalidDate.json()).error.code).toBe('VALIDATION_ERROR');

    const invertedRange = await GET(
      new NextRequest('http://localhost/food-batches?expiresFrom=2026-11-25&expiresUntil=2026-11-20')
    );
    expect(invertedRange.status).toBe(400);
    expect((await invertedRange.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
