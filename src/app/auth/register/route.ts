import { NextRequest, NextResponse } from 'next/server';
import { DuplicateEmailError } from '@/repositories/user.repository';
import { registerUser, ValidationError } from '@/services/auth.service';
import { RegisterApiResponse } from '@/types/user';

export const maxDuration = 60;

/**
 * Subtask [BE] Endpoint de Registro:
 * Rota POST /auth/register com validação de payload (dados obrigatórios, e-mail válido,
 * senha segura e perfil DONOR/RECEIVER) e persistência garantindo unicidade de e-mail (RN01).
 */
export async function POST(request: NextRequest): Promise<NextResponse<RegisterApiResponse>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
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

  try {
    const createdUser = await registerUser(body);

    return NextResponse.json(
      {
        success: true,
        message: 'Usuário cadastrado com sucesso.',
        data: createdUser,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            details: error.details,
          },
        },
        { status: 400 }
      );
    }

    if (error instanceof DuplicateEmailError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'Este e-mail já está cadastrado na plataforma.',
            details: {
              email: ['Este e-mail já está cadastrado na plataforma.'],
            },
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Ocorreu um erro interno ao processar o cadastro.',
        },
      },
      { status: 500 }
    );
  }
}
