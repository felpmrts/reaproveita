import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { UserService } from '@/services/user.service';

export async function GET(request: Request) {
  try {
    // 1. Obter identidade autenticada (segura)
    const authUser = await getAuthenticatedUser();
    
    if (!authUser) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // 2. Buscar perfil (retorna a versão PublicUser, sem o hash da senha)
    const profile = await UserService.getUserProfile(authUser.id);
    
    // 3. Retornar resposta
    return NextResponse.json(profile, { status: 200 });
  } catch (error: any) {
    if (error.name === 'UserNotFoundError') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    // 1. Obter identidade autenticada (segura)
    const authUser = await getAuthenticatedUser();
    
    if (!authUser) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // 2. Interpretar JSON
    const body = await request.json().catch(() => ({}));

    // 3. Validar e atualizar perfil
    const updatedProfile = await UserService.updateUserProfile(authUser.id, body);
    
    // 4. Retornar resposta
    return NextResponse.json(updatedProfile, { status: 200 });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      // Retorna 400 com os detalhes dos campos inválidos
      return NextResponse.json({ error: 'Dados inválidos.', details: error.message }, { status: 400 });
    }
    if (error.name === 'UserNotFoundError') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}