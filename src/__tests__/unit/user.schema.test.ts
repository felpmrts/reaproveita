import { describe, it, expect } from 'vitest';
import { updateUserProfileSchema } from '../../schemas/user.schema';

describe('User Schema - updateUserProfileSchema', () => {
  it('deve validar quando apenas o nome é enviado (telefone omitido)', () => {
    const data = { name: 'João da Silva' };
    const result = updateUserProfileSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve validar quando nome e telefone são enviados', () => {
    // Nota: O formato exato do telefone depende da implementação do phoneSchema original,
    // mas geralmente enviaremos uma string.
    const data = { name: 'Maria Souza', phone: '11999999999' };
    const result = updateUserProfileSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar nome com menos de 3 caracteres', () => {
    const data = { name: 'Zé' };
    const result = updateUserProfileSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar a requisição se campos não autorizados (como role) forem enviados', () => {
    const data = { name: 'Hackerman', role: 'ADMIN' };
    const result = updateUserProfileSchema.safeParse(data);
    
    // O strict() deve invalidar a presença do campo "role"
    expect(result.success).toBe(false);
  });

  it('deve validar um objeto vazio (ambos os campos omitidos preservam estado atual)', () => {
    const data = {};
    const result = updateUserProfileSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});