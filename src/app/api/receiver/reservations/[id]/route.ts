import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  handleAuthorizationError,
  requireReservationOwnership,
  requireRole,
} from '@/lib/rbac';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';
import { cancelReservationSchema } from '@/schemas/reservation.schema';
import {
  cancelReceiverReservation,
  findFoodBatchReservationById,
  listFoodBatchReservationHistory,
  ReservationCancellationError,
} from '@/services/reservation.service';

const uuidSchema = z.string().uuid();

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

/**
 * GET /api/receiver/reservations/[id]
 * Critério: Receptor pode consultar apenas suas próprias reservas (RN14).
 */
export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const user = await requireRole(['RECEIVER']);

    const isUuid = uuidSchema.safeParse(context.params.id).success;
    const batchReservation = isUuid
      ? await findFoodBatchReservationById(context.params.id)
      : null;

    if (batchReservation) {
      requireReservationOwnership(user, batchReservation.receiverId);
      const history = await listFoodBatchReservationHistory(batchReservation.id);

      return NextResponse.json(
        {
          success: true,
          message: 'Reserva recuperada com sucesso.',
          data: {
            ...batchReservation,
            history,
          },
        },
        { status: 200 }
      );
    }

    const legacyRepo = getRbacResourceRepository();
    const legacyReservation = await legacyRepo.findReservationById(context.params.id);

    if (!legacyReservation) {
      return errorResponse(404, 'NOT_FOUND', 'Reserva não encontrada.');
    }

    requireReservationOwnership(user, legacyReservation.receiverId);

    return NextResponse.json(
      {
        success: true,
        message: 'Reserva recuperada com sucesso.',
        data: legacyReservation,
      },
      { status: 200 }
    );
  } catch (error) {
    const authResponse = handleAuthorizationError(error);
    if (authResponse) return authResponse;

    return errorResponse(500, 'INTERNAL_ERROR', 'Erro interno ao consultar a reserva.');
  }
}

/**
 * PATCH /api/receiver/reservations/[id]
 * ST16 (SCRUM-90): Cancela reserva ativa do receptor titular, restitui estoque ao lote
 * quando ainda válido (RN09), impede cancelamento de concluídas (RN10) e grava histórico (RN15).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const user = await requireRole(['RECEIVER']);

    const isUuid = uuidSchema.safeParse(context.params.id).success;
    const batchReservation = isUuid
      ? await findFoodBatchReservationById(context.params.id)
      : null;

    if (batchReservation) {
      requireReservationOwnership(user, batchReservation.receiverId);

      const body = await request.json().catch(() => null);
      if (!body) {
        return errorResponse(
          400,
          'INVALID_JSON',
          'O corpo da requisição deve ser um JSON válido.'
        );
      }

      const parsed = cancelReservationSchema.safeParse(body);
      if (!parsed.success) {
        const issueMessage =
          parsed.error.issues[0]?.message ?? 'Operação inválida para a reserva.';
        return errorResponse(400, 'VALIDATION_ERROR', issueMessage);
      }

      const result = await cancelReceiverReservation(
        user,
        batchReservation.id,
        parsed.data
      );

      return NextResponse.json(
        {
          success: true,
          message: result.message,
          data: {
            ...result.reservation,
            restoredToBatch: result.restoredToBatch,
            restoredQuantity: result.restoredQuantity,
            historyEntryId: result.historyEntry.id,
          },
        },
        { status: 200 }
      );
    }

    // Compatibilidade com recursos de reserva legados utilizados nos testes de RBAC (ST03)
    const legacyRepo = getRbacResourceRepository();
    const legacyReservation = await legacyRepo.findReservationById(context.params.id);

    if (!legacyReservation) {
      return errorResponse(404, 'NOT_FOUND', 'Reserva não encontrada.');
    }

    requireReservationOwnership(user, legacyReservation.receiverId);

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse(
        400,
        'INVALID_JSON',
        'O corpo da requisição deve ser um JSON válido.'
      );
    }

    const parsed = cancelReservationSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Operação inválida para a reserva.');
    }

    if (legacyReservation.status === 'COMPLETED') {
      return errorResponse(
        409,
        'RESERVATION_COMPLETED',
        'Reservas já concluídas não podem ser canceladas.'
      );
    }

    if (legacyReservation.status === 'CANCELLED') {
      return errorResponse(
        409,
        'RESERVATION_ALREADY_CANCELLED',
        'Esta reserva já foi cancelada anteriormente.'
      );
    }

    const updated = await legacyRepo.updateReservationStatus(
      legacyReservation.id,
      parsed.data.status
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Reserva atualizada com sucesso.',
        data: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    const authResponse = handleAuthorizationError(error);
    if (authResponse) return authResponse;

    if (error instanceof ReservationCancellationError) {
      return errorResponse(error.statusCode, error.code, error.message);
    }

    return errorResponse(500, 'INTERNAL_ERROR', 'Erro interno ao atualizar a reserva.');
  }
}
