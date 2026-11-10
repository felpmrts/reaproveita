import { NextRequest, NextResponse } from 'next/server';
import { handleAuthorizationError, requireEstablishmentOwnership, requireRole } from '@/lib/rbac';
import { getEstablishmentRepository } from '@/repositories/establishment.repository';
import { updateEstablishmentSchema } from '@/schemas/establishment.schema';

type Context = { params: { id: string } };

function failure(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

async function manage(request: NextRequest, { params }: Context) {
  try {
    const user = await requireRole(['DONOR']);
    const repository = getEstablishmentRepository();
    const missing = () => failure(404, 'NOT_FOUND', 'Estabelecimento não encontrado.');

    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.id)) return missing();
    const establishment = await repository.findById(params.id);
    if (!establishment) return missing();
    requireEstablishmentOwnership(user, establishment.ownerId);

    if (request.method === 'GET') {
      const responsibles = [{ id: user.id, name: user.name }];
      return NextResponse.json({ success: true, data: { ...establishment, responsibles } });
    }

    const payload = await request.json().catch(() => null);
    const parsed = updateEstablishmentSchema.safeParse(payload);
    if (!parsed.success) {
      return failure(400, 'VALIDATION_ERROR', 'Revise os dados do estabelecimento.', parsed.error.flatten().fieldErrors);
    }

    const updated = await repository.updateOwned(establishment.id, user.id, parsed.data);
    if (!updated) return missing();
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleAuthorizationError(error)
      ?? failure(500, 'INTERNAL_ERROR', 'Não foi possível gerenciar o estabelecimento.');
  }
}

export function GET(request: NextRequest, context: Context) {
  return manage(request, context);
}

export function PATCH(request: NextRequest, context: Context) {
  return manage(request, context);
}
