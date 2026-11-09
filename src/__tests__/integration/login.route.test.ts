import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginRoute } from '@/app/auth/login/route';
import { registerUser } from '@/services/auth.service';
import { getUserRepository } from '@/repositories/user.repository';

/**
 * Testes de Integração: Rota POST /auth/login (RF03).
 * Valida a comunicação entre a rota, o serviço de domínio e a criação do cookie de sessão.
 */
describe('POST /auth/login (Integration)', () => {

  // Antes de cada teste, limpamos o repositório em memória e criamos um usuário padrão
  beforeEach(async () => {
    const repo = getUserRepository();

    // O seu repositório já tem o método clear()! Vamos usá-lo:
    if (repo instanceof Object && 'clear' in repo) {
        // TypeScript cast para acessar o método clear
        await (repo as any).clear();
    }

    await registerUser({
      name: 'Usuário Teste',
      email: 'login.test@exemplo.com',
      password: 'Senha@123',
      role: 'RECEIVER',
    });
  });

  it('deve retornar 401 para credenciais inválidas (senha errada)', async () => {
    const req = new NextRequest('http://localhost:3000/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'login.test@exemplo.com',
        password: 'SenhaErrada@123',
      }),
    });

    const response = await loginRoute(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('deve retornar 401 para usuário não cadastrado', async () => {
    const req = new NextRequest('http://localhost:3000/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'nao.existe@exemplo.com',
        password: 'Senha@123',
      }),
    });

    const response = await loginRoute(req);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('deve retornar 200, dados do usuário e criar o cookie de sessão para login válido', async () => {
    const req = new NextRequest('http://localhost:3000/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'login.test@exemplo.com',
        password: 'Senha@123',
      }),
    });

    const response = await loginRoute(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('login.test@exemplo.com');

    // Verifica se o cookie HttpOnly foi criado na resposta
    const sessionCookie = response.cookies.get('reaproveita_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.value).toContain('login.test@exemplo.com');
  });
});