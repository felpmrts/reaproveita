import { readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFoodBatchesStore,
  findFoodBatchById,
  listDonorFoodBatches,
  manageFoodBatch,
  type FoodBatch,
} from '@/repositories/food-batch.repository';
import {
  calculateFoodBatchUrgency,
  evaluateFoodBatchAvailability,
  FoodBatchUnavailableForReservationError,
  getFoodBatchHistory,
  runFoodBatchExpirationSweep,
  validateFoodBatchForReservation,
} from '@/services/food-batch.service';

const store = globalThis as typeof globalThis & { foodBatches?: Map<string, FoodBatch> };

const baseNow = new Date('2026-11-19T12:00:00.000Z');
const offsetMs = (ms: number) => new Date(baseNow.getTime() + ms).toISOString();

function makeBatch(overrides: Partial<FoodBatch> = {}): FoodBatch {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    establishmentId: '22222222-2222-4222-8222-222222222222',
    publishedBy: '33333333-3333-4333-8333-333333333333',
    publishedAt: offsetMs(-3600_000),
    name: 'Lote Teste Expiração',
    category: 'Padaria',
    description: 'Pães do dia',
    availableQuantity: 5,
    expiresAt: offsetMs(3600_000),
    pickupStartsAt: offsetMs(-1800_000),
    pickupEndsAt: offsetMs(1800_000),
    storageConditions: 'Local seco',
    fitForConsumption: true,
    status: 'ACTIVE',
    revision: 0,
    expiredAt: null,
    ...overrides,
  };
}

