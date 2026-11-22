import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { confirmPickupSchema } from '@/schemas/reservation.schema';
import {
  confirmDonorReservationPickup,
  PickupConfirmationError,
} from '@/services/reservation.service';

const reservationCodeSchema = z
  .string()
  .trim()
  .uuid('Informe um código de reserva válido.');

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
 * POST /api/donor/reservations/[id]/confirm-pickup
 * ST19 (SCRUM-96): Endpoint idempotente de baixa/confirmação de retirada presencial.
 * - Identifica a reserva por seu código ([id]).
 * - Permite confirmar apenas reservas ativas e válidas do estabelecimento do Doador (RN03, RN11, RN14).
 * - Impede confirmação duplicada (RN12), registra data/horário/responsável (RN15) e atualiza indicadores (RN16).
 */
export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const donor = await requireRole(['DONOR']);

    const parsedCode = reservationCodeSchema.safeParse(context.params.id);
    if (!parsedCode.success) {
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        parsedCode.error.issues[0]?.message ?? 'Informe um código de reserva válido.'
      );
    }

    const rawText = await request.text().catch(() => '');
    let parsedBody: { requestId?: string } = {};

    if (rawText.trim() !== '') {
      let jsonBody: unknown;
      try {
        jsonBody = JSON.parse(rawText);
      } catch {
        return errorResponse(
          400,
          'INVALID_JSON',
          'O corpo da requisição deve ser um JSON válido.'
        );
      }

      const validated = confirmPickupSchema.safeParse(jsonBody);
      if (!validated.success) {
        return errorResponse(
          400,
          'VALIDATION_ERROR',
          validated.error.issues[0]?.message ?? 'Dados inválidos para confirmação de retirada.'
        );
      }
      parsedBody = validated.data;
    }

    const result = await confirmDonorReservationPickup(
      donor,
      parsedCode.data,
      parsedBody
    );

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: {
          ...result.reservation,
          historyEntryId: result.historyEntryId,
          idempotentReplay: result.idempotentReplay,
          summary: result.summary,
          globalImpact: result.globalImpact,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const authResponse = handleAuthorizationError(error);
    if (authResponse) return authResponse;

    if (error instanceof PickupConfirmationError) {
      return errorResponse(error.statusCode, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Não foi possível confirmar a retirada presencial da reserva.'
    );
  }
}
