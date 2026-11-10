import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  handleAuthorizationError,
  requireEstablishmentOwnership,
  requireRole,
} from '@/lib/rbac';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';

const updateEstablishmentSchema = z
  .object({
    name: z.string().trim().min(3, 'O nome do estabelecimento deve ter ao menos 3 caracteres.').optional(),
    address: z.string().trim().min(3, 'O endereço deve ter ao menos 3 caracteres.').optional(),
  })
  .strict();

/**
 * GET /api/donor/establishments/[id]
 * Critério: Doador pode gerenciar apenas estabelecimentos aos quais está vinculado (RN03 / RN14).
 */
export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    // 1. Guarda de papel: exige DONOR (bloqueia RECEIVER e ADMIN de gerenciar estabelecimentos como doador com 403)
    const user = await requireRole(['DONOR']);

    const repo = getRbacResourceRepository();
    const establishment = await repo.findEstablishmentById(context.params.id);

    if (!establishment) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Estabelecimento não encontrado.',
          },
        },
        { status: 404 }
      );
    }

    // 2. Guarda de vínculo (RN03): garante que o doador é proprietário do estabelecimento
    requireEstablishmentOwnership(user, establishment.ownerId);

    return NextResponse.json(
      {
        success: true,
        message: 'Estabelecimento recuperado com sucesso.',
        data: establishment,
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
          message: 'Erro interno ao consultar o estabelecimento.',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/donor/establishments/[id]
 * Critério: Doador pode gerenciar/atualizar apenas estabelecimentos aos quais está vinculado.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    // 1. Guarda de papel: exige DONOR
    const user = await requireRole(['DONOR']);

    const repo = getRbacResourceRepository();
    const establishment = await repo.findEstablishmentById(context.params.id);

    if (!establishment) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Estabelecimento não encontrado.',
          },
        },
        { status: 404 }
      );
    }

    // 2. Guarda de vínculo (RN03): bloqueia com 403 se o doador não estiver vinculado a este estabelecimento
    requireEstablishmentOwnership(user, establishment.ownerId);

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

    const parsed = updateEstablishmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos para atualização do estabelecimento.',
          },
        },
        { status: 400 }
      );
    }

    const updated = await repo.updateEstablishment(establishment.id, parsed.data);

    return NextResponse.json(
      {
        success: true,
        message: 'Estabelecimento atualizado com sucesso.',
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
          message: 'Erro interno ao atualizar o estabelecimento.',
        },
      },
      { status: 500 }
    );
  }
}
