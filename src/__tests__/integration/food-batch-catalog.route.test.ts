import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { GET, POST } from '@/app/food-batches/route';
import { PATCH } from '@/app/food-batches/[id]/route';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  clearFoodBatchesStore,
  type FoodBatch,
} from '@/repositories/food-batch.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import type { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const users = getInMemoryUserRepository();
const establishments = getInMemoryEstablishmentRepository();
const store = globalThis as typeof globalThis & { foodBatches?: Map<string, FoodBatch> };

let donor: UserEntity;
let receiver: UserEntity;
let approvedEstablishmentId: string;
let pendingEstablishmentId: string;

function authenticate(user?: UserEntity) {
  vi.mocked(cookies).mockReturnValue({
    get: () => (user ? { value: JSON.stringify({ email: user.email, role: user.role }) } : undefined),
  } as ReturnType<typeof cookies>);
}

async function publishOffer(overrides: Record<string, unknown> = {}, targetEstablishmentId = approvedEstablishmentId) {
  const now = Date.now();
  const later = (hours: number) => new Date(now + hours * 3600000).toISOString();

  const response = await POST(
    new NextRequest('http://localhost/food-batches', {
      method: 'POST',
      body: JSON.stringify({
        establishmentId: targetEstablishmentId,
        name: 'Cesta de Frutas',
        category: 'Frutas, verduras e legumes',
        description: 'Maçãs, bananas e laranjas frescas selecionadas no fim do expediente.',
        availableQuantity: 6,
        expiresAt: later(10),
        pickupStartsAt: later(1),
        pickupEndsAt: later(8),
        storageConditions: 'Manter em local fresco',
        fitForConsumption: true,
        ...overrides,
      }),
    })
  );

  expect(response.status).toBe(201);
  const json = await response.json();
  return json.data.id as string;
}

beforeEach(async () => {
  await users.clear();
  await establishments.clear();
  clearFoodBatchesStore();

  donor = await users.create({
    name: 'Doador Catálogo',
    email: 'doador-catalogo@test.com',
    passwordHash: 'hash',
    role: 'DONOR',
  });

  receiver = await users.create({
    name: 'Receptor Catálogo',
    email: 'receptor-catalogo@test.com',
    passwordHash: 'hash',
    role: 'RECEIVER',
  });

  const approvedEstablishment = await establishments.create(donor.id, {
    name: 'Mercado Bom Dia',
    cnpj: '11222333000181',
    email: 'contato@mercadobomdia.com',
    phone: '34999990001',
    zipCode: '38400100',
    street: 'Avenida Brasil',
    number: '100',
    neighborhood: 'Centro',
    city: 'Uberlândia',
    state: 'MG',
    latitude: -18.9186,
    longitude: -48.2772,
  });
  await establishments.updateStatus(approvedEstablishment.id, 'APPROVED');
  approvedEstablishmentId = approvedEstablishment.id;

  const pendingEstablishment = await establishments.create(donor.id, {
    name: 'Padaria Pendente',
    cnpj: '99888777000166',
    email: 'contato@padariapendente.com',
    phone: '34999990002',
    zipCode: '38400200',
    street: 'Rua Goiás',
    number: '55',
    neighborhood: 'Fundinho',
    city: 'Uberlândia',
    state: 'MG',
    latitude: -18.919,
    longitude: -48.276,
  });
  pendingEstablishmentId = pendingEstablishment.id;

  authenticate(donor);
});

