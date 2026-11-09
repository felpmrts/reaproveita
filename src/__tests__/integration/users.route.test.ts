import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, PUT } from '@/app/users/me/route';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import { cookies } from 'next/headers';

// Mock do next/headers para podermos simular a existência de um cookie
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('Users Route - /users/me', () => {
  const repo = getInMemoryUserRepository();
  let testUser: any;

  beforeEach(async () => {
    if (repo.clear) await repo.clear();
    
    // Cria um usuário de teste direto no banco em memória antes de cada teste
    testUser = await repo.create({
      name: 'Usuário Teste',
      email: 'teste@reaproveita.com',
      passwordHash: 'hash123_seguro',
      role: 'DONOR',
      phone: '11999999999'
    });
  });

  // Funções auxiliares para simular o estado da requisição
  const mockAuthenticatedRequest = () => {
    (cookies as any).mockReturnValue({
      get: vi.fn().mockReturnValue({
        value: JSON.stringify({ email: testUser.email })
      })
    });
  };

  const mockUnauthenticatedRequest = () => {
    (cookies as any).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined)
    });
  };

  describe('GET /users/me', () => {
    it('deve retornar 401 se não estiver autenticado', async () => {
      mockUnauthenticatedRequest();
      const req = new Request('http://localhost/users/me');
      const res = await GET(req);
      
      expect(res.status).toBe(401);
    });

    it('deve retornar o perfil do usuário logado e não expor o passwordHash', async () => {
      mockAuthenticatedRequest();
      const req = new Request('http://localhost/users/me');
      const res = await GET(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.id).toBe(testUser.id);
      expect(data.name).toBe(testUser.name);
      expect(data.passwordHash).toBeUndefined(); // Critério de segurança!
    });
  });

  describe('PUT /users/me', () => {
    it('deve retornar 401 se não estiver autenticado', async () => {
      mockUnauthenticatedRequest();
      const req = new Request('http://localhost/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Novo Nome' })
      });
      const res = await PUT(req);
      
      expect(res.status).toBe(401);
    });

    it('deve atualizar o nome e telefone com sucesso', async () => {
      mockAuthenticatedRequest();
      const req = new Request('http://localhost/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Nome Atualizado', phone: '11888888888' })
      });
      const res = await PUT(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.name).toBe('Nome Atualizado');
      expect(data.phone).toBe('11888888888');

      // Verifica se realmente salvou no banco de dados
      const userInDb = await repo.findById(testUser.id);
      expect(userInDb?.name).toBe('Nome Atualizado');
    });

    it('deve rejeitar campos não autorizados (ex: alterar a role)', async () => {
      mockAuthenticatedRequest();
      const req = new Request('http://localhost/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Hackerman', role: 'ADMIN' })
      });
      const res = await PUT(req);
      
      expect(res.status).toBe(400); 
    });

    it('deve preservar o valor atual do telefone ao omitir o campo', async () => {
      mockAuthenticatedRequest();
      const req = new Request('http://localhost/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Apenas Nome Modificado' })
      });
      const res = await PUT(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.name).toBe('Apenas Nome Modificado');
      expect(data.phone).toBe(testUser.phone); // Telefone continuou intacto
    });

    it('[QA Segurança] deve impedir ID manipulation rejeitando tentativas de injetar ID no payload', async () => {
      mockAuthenticatedRequest();
      
      // Atacante tenta enviar o ID de outra pessoa no corpo da requisição
      const req = new Request('http://localhost/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Hacker', id: 'id-da-vitima-123' })
      });
      const res = await PUT(req);
      
      // O Zod com .strict() deve barrar a requisição imediatamente (400 Bad Request)
      expect(res.status).toBe(400);
      
      // Confirma que o banco de dados não sofreu nenhuma alteração
      const userInDb = await repo.findById(testUser.id);
      expect(userInDb?.name).toBe(testUser.name); // Nome original intacto
    });
  });
});