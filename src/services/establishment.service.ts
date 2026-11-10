import { createEstablishmentSchema } from '@/schemas/establishment.schema';
import {
  DuplicateCnpjError,
  getEstablishmentRepository,
  IEstablishmentRepository,
} from '@/repositories/establishment.repository';
import { EstablishmentEntity } from '@/types/establishment';

export class EstablishmentValidationError extends Error {
  constructor(public readonly details: Record<string, string[]>) {
    super('Revise os dados informados para cadastrar o estabelecimento.');
    this.name = 'EstablishmentValidationError';
  }
}
export class EstablishmentNotFoundError extends Error {
  public readonly code = 'ESTABLISHMENT_NOT_FOUND' as const;

  constructor() {
    super('Estabelecimento não encontrado.');
    this.name = 'EstablishmentNotFoundError';
  }
}

export class EstablishmentOwnershipError extends Error {
  public readonly code = 'ESTABLISHMENT_OWNERSHIP_REQUIRED' as const;

  constructor() {
    super('O estabelecimento não pertence ao Doador autenticado.');
    this.name = 'EstablishmentOwnershipError';
  }
}

export class EstablishmentNotApprovedError extends Error {
  public readonly code = 'ESTABLISHMENT_NOT_APPROVED' as const;

  constructor() {
    super('A publicação de ofertas exige um estabelecimento previamente validado e aprovado.');
    this.name = 'EstablishmentNotApprovedError';
  }
}

function formatErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.reduce<Record<string, string[]>>((result, issue) => {
    const field = issue.path.length ? String(issue.path[0]) : '_form';
    result[field] = [...(result[field] ?? []), issue.message];
    return result;
  }, {});
}

export async function createEstablishment(
  ownerId: string,
  payload: unknown,
  repository: IEstablishmentRepository = getEstablishmentRepository()
): Promise<EstablishmentEntity> {
  const parsed = createEstablishmentSchema.safeParse(payload);
  if (!parsed.success) throw new EstablishmentValidationError(formatErrors(parsed.error));

  if (await repository.findByCnpj(parsed.data.cnpj)) throw new DuplicateCnpjError();
  return repository.create(ownerId, parsed.data);
}

/**
 * Trava obrigatória para qualquer fluxo de publicação de ofertas (SCRUM-62 / RN02).
 * O futuro endpoint do ST07 deve chamar esta função antes de persistir um lote.
 */
export async function requireApprovedEstablishmentForPublication(
  ownerId: string,
  establishmentId: string,
  repository: IEstablishmentRepository = getEstablishmentRepository()
): Promise<EstablishmentEntity> {
  const establishment = await repository.findById(establishmentId);
  if (!establishment) throw new EstablishmentNotFoundError();
  if (establishment.ownerId !== ownerId) throw new EstablishmentOwnershipError();
  if (establishment.status !== 'APPROVED') throw new EstablishmentNotApprovedError();
  return establishment;
}
