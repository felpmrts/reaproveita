'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DuplicateEmailError } from '@/repositories/user.repository';
import {
  registerUser,
  loginUser,
  ValidationError,
  InvalidCredentialsError
} from '@/services/auth.service';
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

/**
 * Server Action de Login de usuário (BFF - RF03).
 * Valida as credenciais no serviço de domínio e, em caso de sucesso,
 * cria uma sessão segura armazenando os dados no cookie HttpOnly.
 */
export async function loginUserAction(payload: unknown): Promise<RegisterApiResponse> {
  try {
    const user = await loginUser(payload);

    // Criação da sessão segura (Cookie HttpOnly, Secure, SameSite)
    const cookieStore = await cookies();
    cookieStore.set('reaproveita_session', JSON.stringify(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias de validade
    });

    return {
      success: true,
      message: 'Login realizado com sucesso.',
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

    if (error instanceof InvalidCredentialsError) {
      return {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: error.message,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocorreu um erro interno ao processar o login.',
      },
    };
  }
}

/**
 * Server Action de Logout (RF03).
 * Encerra a sessão do usuário destruindo o cookie seguro e o redireciona para a tela de login.
 */
export async function logoutUserAction() {
  const cookieStore = await cookies();

  // Remove o cookie da sessão
  cookieStore.delete('reaproveita_session');

  // Redireciona o usuário para a página de login
  redirect('/login');
}