describe('Controle automático de validade e expiração (ST13 / SCRUM-85 / SCRUM-86)', () => {
  beforeEach(() => {
    clearFoodBatchesStore();
    store.foodBatches ??= new Map();
  });

  it('compara data e hora com o horário atual e expira lotes exatamente no limite da validade ou retirada', async () => {
    const expiredByValidityId = 'aaaa1111-1111-4111-8111-111111111111';
    const expiredByPickupId = 'bbbb2222-2222-4222-8222-222222222222';
    const inactiveOverdueId = 'cccc3333-3333-4333-8333-333333333333';
    const stillValidId = 'dddd4444-4444-4444-8444-444444444444';
    const alreadyClosedId = 'eeee5555-5555-4555-8555-555555555555';

    store.foodBatches?.set(
      expiredByValidityId,
      makeBatch({
        id: expiredByValidityId,
        expiresAt: offsetMs(0),
        pickupEndsAt: offsetMs(3600_000),
      })
    );
    store.foodBatches?.set(
      expiredByPickupId,
      makeBatch({
        id: expiredByPickupId,
        expiresAt: offsetMs(3600_000),
        pickupEndsAt: offsetMs(0),
      })
    );
    store.foodBatches?.set(
      inactiveOverdueId,
      makeBatch({
        id: inactiveOverdueId,
        status: 'INACTIVE',
        expiresAt: offsetMs(-1000),
        pickupEndsAt: offsetMs(1000),
      })
    );
    store.foodBatches?.set(
      stillValidId,
      makeBatch({
        id: stillValidId,
        expiresAt: offsetMs(1),
        pickupEndsAt: offsetMs(1),
      })
    );
    store.foodBatches?.set(
      alreadyClosedId,
      makeBatch({
        id: alreadyClosedId,
        status: 'CLOSED',
        expiresAt: offsetMs(-5000),
        pickupEndsAt: offsetMs(-5000),
      })
    );

    const sweep = await runFoodBatchExpirationSweep(baseNow);
    expect(sweep.checkedAt).toBe(baseNow.toISOString());
    expect(sweep.expiredCount).toBe(3);
    expect(sweep.expiredIds).toEqual(
      expect.arrayContaining([expiredByValidityId, expiredByPickupId, inactiveOverdueId])
    );

    // Idempotente em execuções subsequentes
    const secondSweep = await runFoodBatchExpirationSweep(baseNow);
    expect(secondSweep.expiredCount).toBe(0);
    expect(secondSweep.expiredIds).toEqual([]);

    expect(store.foodBatches?.get(stillValidId)?.status).toBe('ACTIVE');
    expect(store.foodBatches?.get(alreadyClosedId)?.status).toBe('CLOSED');
  });

  it('preserva registro histórico da oferta expirada e bloqueia mutações posteriores', async () => {
    const batchId = '1111aaaa-1111-4111-8111-111111111111';
    const donorId = '33333333-3333-4333-8333-333333333333';

    store.foodBatches?.set(
      batchId,
      makeBatch({
        id: batchId,
        publishedBy: donorId,
        expiresAt: offsetMs(-60_000),
        pickupEndsAt: offsetMs(60_000),
      })
    );

    await runFoodBatchExpirationSweep(baseNow);

    const persisted = await findFoodBatchById(batchId, baseNow);
    expect(persisted).toMatchObject({
      id: batchId,
      status: 'EXPIRED',
      expiredAt: baseNow.toISOString(),
      revision: 1,
    });

    const donorBatches = await listDonorFoodBatches(donorId, baseNow);
    expect(donorBatches).toEqual([
      expect.objectContaining({
        id: batchId,
        status: 'EXPIRED',
        expiredAt: baseNow.toISOString(),
      }),
    ]);

    const history = await getFoodBatchHistory(batchId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      changedAt: baseNow.toISOString(),
      reason: 'AUTOMATIC_EXPIRATION',
      revision: 1,
      previous: expect.objectContaining({ status: 'ACTIVE', revision: 0 }),
      current: expect.objectContaining({
        status: 'EXPIRED',
        revision: 1,
        expiredAt: baseNow.toISOString(),
      }),
    });

    const editConflict = await manageFoodBatch(
      donorId,
      batchId,
      { revision: 1, name: 'Tentativa após expiração' },
      baseNow
    );
    expect(editConflict).toBe('conflict');
  });

  it('bloqueia novas reservas de lotes expirados e atualiza indicadores de disponibilidade e urgência', async () => {
    const expiredId = '2222bbbb-2222-4222-8222-222222222222';
    const overdueUnmarkedId = '3333cccc-3333-4333-8333-333333333333';
    const activeId = '4444dddd-4444-4444-8444-444444444444';

    store.foodBatches?.set(
      expiredId,
      makeBatch({
        id: expiredId,
        status: 'EXPIRED',
        expiredAt: offsetMs(-1000),
        expiresAt: offsetMs(3600_000), // garante bloqueio pelo estado EXPIRED em si
        pickupEndsAt: offsetMs(3600_000),
      })
    );
    store.foodBatches?.set(
      overdueUnmarkedId,
      makeBatch({
        id: overdueUnmarkedId,
        status: 'ACTIVE',
        expiresAt: offsetMs(-1),
      })
    );
    store.foodBatches?.set(
      activeId,
      makeBatch({
        id: activeId,
        status: 'ACTIVE',
        availableQuantity: 5,
        expiresAt: offsetMs(3600_000),
        pickupEndsAt: offsetMs(3600_000),
      })
    );

    expect(
      calculateFoodBatchUrgency(
        { status: 'EXPIRED', expiresAt: offsetMs(3600_000), pickupEndsAt: offsetMs(3600_000) },
        baseNow
      )
    ).toEqual({ level: 'EXPIRED', label: 'Expirado', hoursRemaining: 0 });

    expect(
      evaluateFoodBatchAvailability(
        {
          status: 'EXPIRED',
          availableQuantity: 5,
          expiresAt: offsetMs(3600_000),
          pickupEndsAt: offsetMs(3600_000),
        },
        baseNow
      )
    ).toEqual({ isExpired: true, reservable: false, unavailableReason: 'EXPIRED' });

    await expect(validateFoodBatchForReservation(expiredId, 1, baseNow)).rejects.toMatchObject({
      name: 'FoodBatchUnavailableForReservationError',
      code: 'BATCH_EXPIRED',
      reason: 'EXPIRED',
    });

    await expect(
      validateFoodBatchForReservation(overdueUnmarkedId, 1, baseNow)
    ).rejects.toBeInstanceOf(FoodBatchUnavailableForReservationError);
    expect(store.foodBatches?.get(overdueUnmarkedId)?.status).toBe('EXPIRED');

    const reservable = await validateFoodBatchForReservation(activeId, 2, baseNow);
    expect(reservable.id).toBe(activeId);
  });

  it('define corretamente as migrations SQL da rotina de expiração e do agendamento pg_cron', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const routineSql = readFileSync(
      path.join(migrationsDir, '20261119000002_food_batch_expiration_routine.sql'),
      'utf8'
    );
    const cronSql = readFileSync(
      path.join(migrationsDir, '20261119000003_configure_pg_cron_expiration.sql'),
      'utf8'
    );

    expect(routineSql).toContain("CHECK (status IN ('ACTIVE', 'INACTIVE', 'CLOSED', 'EXPIRED'))");
    expect(routineSql).toContain('CREATE OR REPLACE FUNCTION public.expire_overdue_food_batches');
    expect(routineSql).toContain('FOR UPDATE OF fb SKIP LOCKED');
    expect(routineSql).toContain('fb.expires_at <= checked_at OR fb.pickup_ends_at <= checked_at');
    expect(routineSql).toContain("WHEN NEW.status = 'EXPIRED' AND OLD.status <> 'EXPIRED' THEN 'AUTOMATIC_EXPIRATION'");
    expect(routineSql).toContain('CREATE OR REPLACE FUNCTION public.require_reservable_food_batch');
    expect(routineSql).toContain("batch.status = 'EXPIRED'");

    expect(cronSql).toContain('CREATE EXTENSION IF NOT EXISTS pg_cron;');
    expect(cronSql).toContain("jobname = 'expire_overdue_food_batches_every_minute'");
    expect(cronSql).toContain("'* * * * *'");
    expect(cronSql).toContain("'SELECT public.expire_overdue_food_batches();'");
  });
});
