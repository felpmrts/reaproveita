import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  handleAuthorizationError,
  requireReservationOwnership,
  requireRole,
} from '@/lib/rbac';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';

const updateReservationSchema = z
  .object({
    status: z.enum(['CANCELLED']),
  })
  .strict();

/**
 * GET /api/receiver/reservations/[id]
 * Critério: Receptor pode gerenciar apenas suas próprias reservas (RN14).
 */
export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    // 1. Guarda de papel: exige RECEIVER
    const user = await requireRole(['RECEIVER']);

    const repo = getRbacResourceRepository();
    const reservation = await repo.findReservationById(context.params.id);

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Reserva não encontrada.',
          },
        },
        { status: 404 }
      );
    }

    // 2. Guarda de titularidade: garante que a reserva pertence ao receptor autenticado
    requireReservationOwnership(user, reservation.receiverId);

    return NextResponse.json(
      {
        success: true,
        message: 'Reserva recuperada com sucesso.',
        data: reservation,
      },
      { status: 200 }
    );
  } catch (error) {
    const authResponse = handleAuthorizationError(error);
    if (authResponse) return authResponse;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno ao consultar a reserva.',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/receiver/reservations/[id]
 * Critério: Receptor pode gerenciar (ex: cancelar) apenas suas próprias reservas.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    // 1. Guarda de papel: exige RECEIVER
    const user = await requireRole(['RECEIVER']);

    const repo = getRbacResourceRepository();
    const reservation = await repo.findReservationById(context.params.id);

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Reserva não encontrada.',
          },
        },
        { status: 404 }
      );
    }

    // 2. Guarda de titularidade: bloqueia com 403 se outro receptor tentar alterar a reserva
    requireReservationOwnership(user, reservation.receiverId);

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'O corpo da requisição deve ser um JSON válido.',
          },
        },
        { status: 400 }
      );
    }

    const parsed = updateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Operação inválida para a reserva.',
          },
        },
        { status: 400 }
      );
    }

    const updated = await repo.updateReservationStatus(reservation.id, parsed.data.status);

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

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno ao atualizar a reserva.',
        },
      },
      { status: 500 }
    );
  }
}
