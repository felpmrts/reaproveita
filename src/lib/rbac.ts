import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { ApiErrorResponse, UserEntity, UserRole } from '@/types/user';

/**
 * Erro disparado quando não há usuário autenticado na sessão (HTTP 401).
 */
export class UnauthorizedError extends Error {
  public readonly statusCode = 401 as const;
  public readonly code = 'UNAUTHORIZED' as const;

  constructor(message = 'Autenticação obrigatória para acessar este recurso.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Erro disparado quando o usuário autenticado não possui permissão de papel (RBAC - RN14)
 * ou não possui vínculo de propriedade sobre o recurso solicitado (RN03) (HTTP 403).
 */
export class ForbiddenError extends Error {
  public readonly statusCode = 403 as const;
  public readonly code = 'FORBIDDEN' as const;

  constructor(message = 'Acesso negado. Você não possui permissão para realizar esta operação.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Resposta padronizada HTTP 401 Unauthorized.
 */
export function createUnauthorizedResponse(
  message = 'Autenticação obrigatória para acessar este recurso.'
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message,
      },
    },
    { status: 401 }
  );
}

/**
 * Resposta padronizada HTTP 403 Forbidden para tentativas de acesso não autorizado
 * a recursos ou operações restritas (Subtask 2 - História 3).
 */
export function createForbiddenResponse(
  message = 'Acesso negado. Você não possui permissão para acessar este recurso.'
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message,
      },
    },
    { status: 403 }
  );
}

/**
 * Guarda de servidor que exige um usuário autenticado e ativo.
 */
export async function requireAuth(): Promise<UserEntity> {
  const user = await getAuthenticatedUser();

  if (!user || !user.isActive) {
    throw new UnauthorizedError();
  }

  return user;
}

/**
 * Guarda de servidor que valida se o usuário autenticado possui um dos papéis permitidos (RN14).
 * Caso contrário, lança ForbiddenError (HTTP 403).
 */
export async function requireRole(allowedRoles: readonly UserRole[]): Promise<UserEntity> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      `Acesso negado. Operação restrita ao(s) perfil(is): ${allowedRoles.join(', ')}.`
    );
  }

  return user;
}

/**
 * Valida se o Doador (DONOR) está vinculado ao estabelecimento que tenta gerenciar (RN03).
 * Doador pode gerenciar apenas estabelecimentos aos quais está vinculado.
 */
export function requireEstablishmentOwnership(
  user: Pick<UserEntity, 'id' | 'role'>,
  establishmentOwnerId: string
): void {
  if (user.role !== 'DONOR') {
    throw new ForbiddenError('Apenas usuários com perfil Doador podem gerenciar estabelecimentos.');
  }

  if (user.id !== establishmentOwnerId) {
    throw new ForbiddenError(
      'Acesso negado. O Doador pode gerenciar apenas estabelecimentos aos quais está vinculado.'
    );
  }
}

/**
 * Valida se o Receptor (RECEIVER) é o titular da reserva que tenta gerenciar.
 * Receptor pode gerenciar apenas suas próprias reservas.
 */
export function requireReservationOwnership(
  user: Pick<UserEntity, 'id' | 'role'>,
  reservationReceiverId: string
): void {
  if (user.role !== 'RECEIVER') {
    throw new ForbiddenError('Apenas usuários com perfil Receptor podem gerenciar reservas próprias.');
  }

  if (user.id !== reservationReceiverId) {
    throw new ForbiddenError(
      'Acesso negado. O Receptor pode gerenciar apenas suas próprias reservas.'
    );
  }
}

/**
 * Converte erros de autorização (UnauthorizedError / ForbiddenError) em respostas HTTP padronizadas.
 */
export function handleAuthorizationError(error: unknown): NextResponse<ApiErrorResponse> | null {
  if (error instanceof UnauthorizedError) {
    return createUnauthorizedResponse(error.message);
  }

  if (error instanceof ForbiddenError) {
    return createForbiddenResponse(error.message);
  }

  return null;
}
