import { beforeEach, describe, expect, it } from 'vitest';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  clearFoodBatchesStore,
  type FoodBatch,
} from '@/repositories/food-batch.repository';
import { parseFoodBatchCatalogSearchParams } from '@/schemas/food-batch.schema';
import {
  isFoodBatchEligibleForCatalog,
  listActiveFoodBatchCatalog,
} from '@/services/food-batch.service';

const establishments = getInMemoryEstablishmentRepository();
const store = globalThis as typeof globalThis & { foodBatches?: Map<string, FoodBatch> };

const baseNow = new Date('2026-11-19T12:00:00.000Z');
const offsetMs = (ms: number) => new Date(baseNow.getTime() + ms).toISOString();
const hoursFromBase = (hours: number) => offsetMs(hours * 3600000);

function makeBatch(overrides: Partial<FoodBatch> = {}): FoodBatch {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    establishmentId: '22222222-2222-4222-8222-222222222222',
    publishedBy: '33333333-3333-4333-8333-333333333333',
    publishedAt: hoursFromBase(-1),
    name: 'Lote Padrão',
    category: 'Padaria',
    description: 'Descrição do lote padrão',
    availableQuantity: 5,
    expiresAt: hoursFromBase(6),
    pickupStartsAt: hoursFromBase(1),
    pickupEndsAt: hoursFromBase(4),
    storageConditions: 'Ambiente seco',
    fitForConsumption: true,
    status: 'ACTIVE',
    revision: 0,
    ...overrides,
  };
}

describe('isFoodBatchEligibleForCatalog', () => {
  it('permite ofertas ativas, próprias para consumo, com estoque e prazos no futuro (incluindo retirada agendada)', () => {
    expect(
      isFoodBatchEligibleForCatalog(
        makeBatch({
          pickupStartsAt: hoursFromBase(2),
          pickupEndsAt: hoursFromBase(5),
          expiresAt: hoursFromBase(8),
        }),
        baseNow
      )
    ).toBe(true);
  });

  it('rejeita ofertas quando expiresAt ou pickupEndsAt atingem exatamente o instante atual ou estão no passado', () => {
    expect(
      isFoodBatchEligibleForCatalog(makeBatch({ expiresAt: offsetMs(0) }), baseNow)
    ).toBe(false);
    expect(
      isFoodBatchEligibleForCatalog(makeBatch({ pickupEndsAt: offsetMs(0) }), baseNow)
    ).toBe(false);
    expect(
      isFoodBatchEligibleForCatalog(makeBatch({ expiresAt: offsetMs(1), pickupEndsAt: offsetMs(1) }), baseNow)
    ).toBe(true);
  });

  it('rejeita ofertas inativas, encerradas, sem estoque ou sem aceite sanitário', () => {
    expect(isFoodBatchEligibleForCatalog(makeBatch({ status: 'INACTIVE' }), baseNow)).toBe(false);
    expect(isFoodBatchEligibleForCatalog(makeBatch({ status: 'CLOSED' }), baseNow)).toBe(false);
    expect(isFoodBatchEligibleForCatalog(makeBatch({ availableQuantity: 0 }), baseNow)).toBe(false);
    expect(
      isFoodBatchEligibleForCatalog(
        makeBatch({ fitForConsumption: false as unknown as true }),
        baseNow
      )
    ).toBe(false);
  });
});

