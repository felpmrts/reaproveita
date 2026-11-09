import { NextRequest, NextResponse } from 'next/server';
import { loginUser, ValidationError, InvalidCredentialsError } from '@/services/auth.service';
import { RegisterApiResponse } from '@/types/user';

/**
 * Subtask [BE] Endpoints de Login:
 * Rota POST /auth/login com validação de credenciais.
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
      } as RegisterApiResponse, // <-- Força o TypeScript a aceitar
      { status: 400 }
    );
  }

  try {
    const user = await loginUser(body);

    // Cria a resposta de sucesso
    const response = NextResponse.json(
      {
        success: true,
        message: 'Login realizado com sucesso.',
        data: user,
      } as RegisterApiResponse, // <-- Força o TypeScript a aceitar
      { status: 200 }
    );

    // Define o cookie HttpOnly de sessão diretamente na resposta
    response.cookies.set('reaproveita_session', JSON.stringify(user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    });

    return response;
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
        } as RegisterApiResponse, // <-- Força o TypeScript a aceitar
        { status: 400 }
      );
    }

    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: error.message,
          },
        } as RegisterApiResponse, // <-- Força o TypeScript a aceitar
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Ocorreu um erro interno ao processar o login.',
        },
      } as RegisterApiResponse, // <-- Força o TypeScript a aceitar
      { status: 500 }
    );
  }
}