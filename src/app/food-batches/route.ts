import { NextRequest, NextResponse } from 'next/server';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { FoodBatchPublicationConflict, saveFoodBatch } from '@/repositories/food-batch.repository';
import {
  parseFoodBatchCatalogSearchParams,
  publishFoodBatchSchema,
} from '@/schemas/food-batch.schema';
import {
  EstablishmentNotApprovedError,
  EstablishmentNotFoundError,
  EstablishmentOwnershipError,
  requireApprovedEstablishmentForPublication,
} from '@/services/establishment.service';
import { listActiveFoodBatchCatalog } from '@/services/food-batch.service';

export const dynamic = 'force-dynamic';

function failure(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

export async function GET(): Promise<NextResponse>;
export async function GET(request: NextRequest): Promise<NextResponse>;
export async function GET(request?: NextRequest): Promise<NextResponse> {
  try {
    const searchParams =
      request?.nextUrl?.searchParams ??
      (request?.url ? new URL(request.url).searchParams : new URLSearchParams());
    const parsed = parseFoodBatchCatalogSearchParams(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Revise os filtros informados.',
            details: parsed.error.flatten().fieldErrors,
          },
        },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    const catalog = await listActiveFoodBatchCatalog(parsed.data);
    return NextResponse.json(
      {
        success: true,
        data: catalog.items,
        meta: {
          total: catalog.total,
          updatedAt: catalog.updatedAt,
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Não foi possível carregar o catálogo de ofertas.',
        },
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
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