describe('listActiveFoodBatchCatalog', () => {
  beforeEach(async () => {
    await establishments.clear();
    clearFoodBatchesStore();
  });

  it('filtra estabelecimentos não aprovados e ordena pelo menor prazo e publicação mais recente', async () => {
    const approvedEst = await establishments.create('donor-1', {
      name: 'Empório Aprovado',
      cnpj: '11222333000181',
      email: 'aprovado@test.com',
      phone: '34999990001',
      zipCode: '38400100',
      street: 'Rua A',
      number: '10',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.91,
      longitude: -48.27,
    });
    await establishments.updateStatus(approvedEst.id, 'APPROVED');

    const rejectedEst = await establishments.create('donor-2', {
      name: 'Loja Rejeitada',
      cnpj: '22333444000182',
      email: 'rejeitada@test.com',
      phone: '34999990002',
      zipCode: '38400101',
      street: 'Rua B',
      number: '20',
      neighborhood: 'Brasil',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.92,
      longitude: -48.28,
    });
    await establishments.updateStatus(rejectedEst.id, 'REJECTED');

    const pendingEst = await establishments.create('donor-3', {
      name: 'Loja Pendente',
      cnpj: '33444555000183',
      email: 'pendente@test.com',
      phone: '34999990003',
      zipCode: '38400102',
      street: 'Rua C',
      number: '30',
      neighborhood: 'Martins',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.93,
      longitude: -48.29,
    });

    store.foodBatches ??= new Map();
    store.foodBatches.set(
      'aaaa1111-1111-4111-8111-111111111111',
      makeBatch({
        id: 'aaaa1111-1111-4111-8111-111111111111',
        establishmentId: approvedEst.id,
        name: 'Oferta Prazo Longo',
        expiresAt: hoursFromBase(20),
        pickupEndsAt: hoursFromBase(15),
        publishedAt: hoursFromBase(-2),
      })
    );
    store.foodBatches.set(
      'bbbb2222-2222-4222-8222-222222222222',
      makeBatch({
        id: 'bbbb2222-2222-4222-8222-222222222222',
        establishmentId: approvedEst.id,
        name: 'Oferta Empate Mais Antiga',
        expiresAt: hoursFromBase(4),
        pickupEndsAt: hoursFromBase(3),
        publishedAt: hoursFromBase(-3),
      })
    );
    store.foodBatches.set(
      'cccc3333-3333-4333-8333-333333333333',
      makeBatch({
        id: 'cccc3333-3333-4333-8333-333333333333',
        establishmentId: approvedEst.id,
        name: 'Oferta Empate Mais Nova',
        expiresAt: hoursFromBase(5),
        pickupEndsAt: hoursFromBase(3),
        publishedAt: hoursFromBase(-0.5),
      })
    );
    store.foodBatches.set(
      'dddd4444-4444-4444-8444-444444444444',
      makeBatch({
        id: 'dddd4444-4444-4444-8444-444444444444',
        establishmentId: rejectedEst.id,
        name: 'Oferta Rejeitada',
      })
    );
    store.foodBatches.set(
      'eeee5555-5555-4555-8555-555555555555',
      makeBatch({
        id: 'eeee5555-5555-4555-8555-555555555555',
        establishmentId: pendingEst.id,
        name: 'Oferta Pendente',
      })
    );

    const result = await listActiveFoodBatchCatalog(baseNow);

    expect(result.updatedAt).toBe(baseNow.toISOString());
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.name)).toEqual([
      'Oferta Empate Mais Nova',
      'Oferta Empate Mais Antiga',
      'Oferta Prazo Longo',
    ]);
    expect(result.items[0].establishment).toEqual({
      id: approvedEst.id,
      name: 'Empório Aprovado',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
    });
  });

  it('filtra por nome, categoria, validade, disponibilidade e combinação de filtros', async () => {
    const approvedEst = await establishments.create('donor-filter', {
      name: 'Padaria Filtro',
      cnpj: '44555666000184',
      email: 'filtro@test.com',
      phone: '34999990004',
      zipCode: '38400105',
      street: 'Rua D',
      number: '40',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.91,
      longitude: -48.27,
    });
    await establishments.updateStatus(approvedEst.id, 'APPROVED');

    store.foodBatches ??= new Map();
    // baseNow = 2026-11-19T12:00:00Z (09:00 SP)
    store.foodBatches.set(
      '1111aaaa-1111-4111-8111-111111111111',
      makeBatch({
        id: '1111aaaa-1111-4111-8111-111111111111',
        establishmentId: approvedEst.id,
        name: 'Pão Integral Artesanal',
        category: 'Pães e produtos de padaria',
        availableQuantity: 6,
        expiresAt: hoursFromBase(5), // 2026-11-19T17:00Z (14:00 SP)
        pickupStartsAt: hoursFromBase(-1), // já disponível agora
        pickupEndsAt: hoursFromBase(4),
      })
    );
    store.foodBatches.set(
      '2222bbbb-2222-4222-8222-222222222222',
      makeBatch({
        id: '2222bbbb-2222-4222-8222-222222222222',
        establishmentId: approvedEst.id,
        name: 'Pães de Queijo Congelados',
        category: 'Pães e produtos de padaria',
        availableQuantity: 2,
        expiresAt: hoursFromBase(30), // 2026-11-20T18:00Z
        pickupStartsAt: hoursFromBase(2), // hoje mais tarde (11:00 SP)
        pickupEndsAt: hoursFromBase(20),
      })
    );
    store.foodBatches.set(
      '3333cccc-3333-4333-8333-333333333333',
      makeBatch({
        id: '3333cccc-3333-4333-8333-333333333333',
        establishmentId: approvedEst.id,
        name: 'Maçãs Orgânicas',
        category: 'Frutas, verduras e legumes',
        availableQuantity: 10,
        expiresAt: hoursFromBase(72),
        pickupStartsAt: hoursFromBase(36), // outro dia
        pickupEndsAt: hoursFromBase(60),
      })
    );

    const bySearchAccent = await listActiveFoodBatchCatalog({ search: 'pao' }, baseNow);
    expect(bySearchAccent.items.map((item) => item.name)).toEqual(['Pão Integral Artesanal']);

    const byCategory = await listActiveFoodBatchCatalog(
      { category: 'paes e produtos de padaria' },
      baseNow
    );
    expect(byCategory.total).toBe(2);

    const byExpiresUntilToday = await listActiveFoodBatchCatalog(
      { expiresUntil: '2026-11-19' },
      baseNow
    );
    expect(byExpiresUntilToday.items.map((item) => item.name)).toEqual(['Pão Integral Artesanal']);

    const byValidityPreset = await listActiveFoodBatchCatalog({ validity: 'NEXT_48H' }, baseNow);
    expect(byValidityPreset.items.map((item) => item.name)).toEqual([
      'Pão Integral Artesanal',
      'Pães de Queijo Congelados',
    ]);

    const byPickupNow = await listActiveFoodBatchCatalog({ availability: 'PICKUP_NOW' }, baseNow);
    expect(byPickupNow.items.map((item) => item.name)).toEqual(['Pão Integral Artesanal']);

    const byPickupToday = await listActiveFoodBatchCatalog({ availability: 'PICKUP_TODAY' }, baseNow);
    expect(byPickupToday.items.map((item) => item.name)).toEqual([
      'Pão Integral Artesanal',
      'Pães de Queijo Congelados',
    ]);

    const byMinQty = await listActiveFoodBatchCatalog({ minQuantity: 6 }, baseNow);
    expect(byMinQty.items.map((item) => item.name)).toEqual([
      'Pão Integral Artesanal',
      'Maçãs Orgânicas',
    ]);

    const combined = await listActiveFoodBatchCatalog(
      {
        search: 'PAO',
        category: 'Pães e produtos de padaria',
        expiresUntil: '2026-11-19',
        availability: 'PICKUP_NOW',
        minQuantity: 4,
      },
      baseNow
    );
    expect(combined.items.map((item) => item.name)).toEqual(['Pão Integral Artesanal']);
  });
});

