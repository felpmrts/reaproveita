import { describe, expect, it } from 'vitest';
import {
  calculateFoodBatchUrgency,
  evaluateFoodBatchAvailability,
} from '@/services/food-batch.service';

const baseNow = new Date('2026-11-16T12:00:00.000Z');
const hoursFromNow = (hours: number) => new Date(baseNow.getTime() + hours * 3600000).toISOString();

describe('calculateFoodBatchUrgency', () => {
  it.each([
    { hours: -1, expectedLevel: 'EXPIRED', expectedLabel: 'Expirado' },
    { hours: 1, expectedLevel: 'CRITICAL', expectedLabel: 'Urgência máxima' },
    { hours: 2, expectedLevel: 'CRITICAL', expectedLabel: 'Urgência máxima' },
    { hours: 4, expectedLevel: 'HIGH', expectedLabel: 'Alta urgência' },
    { hours: 12, expectedLevel: 'MEDIUM', expectedLabel: 'Urgência moderada' },
    { hours: 48, expectedLevel: 'LOW', expectedLabel: 'Prazo confortável' },
  ])('classifica urgência $expectedLevel quando restam $hours hora(s)', ({ hours, expectedLevel, expectedLabel }) => {
    const urgency = calculateFoodBatchUrgency(
      { expiresAt: hoursFromNow(hours), pickupEndsAt: hoursFromNow(hours) },
      baseNow
    );

    expect(urgency.level).toBe(expectedLevel);
    expect(urgency.label).toBe(expectedLabel);
  });

  it('usa o menor prazo entre validade e fim da janela de retirada', () => {
    const urgency = calculateFoodBatchUrgency(
      { expiresAt: hoursFromNow(36), pickupEndsAt: hoursFromNow(1.5) },
      baseNow
    );

    expect(urgency.level).toBe('CRITICAL');
  });
});

describe('evaluateFoodBatchAvailability', () => {
  it('permite reserva para lote ativo, dentro da validade e com estoque positivo', () => {
    const result = evaluateFoodBatchAvailability(
      {
        status: 'ACTIVE',
        availableQuantity: 5,
        expiresAt: hoursFromNow(4),
        pickupEndsAt: hoursFromNow(3),
      },
      baseNow
    );

    expect(result).toEqual({
      isExpired: false,
      reservable: true,
      unavailableReason: null,
    });
  });

  it('bloqueia reserva quando o lote está expirado mesmo com status ACTIVE', () => {
    const result = evaluateFoodBatchAvailability(
      {
        status: 'ACTIVE',
        availableQuantity: 5,
        expiresAt: hoursFromNow(-0.5),
        pickupEndsAt: hoursFromNow(2),
      },
      baseNow
    );

    expect(result).toEqual({
      isExpired: true,
      reservable: false,
      unavailableReason: 'EXPIRED',
    });
  });

  it('bloqueia reserva quando a janela de retirada já terminou', () => {
    const result = evaluateFoodBatchAvailability(
      {
        status: 'ACTIVE',
        availableQuantity: 5,
        expiresAt: hoursFromNow(5),
        pickupEndsAt: hoursFromNow(-0.1),
      },
      baseNow
    );

    expect(result).toEqual({
      isExpired: true,
      reservable: false,
      unavailableReason: 'EXPIRED',
    });
  });

  it.each([
    { status: 'INACTIVE' as const, availableQuantity: 5, reason: 'INACTIVE' },
    { status: 'CLOSED' as const, availableQuantity: 5, reason: 'CLOSED' },
    { status: 'ACTIVE' as const, availableQuantity: 0, reason: 'OUT_OF_STOCK' },
  ])('bloqueia reserva para status $status e estoque $availableQuantity', ({ status, availableQuantity, reason }) => {
    const result = evaluateFoodBatchAvailability(
      {
        status,
        availableQuantity,
        expiresAt: hoursFromNow(5),
        pickupEndsAt: hoursFromNow(4),
      },
      baseNow
    );

    expect(result.reservable).toBe(false);
    expect(result.unavailableReason).toBe(reason);
  });
});
