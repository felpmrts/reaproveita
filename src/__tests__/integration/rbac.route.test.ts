import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getInMemoryUserRepository } from '@/repositories/user.repository';
import {
  EstablishmentResource,
  getRbacResourceRepository,
  ReservationResource,
} from '@/repositories/rbac-resources.repository';
import {
  GET as getDonorEstablishment,
  PATCH as patchDonorEstablishment,
} from '@/app/api/donor/establishments/[id]/route';
import {
  GET as getReceiverReservation,
  PATCH as patchReceiverReservation,
} from '@/app/api/receiver/reservations/[id]/route';
import {
  GET as getAdminOperations,
  POST as postAdminOperations,
} from '@/app/api/admin/operations/route';
import { UserEntity } from '@/types/user';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('História 3 - Controle de Acesso Baseado em Papéis (RBAC - RN03 & RN14)', () => {
  const userRepo = getInMemoryUserRepository();
  const resourceRepo = getRbacResourceRepository();

  let donorLinked: UserEntity;
  let donorUnlinked: UserEntity;
  let receiverOne: UserEntity;
  let receiverTwo: UserEntity;
  let adminUser: UserEntity;

  let establishmentDonorLinked: EstablishmentResource;
  let reservationReceiverOne: ReservationResource;

  beforeEach(async () => {
    await userRepo.clear();
    await resourceRepo.clear();

    donorLinked = await userRepo.create({
      name: 'Padaria Pão Quente (Doador 1)',
      email: 'doador1@reaproveita.com',
      passwordHash: 'hash_doador_1',
      role: 'DONOR',
      phone: '34999991111',
    });

    donorUnlinked = await userRepo.create({
      name: 'Mercado Central (Doador 2)',
      email: 'doador2@reaproveita.com',
      passwordHash: 'hash_doador_2',
      role: 'DONOR',
      phone: '34999992222',
    });

    receiverOne = await userRepo.create({
      name: 'Maria Receptora',
      email: 'receptora1@reaproveita.com',
      passwordHash: 'hash_receptora_1',
      role: 'RECEIVER',
      phone: '34999993333',
    });

    receiverTwo = await userRepo.create({
      name: 'João Receptor',
      email: 'receptor2@reaproveita.com',
      passwordHash: 'hash_receptor_2',
      role: 'RECEIVER',
      phone: '34999994444',
    });

    adminUser = await userRepo.create({
      name: 'Administrador Geral',
      email: 'admin@reaproveita.com',
      passwordHash: 'hash_admin',
      role: 'ADMIN',
      phone: '34999995555',
    });

    establishmentDonorLinked = await resourceRepo.createEstablishment({
      id: 'est-doador-1',
      name: 'Padaria Pão Quente Matriz',
      ownerId: donorLinked.id,
      address: 'Av. Rondon Pacheco, 1000',
      isApproved: false,
    });

    reservationReceiverOne = await resourceRepo.createReservation({
      id: 'res-receptora-1',
      batchTitle: 'Cesta de Pães Artesanais',
      receiverId: receiverOne.id,
      quantity: 2,
      status: 'ACTIVE',
    });
  });

  const mockSessionAs = (user: UserEntity | null) => {
    if (!user) {
      (cookies as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      });
      return;
    }

    (cookies as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      get: vi.fn().mockReturnValue({
        value: JSON.stringify({
          id: user.id,
          email: user.email,
          role: user.role,
        }),
      }),
    });
  };

  describe('Critério QA: Receptor tentando disparar operações de Administrador ou Doador', () => {
    it('deve bloquear com HTTP 403 Forbidden padronizado quando Receptor tenta consultar operações de Administrador', async () => {
      mockSessionAs(receiverOne);

      const response = await getAdminOperations();
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: expect.stringContaining('ADMIN'),
        },
      });
    });

    it('deve bloquear com HTTP 403 Forbidden padronizado quando Receptor tenta executar operação administrativa (POST /api/admin/operations)', async () => {
      mockSessionAs(receiverOne);

      const request = new NextRequest('http://localhost:3000/api/admin/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVE_ESTABLISHMENT',
          establishmentId: establishmentDonorLinked.id,
        }),
      });

      const response = await postAdminOperations(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');

      // Garante que o estabelecimento não foi modificado
      const unchanged = await resourceRepo.findEstablishmentById(establishmentDonorLinked.id);
      expect(unchanged?.isApproved).toBe(false);
    });

    it('deve bloquear com HTTP 403 Forbidden padronizado quando Receptor tenta gerenciar estabelecimento de Doador', async () => {
      mockSessionAs(receiverOne);

      const request = new NextRequest(
        `http://localhost:3000/api/donor/establishments/${establishmentDonorLinked.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Tentativa Invasão pelo Receptor' }),
        }
      );

      const response = await patchDonorEstablishment(request, {
        params: { id: establishmentDonorLinked.id },
      });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');

      const unchanged = await resourceRepo.findEstablishmentById(establishmentDonorLinked.id);
      expect(unchanged?.name).toBe('Padaria Pão Quente Matriz');
    });
  });

  describe('Critério 1 (RN03): Doador pode gerenciar apenas estabelecimentos aos quais está vinculado', () => {
    it('deve permitir (200 OK) que o Doador vinculado consulte e atualize seu próprio estabelecimento', async () => {
      mockSessionAs(donorLinked);

      const getReq = new NextRequest(
        `http://localhost:3000/api/donor/establishments/${establishmentDonorLinked.id}`
      );
      const getRes = await getDonorEstablishment(getReq, {
        params: { id: establishmentDonorLinked.id },
      });
      expect(getRes.status).toBe(200);

      const patchReq = new NextRequest(
        `http://localhost:3000/api/donor/establishments/${establishmentDonorLinked.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Padaria Pão Quente Filial Centro' }),
        }
      );
      const patchRes = await patchDonorEstablishment(patchReq, {
        params: { id: establishmentDonorLinked.id },
      });
      const patchBody = await patchRes.json();

      expect(patchRes.status).toBe(200);
      expect(patchBody.success).toBe(true);
      expect(patchBody.data.name).toBe('Padaria Pão Quente Filial Centro');
    });

    it('deve bloquear com HTTP 403 Forbidden quando outro Doador não vinculado tenta gerenciar o estabelecimento', async () => {
      mockSessionAs(donorUnlinked);

      const patchReq = new NextRequest(
        `http://localhost:3000/api/donor/establishments/${establishmentDonorLinked.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Alteração Indevida por Outro Doador' }),
        }
      );

      const response = await patchDonorEstablishment(patchReq, {
        params: { id: establishmentDonorLinked.id },
      });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('vinculado');
    });
  });

  describe('Critério 2: Receptor pode gerenciar suas próprias reservas', () => {
    it('deve permitir (200 OK) que o Receptor titular gerencie sua própria reserva', async () => {
      mockSessionAs(receiverOne);

      const patchReq = new NextRequest(
        `http://localhost:3000/api/receiver/reservations/${reservationReceiverOne.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'CANCELLED' }),
        }
      );

      const response = await patchReceiverReservation(patchReq, {
        params: { id: reservationReceiverOne.id },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('CANCELLED');
    });

    it('deve bloquear com HTTP 403 Forbidden quando outro Receptor tenta gerenciar reserva de terceiro', async () => {
      mockSessionAs(receiverTwo);

      const getReq = new NextRequest(
        `http://localhost:3000/api/receiver/reservations/${reservationReceiverOne.id}`
      );
      const response = await getReceiverReservation(getReq, {
        params: { id: reservationReceiverOne.id },
      });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('suas próprias reservas');
    });

    it('deve bloquear com HTTP 403 Forbidden quando Doador tenta acessar endpoint de reservas do Receptor', async () => {
      mockSessionAs(donorLinked);

      const getReq = new NextRequest(
        `http://localhost:3000/api/receiver/reservations/${reservationReceiverOne.id}`
      );
      const response = await getReceiverReservation(getReq, {
        params: { id: reservationReceiverOne.id },
      });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Critério 3: Administrador pode acessar as operações administrativas autorizadas', () => {
    it('deve permitir (200 OK) que Administrador consulte e execute operações administrativas', async () => {
      mockSessionAs(adminUser);

      const listRes = await getAdminOperations();
      expect(listRes.status).toBe(200);

      const postReq = new NextRequest('http://localhost:3000/api/admin/operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVE_ESTABLISHMENT',
          establishmentId: establishmentDonorLinked.id,
        }),
      });

      const postRes = await postAdminOperations(postReq);
      const postBody = await postRes.json();

      expect(postRes.status).toBe(200);
      expect(postBody.success).toBe(true);
      expect(postBody.data.establishment.isApproved).toBe(true);
    });

    it('deve bloquear com HTTP 403 Forbidden quando Doador tenta executar operações administrativas', async () => {
      mockSessionAs(donorLinked);

      const response = await getAdminOperations();
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('deve retornar HTTP 401 Unauthorized quando requisição não possui sessão autenticada', async () => {
      mockSessionAs(null);

      const response = await getAdminOperations();
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