describe('parseFoodBatchCatalogSearchParams', () => {
  it('normaliza strings vazias e aceita parâmetros combinados válidos', () => {
    const parsed = parseFoodBatchCatalogSearchParams(
      new URLSearchParams({
        search: '  pão ',
        category: '',
        expiresFrom: '2026-11-19',
        expiresUntil: '2026-11-20',
        validity: 'NEXT_48H',
        availability: 'PICKUP_TODAY',
        minQuantity: '3',
      })
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        search: 'pão',
        category: undefined,
        expiresFrom: '2026-11-19',
        expiresUntil: '2026-11-20',
        validity: 'NEXT_48H',
        availability: 'PICKUP_TODAY',
        minQuantity: 3,
      });
    }
  });

  it.each([
    { minQuantity: '0' },
    { minQuantity: '-2' },
    { minQuantity: '1.5' },
    { minQuantity: 'abc' },
    { expiresUntil: '2026-02-31' },
    { expiresFrom: 'data-invalida' },
    { availability: 'INVALIDO' },
    { validity: 'NEXT_YEAR' },
    { expiresFrom: '2026-11-25', expiresUntil: '2026-11-20' },
  ])('rejeita filtros inválidos (%j)', (params) => {
    const parsed = parseFoodBatchCatalogSearchParams(params);
    expect(parsed.success).toBe(false);
  });
});
