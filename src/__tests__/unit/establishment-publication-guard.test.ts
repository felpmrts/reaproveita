import { beforeEach, describe, expect, it } from 'vitest';
import { getInMemoryEstablishmentRepository } from '@/repositories/establishment.repository';
import {
  EstablishmentNotApprovedError,
  EstablishmentOwnershipError,
  requireApprovedEstablishmentForPublication,
} from '@/services/establishment.service';

const input = {
  name: 'Padaria Pão Quente', cnpj: '11222333000181', email: 'contato@padaria.com.br',
  phone: '34999990000', zipCode: '38400100', street: 'Avenida Brasil', number: '1200',
  neighborhood: 'Centro', city: 'Uberlândia', state: 'MG', latitude: -18.9186, longitude: -48.2772,
};

describe('SCRUM-62 - trava de validação para publicação', () => {
  const repository = getInMemoryEstablishmentRepository();

  beforeEach(async () => repository.clear());

  it('impede publicação enquanto o estabelecimento está pendente', async () => {
    const establishment = await repository.create('donor-1', input);
    await expect(
      requireApprovedEstablishmentForPublication('donor-1', establishment.id, repository)
    ).rejects.toBeInstanceOf(EstablishmentNotApprovedError);
  });

  it('permite publicação somente após aprovação', async () => {
    const establishment = await repository.create('donor-1', input);
    await repository.updateStatus(establishment.id, 'APPROVED');
    await expect(
      requireApprovedEstablishmentForPublication('donor-1', establishment.id, repository)
    ).resolves.toMatchObject({ id: establishment.id, status: 'APPROVED' });
  });

  it('impede que outro doador use o estabelecimento aprovado', async () => {
    const establishment = await repository.create('donor-1', input);
    await repository.updateStatus(establishment.id, 'APPROVED');
    await expect(
      requireApprovedEstablishmentForPublication('donor-2', establishment.id, repository)
    ).rejects.toBeInstanceOf(EstablishmentOwnershipError);
  });
});
