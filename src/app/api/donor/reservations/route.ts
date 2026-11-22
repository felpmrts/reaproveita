import { NextRequest, NextResponse } from 'next/server';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { donorReservationsQuerySchema } from '@/schemas/reservation.schema';
import {
  DonorEstablishmentNotFoundError,
  listDonorReceivedReservations,
} from '@/services/reservation.service';

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
 * GET /api/donor/reservations
 * ST18 (SCRUM-94): Lista as reservas associadas aos lotes dos estabelecimentos vinculados ao Doador.
 * Suporta filtros opcionais: establishmentId, status e search.
 */
export async function GET(request: NextRequest) {
  try {
    const donor = await requireRole(['DONOR']);

    const { searchParams } = request.nextUrl;
    const rawQuery: Record<string, string | undefined> = {};

    const establishmentId = searchParams.get('establishmentId')?.trim();
    if (establishmentId) rawQuery.establishmentId = establishmentId;

    const status = searchParams.get('status')?.trim();
    if (status) rawQuery.status = status;

    const search = searchParams.get('search')?.trim();
    if (search) rawQuery.search = search;

    const parsed = donorReservationsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      const issueMessage =
        parsed.error.issues[0]?.message ?? 'Parâmetros de consulta inválidos.';
      return errorResponse(400, 'VALIDATION_ERROR', issueMessage);
    }

    const result = await listDonorReceivedReservations(donor, parsed.data);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    const authResponse = handleAuthorizationError(error);
    if (authResponse) return authResponse;

    if (error instanceof DonorEstablishmentNotFoundError) {
      return errorResponse(error.statusCode, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'Não foi possível carregar as reservas recebidas pelo estabelecimento.'
    );
  }
}
