import { NextRequest, NextResponse } from 'next/server';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { FoodBatchPublicationConflict, saveFoodBatch } from '@/repositories/food-batch.repository';
import { publishFoodBatchSchema } from '@/schemas/food-batch.schema';
import {
  EstablishmentNotApprovedError,
  EstablishmentNotFoundError,
  EstablishmentOwnershipError,
  requireApprovedEstablishmentForPublication,
} from '@/services/establishment.service';

function failure(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const donor = await requireRole(['DONOR']);
    const payload = await request.json().catch(() => null);
    const parsed = publishFoodBatchSchema.safeParse(payload);
    if (!parsed.success) {
      return failure(400, 'VALIDATION_ERROR', 'Revise os dados do lote.', parsed.error.flatten().fieldErrors);
    }

    await requireApprovedEstablishmentForPublication(donor.id, parsed.data.establishmentId);
    const data = await saveFoodBatch(donor.id, parsed.data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const authorization = handleAuthorizationError(error);
    if (authorization) return authorization;
    if (error instanceof EstablishmentNotFoundError) return failure(404, error.code, error.message);
    if (error instanceof EstablishmentOwnershipError || error instanceof EstablishmentNotApprovedError) {
      return failure(403, error.code, error.message);
    }
    if (error instanceof FoodBatchPublicationConflict) {
      return failure(409, 'PUBLICATION_CONFLICT', 'A validade, a janela de retirada ou o estabelecimento mudou. Revise os dados.');
    }
    return failure(500, 'INTERNAL_ERROR', 'Não foi possível publicar o lote.');
  }
}
