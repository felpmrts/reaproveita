'use server';

import { DuplicateEmailError } from '@/repositories/user.repository';
import { registerUser, ValidationError } from '@/services/auth.service';
import { RegisterApiResponse } from '@/types/user';

/**
 * Server Action de cadastro de usuário (BFF - Seção 1.1 e Diretriz 1 de agent/rules/contex.md).
 * Compartilha a mesma regra de domínio, validação Zod e garantia de unicidade (RN01)
 * utilizada pelo endpoint POST /auth/register.
 */
export async function registerUserAction(payload: unknown): Promise<RegisterApiResponse> {
  try {
    const user = await registerUser(payload);
    return {
      success: true,
      message: 'Usuário cadastrado com sucesso.',
      data: user,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.details,
        },
      };
    }

    if (error instanceof DuplicateEmailError) {
      return {
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Este e-mail já está cadastrado na plataforma.',
          details: {
            email: ['Este e-mail já está cadastrado na plataforma.'],
          },
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocorreu um erro interno ao processar o cadastro.',
      },
    };
  }
}
