import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { getRbacResourceRepository } from '@/repositories/rbac-resources.repository';

const adminOperationSchema = z
  .object({
    action: z.enum(['APPROVE_ESTABLISHMENT', 'SUSPEND_ESTABLISHMENT']),
    establishmentId: z.string().min(1, 'O identificador do estabelecimento é obrigatório.'),
  })
  .strict();

/**
 * GET /api/admin/operations
 * Critério: Administrador pode acessar as operações administrativas autorizadas (RN14).
 * Bloqueia RECEIVER e DONOR com 403 Forbidden.
 */
export async function GET() {
  try {
    const adminUser = await requireRole(['ADMIN']);
    const repo = getRbacResourceRepository();
    const establishments = await repo.listAllEstablishments();

    return NextResponse.json(
      {
        success: true,
        message: 'Painel de operações administrativas carregado com sucesso.',
        data: {
          operatorId: adminUser.id,
          role: adminUser.role,
          establishments,
        },
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
          message: 'Erro interno ao carregar operações administrativas.',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/operations
 * Executa operações administrativas (ex: aprovar ou suspender estabelecimentos).
 * Tentativas disparadas por RECEIVER ou DONOR são bloqueadas no servidor com HTTP 403 Forbidden.
 */
export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireRole(['ADMIN']);

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

    const parsed = adminOperationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados de operação administrativa inválidos.',
          },
        },
        { status: 400 }
      );
    }

    const repo = getRbacResourceRepository();
    const establishment = await repo.findEstablishmentById(parsed.data.establishmentId);

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

    const isApproved = parsed.data.action === 'APPROVE_ESTABLISHMENT';
    const updated = await repo.updateEstablishment(establishment.id, { isApproved });

    return NextResponse.json(
      {
        success: true,
        message: 'Operação administrativa executada com sucesso.',
        data: {
          executedBy: adminUser.id,
          action: parsed.data.action,
          establishment: updated,
        },
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
          message: 'Erro interno ao executar operação administrativa.',
        },
      },
      { status: 500 }
    );
  }
}
