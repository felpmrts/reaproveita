import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/auth/register/route';
import { InMemoryUserRepository, setUserRepository } from '@/repositories/user.repository';
import { verifyPassword } from '@/services/auth.service';

function createRegisterRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('[QA] Testes de Integração — POST /auth/register e Integridade de E-mail Único (RN01)', () => {
  let repository: InMemoryUserRepository;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    setUserRepository(repository);
  });

  it('deve cadastrar um usuário Doador (DONOR) com status 201 e persistir senha com hash seguro', async () => {
    const request = createRegisterRequest({
      name: 'Mercado Bom Preço',
      email: 'Contato@MercadoBomPreco.com.br',
      password: 'SafePassword@2026',
      role: 'DONOR',
      phone: '(11) 98888-7777',
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
      name: 'Mercado Bom Preço',
      email: 'contato@mercadobompreco.com.br',
      role: 'DONOR',
      phone: '(11) 98888-7777',
      isActive: true,
    });
    expect(payload.data.id).toBeDefined();
    // Garante que o hash/senha jamais vaza no retorno da API
    expect(payload.data.password).toBeUndefined();
    expect(payload.data.passwordHash).toBeUndefined();

    // Verifica persistência e hash seguro no repositório
    const persisted = await repository.findByEmail('contato@mercadobompreco.com.br');
    expect(persisted).not.toBeNull();
    expect(persisted?.passwordHash).not.toBe('SafePassword@2026');
    expect(verifyPassword('SafePassword@2026', persisted!.passwordHash)).toBe(true);
  });

  it('deve cadastrar um usuário Receptor (RECEIVER) com status 201', async () => {
    const request = createRegisterRequest({
      name: 'Associação Comunitária Esperança',
      email: 'esperanca@associacao.org.br',
      password: 'Receiver#2026',
      role: 'RECEIVER',
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(payload.data.role).toBe('RECEIVER');
    expect(payload.data.email).toBe('esperanca@associacao.org.br');
  });

  it('deve garantir integridade de e-mail único (RN01) retornando 409 Conflict em duplicidade exata ou case-insensitive', async () => {
    const firstRequest = createRegisterRequest({
      name: 'Padaria Central',
      email: 'padaria@central.com.br',
      password: 'Password@123',
      role: 'DONOR',
    });

    const firstResponse = await POST(firstRequest);
    expect(firstResponse.status).toBe(201);

    // Tentativa de novo cadastro com o mesmo e-mail em letras maiúsculas e perfil diferente
    const duplicateRequest = createRegisterRequest({
      name: 'Outro Usuário',
      email: '  PADARIA@CENTRAL.COM.BR ',
      password: 'AnotherPassword@123',
      role: 'RECEIVER',
    });

    const duplicateResponse = await POST(duplicateRequest);
    const duplicatePayload = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(409);
    expect(duplicatePayload).toEqual({
      success: false,
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Este e-mail já está cadastrado na plataforma.',
        details: {
          email: ['Este e-mail já está cadastrado na plataforma.'],
        },
      },
    });
  });

  it('deve retornar 400 Bad Request (VALIDATION_ERROR) quando o payload tiver dados inválidos', async () => {
    const invalidRequest = createRegisterRequest({
      name: 'A',
      email: 'email-invalido',
      password: '123',
      role: 'INVALID_ROLE',
    });

    const response = await POST(invalidRequest);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    if (!payload.success) {
      expect(payload.error.code).toBe('VALIDATION_ERROR');
      expect(payload.error.details).toBeDefined();
      expect(payload.error.details?.name).toBeDefined();
      expect(payload.error.details?.email).toBeDefined();
      expect(payload.error.details?.password).toBeDefined();
      expect(payload.error.details?.role).toBeDefined();
    }
  });

  it('deve retornar 400 Bad Request (INVALID_JSON) quando o corpo da requisição não for JSON válido', async () => {
    const malformedRequest = new NextRequest('http://localhost:3000/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{ invalid json ',
    });

    const response = await POST(malformedRequest);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'O corpo da requisição deve ser um JSON válido.',
      },
    });
  });
});
