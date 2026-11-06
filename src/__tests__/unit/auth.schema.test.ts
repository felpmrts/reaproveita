import { describe, expect, it } from 'vitest';
import { registerFormSchema, registerUserSchema } from '@/schemas/auth.schema';

describe('[QA] Testes Unitários — Schema de Validação de Usuário (registerUserSchema)', () => {
  it('deve validar com sucesso um payload válido de Doador (DONOR) e normalizar o e-mail', () => {
    const result = registerUserSchema.safeParse({
      name: '  Padaria Pão Quente  ',
      email: '  Contato@PadariaPaoQuente.com.BR ',
      password: 'Password@123',
      role: 'DONOR',
      phone: '(11) 98765-4321',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Padaria Pão Quente');
      expect(result.data.email).toBe('contato@padariapaoquente.com.br');
      expect(result.data.role).toBe('DONOR');
      expect(result.data.phone).toBe('(11) 98765-4321');
    }
  });

  it('deve validar com sucesso um payload válido de Receptor (RECEIVER) sem telefone', () => {
    const result = registerUserSchema.safeParse({
      name: 'Maria Oliveira',
      email: 'maria.oliveira@email.com',
      password: 'Strong#Pass9',
      role: 'RECEIVER',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('RECEIVER');
      expect(result.data.phone).toBeNull();
    }
  });

  it('deve rejeitar payload vazio sem campos obrigatórios', () => {
    const result = registerUserSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain('name');
      expect(fields).toContain('email');
      expect(fields).toContain('password');
      expect(fields).toContain('role');
    }
  });

  it('deve rejeitar nome curto (menos de 3 caracteres)', () => {
    const result = registerUserSchema.safeParse({
      name: 'Ab',
      email: 'valido@email.com',
      password: 'Password@123',
      role: 'RECEIVER',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['name']);
    }
  });

  it.each([
    'email-invalido',
    'sem-arroba.com',
    '@semdominio.com',
    'usuario@',
    'usuario@dominio',
  ])('deve rejeitar formato de e-mail inválido: %s', (invalidEmail) => {
    const result = registerUserSchema.safeParse({
      name: 'João da Silva',
      email: invalidEmail,
      password: 'Password@123',
      role: 'RECEIVER',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'email')).toBe(true);
    }
  });

  it.each([
    ['curta demais', 'Aa1!'],
    ['sem letra maiúscula', 'password@123'],
    ['sem letra minúscula', 'PASSWORD@123'],
    ['sem número', 'Password@abc'],
    ['sem caractere especial', 'Password1234'],
  ])('deve rejeitar senha insegura (%s)', (_reason, weakPassword) => {
    const result = registerUserSchema.safeParse({
      name: 'João da Silva',
      email: 'joao@email.com',
      password: weakPassword,
      role: 'RECEIVER',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'password')).toBe(true);
    }
  });

  it.each(['ADMIN', 'SUPERUSER', 'GUEST', ''])('deve rejeitar perfil inválido no autocadastro: %s', (invalidRole) => {
    const result = registerUserSchema.safeParse({
      name: 'João da Silva',
      email: 'joao@email.com',
      password: 'Password@123',
      role: invalidRole,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'role')).toBe(true);
    }
  });

  it('deve rejeitar no registerFormSchema quando confirmPassword diverge de password', () => {
    const result = registerFormSchema.safeParse({
      name: 'Instituto Solidário',
      email: 'contato@instituto.org.br',
      password: 'Password@123',
      confirmPassword: 'Password@999',
      role: 'RECEIVER',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'confirmPassword')).toBe(true);
    }
  });
});
