import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { manageFoodBatch } from '@/repositories/food-batch.repository';
import { manageFoodBatchSchema } from '@/schemas/food-batch.schema';

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const donor = await requireRole(['DONOR']);
    const id = z.string().uuid().safeParse(params.id);
    if (!id.success) return failure(404, 'NOT_FOUND', 'Oferta não encontrada.');

    const payload = await request.json().catch(() => null);
    const parsed = manageFoodBatchSchema.safeParse(payload);
    if (!parsed.success) return failure(400, 'VALIDATION_ERROR', 'Revise os campos da oferta.');

    const result = await manageFoodBatch(donor.id, id.data, parsed.data);
    if (result === 'missing') return failure(404, 'NOT_FOUND', 'Oferta não encontrada.');
    if (result === 'conflict') {
      return failure(409, 'CONFLICT', 'A oferta foi alterada ou encerrada. Atualize a página e tente novamente.');
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleAuthorizationError(error) ?? failure(500, 'INTERNAL_ERROR', 'Não foi possível atualizar a oferta.');
  }
}
