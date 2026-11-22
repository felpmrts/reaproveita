import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { getDonorReservationDetails } from '@/services/reservation.service';

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
 * GET /api/donor/reservations/[id]
 * ST18 (SCRUM-94): Permite consultar o status detalhado e histórico de uma reserva
 * pertencente a um lote do estabelecimento do Doador autenticado (RN03 / RN14).
 */
export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const donor = await requireRole(['DONOR']);

    const parsedId = uuidSchema.safeParse(context.params.id);
    if (!parsedId.success) {
      return errorResponse(404, 'NOT_FOUND', 'Reserva não encontrada.');
    }

    const details = await getDonorReservationDetails(donor, parsedId.data);
    if (!details) {
      return errorResponse(404, 'NOT_FOUND', 'Reserva não encontrada.');
    }

    return NextResponse.json(
      {
        success: true,
        data: details,
      },
      { status: 200 }
    );
  } catch (error) {
    const authResponse = handleAuthorizationError(error);
    if (authResponse) return authResponse;

    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Não foi possível consultar o status da reserva.'
    );
  }
}
