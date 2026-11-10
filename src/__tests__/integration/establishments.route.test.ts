import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { POST } from '@/app/establishments/route';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const payload = {
  name: 'Padaria Pão Quente', cnpj: '11.222.333/0001-81', email: 'contato@padaria.com.br',
  phone: '(34) 99999-0000', zipCode: '38400-100', street: 'Avenida Brasil', number: '1200',
  neighborhood: 'Centro', city: 'Uberlândia', state: 'MG',
  latitude: -18.9186, longitude: -48.2772,
};

describe('POST /establishments', () => {
  const userRepository = getInMemoryUserRepository();
  const establishmentRepository = getInMemoryEstablishmentRepository();
  let donor: UserEntity;
  let receiver: UserEntity;

  beforeEach(async () => {
    await userRepository.clear();
    await establishmentRepository.clear();
    donor = await userRepository.create({ name: 'Doador', email: 'doador@test.com', passwordHash: 'hash', role: 'DONOR' });
    receiver = await userRepository.create({ name: 'Receptor', email: 'receptor@test.com', passwordHash: 'hash', role: 'RECEIVER' });
  });

  const authenticate = (user?: UserEntity) => {
    (cookies as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      get: vi.fn().mockReturnValue(user ? { value: JSON.stringify({ email: user.email, role: user.role }) } : undefined),
    });
  };

  it('cadastra como pendente e vincula o dono autenticado', async () => {
    authenticate(donor);
    const response = await POST(new NextRequest('http://localhost/establishments', {
      method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' },
    }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ ownerId: donor.id, cnpj: '11222333000181', status: 'PENDING' });
  });

  it('bloqueia receptor com 403', async () => {
    authenticate(receiver);
    const response = await POST(new NextRequest('http://localhost/establishments', {
      method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' },
    }));
    expect(response.status).toBe(403);
  });

  it('retorna 409 para CNPJ duplicado', async () => {
    authenticate(donor);
    const request = () => new NextRequest('http://localhost/establishments', {
      method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' },
    });
    expect((await POST(request())).status).toBe(201);
    expect((await POST(request())).status).toBe(409);
  });

  it('retorna 400 e detalhes para payload inválido', async () => {
    authenticate(donor);
    const response = await POST(new NextRequest('http://localhost/establishments', {
      method: 'POST', body: JSON.stringify({ ...payload, cnpj: 'inválido' }), headers: { 'content-type': 'application/json' },
    }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.cnpj).toBeDefined();
  });
});