describe('GET /food-batches', () => {
  it('retorna lista vazia quando não existem ofertas elegíveis', async () => {
    authenticate(receiver);
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body).toEqual({
      success: true,
      data: [],
      meta: {
        total: 0,
        updatedAt: expect.any(String),
      },
    });
  });

  it('exibe somente ofertas elegíveis para reserva e omite inativas, encerradas, sem estoque, expiradas, impróprias ou de estabelecimento não aprovado', async () => {
    const later = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
    const past = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();

    const eligibleId = await publishOffer({
      name: 'Pães Integrais Elegíveis',
      category: 'Pães e produtos de padaria',
      availableQuantity: 5,
      expiresAt: later(6),
      pickupEndsAt: later(4),
    });

    const inactiveId = await publishOffer({ name: 'Lote Inativo' });
    await PATCH(
      new NextRequest(`http://localhost/food-batches/${inactiveId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: 0, status: 'INACTIVE' }),
      }),
      { params: { id: inactiveId } }
    );

    const closedId = await publishOffer({ name: 'Lote Encerrado' });
    await PATCH(
      new NextRequest(`http://localhost/food-batches/${closedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: 0, status: 'CLOSED' }),
      }),
      { params: { id: closedId } }
    );

    const outOfStockId = await publishOffer({ name: 'Lote Esgotado' });
    const outOfStockBatch = store.foodBatches?.get(outOfStockId);
    if (outOfStockBatch) {
      store.foodBatches?.set(outOfStockId, { ...outOfStockBatch, availableQuantity: 0 });
    }

    const expiredId = await publishOffer({ name: 'Lote Expirado' });
    const expiredBatch = store.foodBatches?.get(expiredId);
    if (expiredBatch) {
      store.foodBatches?.set(expiredId, { ...expiredBatch, expiresAt: past(1) });
    }

    const expiredPickupId = await publishOffer({ name: 'Janela Encerrada' });
    const expiredPickupBatch = store.foodBatches?.get(expiredPickupId);
    if (expiredPickupBatch) {
      store.foodBatches?.set(expiredPickupId, {
        ...expiredPickupBatch,
        expiresAt: later(12),
        pickupEndsAt: past(0.5),
      });
    }

    const unfitId = await publishOffer({ name: 'Lote Impróprio' });
    const unfitBatch = store.foodBatches?.get(unfitId);
    if (unfitBatch) {
      store.foodBatches?.set(unfitId, {
        ...unfitBatch,
        fitForConsumption: false as unknown as true,
      });
    }

    const suspendedEstablishment = await establishments.create(donor.id, {
      name: 'Estabelecimento Suspenso',
      cnpj: '22333444000199',
      email: 'suspenso@test.com',
      phone: '34999990003',
      zipCode: '38400300',
      street: 'Rua Santos Dumont',
      number: '80',
      neighborhood: 'Lídice',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.92,
      longitude: -48.28,
    });
    await establishments.updateStatus(suspendedEstablishment.id, 'APPROVED');
    await publishOffer({ name: 'Lote de Estabelecimento Suspenso' }, suspendedEstablishment.id);
    await establishments.updateStatus(suspendedEstablishment.id, 'SUSPENDED');

    // Lote vinculado a estabelecimento pendente (inserido diretamente para simular divergência)
    store.foodBatches?.set('99999999-9999-4999-8999-999999999999', {
      id: '99999999-9999-4999-8999-999999999999',
      establishmentId: pendingEstablishmentId,
      publishedBy: donor.id,
      publishedAt: new Date().toISOString(),
      name: 'Lote de Estabelecimento Pendente',
      category: 'Outros',
      description: 'Não deve aparecer no catálogo.',
      availableQuantity: 4,
      expiresAt: later(6),
      pickupStartsAt: later(1),
      pickupEndsAt: later(5),
      storageConditions: 'Ambiente',
      fitForConsumption: true,
      status: 'ACTIVE',
      revision: 0,
    });

    authenticate(receiver);
    const receiverResponse = await GET();
    expect(receiverResponse.status).toBe(200);
    expect(receiverResponse.headers.get('Cache-Control')).toBe('no-store');

    const receiverJson = await receiverResponse.json();
    expect(receiverJson.success).toBe(true);
    expect(receiverJson.meta.total).toBe(1);
    expect(receiverJson.data).toHaveLength(1);

    const item = receiverJson.data[0];
    expect(item).toMatchObject({
      id: eligibleId,
      name: 'Pães Integrais Elegíveis',
      category: 'Pães e produtos de padaria',
      availableQuantity: 5,
      status: 'ACTIVE',
      reservable: true,
      urgency: {
        level: 'HIGH',
        label: 'Alta urgência',
      },
      establishment: {
        id: approvedEstablishmentId,
        name: 'Mercado Bom Dia',
        neighborhood: 'Centro',
        city: 'Uberlândia',
        state: 'MG',
      },
    });
    expect(item.establishment).not.toHaveProperty('cnpj');
    expect(item.establishment).not.toHaveProperty('ownerId');
    expect(item.establishment).not.toHaveProperty('email');
    expect(item.establishment).not.toHaveProperty('phone');

    // Também funciona sem autenticação, consistente com GET /food-batches/[id]
    authenticate();
    const publicResponse = await GET();
    expect(publicResponse.status).toBe(200);
    const publicJson = await publicResponse.json();
    expect(publicJson.data.map((offer: { id: string }) => offer.id)).toEqual([eligibleId]);
  });

  it('ordena ofertas elegíveis por urgência de vencimento/retirada', async () => {
    const later = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

    const lowId = await publishOffer({
      name: 'Arroz Integral (Prazo Confortável)',
      expiresAt: later(48),
      pickupEndsAt: later(36),
    });
    const criticalId = await publishOffer({
      name: 'Marmitas Prontas (Urgência Máxima)',
      expiresAt: later(3),
      pickupEndsAt: later(1.5),
    });
    const mediumId = await publishOffer({
      name: 'Iogurtes Naturais (Urgência Moderada)',
      expiresAt: later(15),
      pickupEndsAt: later(12),
    });
    const highId = await publishOffer({
      name: 'Pães de Queijo (Alta Urgência)',
      expiresAt: later(5),
      pickupEndsAt: later(4),
    });

    authenticate(receiver);
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.map((offer: { id: string; urgency: { level: string } }) => ({
      id: offer.id,
      level: offer.urgency.level,
    }))).toEqual([
      { id: criticalId, level: 'CRITICAL' },
      { id: highId, level: 'HIGH' },
      { id: mediumId, level: 'MEDIUM' },
      { id: lowId, level: 'LOW' },
    ]);
  });

  it('reflete imediatamente atualizações de estoque, edição, inativação e novas publicações', async () => {
    const firstId = await publishOffer({
      name: 'Cesta Matinal',
      availableQuantity: 8,
    });

    authenticate(receiver);
    const initialRes = await GET();
    const initialJson = await initialRes.json();
    expect(initialJson.data).toHaveLength(1);
    expect(initialJson.data[0].availableQuantity).toBe(8);

    // Simula abatimento de estoque e edição pelo doador
    const stored = store.foodBatches?.get(firstId);
    expect(stored).toBeDefined();
    if (stored) {
      store.foodBatches?.set(firstId, { ...stored, availableQuantity: 3 });
    }

    authenticate(donor);
    await PATCH(
      new NextRequest(`http://localhost/food-batches/${firstId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: 0, name: 'Cesta Matinal Atualizada' }),
      }),
      { params: { id: firstId } }
    );
    const secondId = await publishOffer({ name: 'Nova Oferta Publicada', availableQuantity: 4 });

    authenticate(receiver);
    const updatedRes = await GET();
    const updatedJson = await updatedRes.json();
    expect(updatedJson.meta.total).toBe(2);
    expect(updatedJson.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstId, name: 'Cesta Matinal Atualizada', availableQuantity: 3 }),
        expect.objectContaining({ id: secondId, name: 'Nova Oferta Publicada', availableQuantity: 4 }),
      ])
    );

    // Esgota estoque do primeiro lote e inativa o segundo
    const updatedFirst = store.foodBatches?.get(firstId);
    if (updatedFirst) {
      store.foodBatches?.set(firstId, { ...updatedFirst, availableQuantity: 0 });
    }
    authenticate(donor);
    await PATCH(
      new NextRequest(`http://localhost/food-batches/${secondId}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: 0, status: 'INACTIVE' }),
      }),
      { params: { id: secondId } }
    );

    authenticate(receiver);
    const finalRes = await GET();
    const finalJson = await finalRes.json();
    expect(finalJson.meta.total).toBe(0);
    expect(finalJson.data).toEqual([]);
  });
});
