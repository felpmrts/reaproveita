import { randomUUID } from 'crypto';
import { CreateEstablishmentInput } from '@/schemas/establishment.schema';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { EstablishmentEntity, EstablishmentStatus } from '@/types/establishment';

export class DuplicateCnpjError extends Error {
  public readonly code = 'CNPJ_ALREADY_EXISTS' as const;

  constructor() {
    super('Já existe um estabelecimento cadastrado com este CNPJ.');
    this.name = 'DuplicateCnpjError';
  }
}
export interface IEstablishmentRepository {
  create(ownerId: string, input: CreateEstablishmentInput): Promise<EstablishmentEntity>;
  findById(id: string): Promise<EstablishmentEntity | null>;
  findByCnpj(cnpj: string): Promise<EstablishmentEntity | null>;
  findByOwner(ownerId: string): Promise<EstablishmentEntity[]>;
  updateStatus(id: string, status: EstablishmentStatus): Promise<EstablishmentEntity | null>;
  clear?(): Promise<void>;
}

export class InMemoryEstablishmentRepository implements IEstablishmentRepository {
  private establishments = new Map<string, EstablishmentEntity>();
  private establishmentIdByCnpj = new Map<string, string>();

  async create(ownerId: string, input: CreateEstablishmentInput): Promise<EstablishmentEntity> {
    if (this.establishmentIdByCnpj.has(input.cnpj)) throw new DuplicateCnpjError();

    const now = new Date().toISOString();
    const establishment: EstablishmentEntity = {
      id: randomUUID(),
      ownerId,
      ...input,
      complement: input.complement ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    this.establishments.set(establishment.id, establishment);
    this.establishmentIdByCnpj.set(establishment.cnpj, establishment.id);
    return establishment;
  }

  async findByCnpj(cnpj: string): Promise<EstablishmentEntity | null> {
    const id = this.establishmentIdByCnpj.get(cnpj);
    return id ? this.establishments.get(id) ?? null : null;
  }

  async findById(id: string): Promise<EstablishmentEntity | null> {
    return this.establishments.get(id) ?? null;
  }

  async findByOwner(ownerId: string): Promise<EstablishmentEntity[]> {
    return Array.from(this.establishments.values()).filter((item) => item.ownerId === ownerId);
  }

  async updateStatus(id: string, status: EstablishmentStatus): Promise<EstablishmentEntity | null> {
    const current = this.establishments.get(id);
    if (!current) return null;
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    this.establishments.set(id, updated);
    return updated;
  }

  async clear(): Promise<void> {
    this.establishments.clear();
    this.establishmentIdByCnpj.clear();
  }
}

type EstablishmentRow = {
  id: string;
  owner_id: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  status: EstablishmentEntity['status'];
  created_at: string;
  updated_at: string;
};

function fromRow(row: EstablishmentRow): EstablishmentEntity {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    cnpj: row.cnpj,
    email: row.email,
    phone: row.phone,
    zipCode: row.zip_code,
    street: row.street,
    number: row.number,
    complement: row.complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingEstablishmentsTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const message = error.message?.toLowerCase() ?? '';
  return (
    message.includes('public.establishments') &&
    (message.includes('schema cache') || message.includes('does not exist'))
  );
}

export class SupabaseEstablishmentRepository implements IEstablishmentRepository {
  async create(ownerId: string, input: CreateEstablishmentInput): Promise<EstablishmentEntity> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('establishments')
      .insert({
        owner_id: ownerId,
        name: input.name,
        cnpj: input.cnpj,
        email: input.email,
        phone: input.phone,
        zip_code: input.zipCode,
        street: input.street,
        number: input.number,
        complement: input.complement ?? null,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state,
        latitude: input.latitude,
        longitude: input.longitude,
      })
      .select('*')
      .single();

    if (isMissingEstablishmentsTableError(error)) {
      return getInMemoryEstablishmentRepository().create(ownerId, input);
    }
    if (error?.code === '23505') throw new DuplicateCnpjError();
    if (error || !data) throw new Error(error?.message ?? 'Não foi possível cadastrar o estabelecimento.');
    return fromRow(data as EstablishmentRow);
  }

  async findByCnpj(cnpj: string): Promise<EstablishmentEntity | null> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from('establishments').select('*').eq('cnpj', cnpj).maybeSingle();
    if (isMissingEstablishmentsTableError(error)) {
      return getInMemoryEstablishmentRepository().findByCnpj(cnpj);
    }
    if (error) throw new Error(error.message);
    return data ? fromRow(data as EstablishmentRow) : null;
  }

  async findById(id: string): Promise<EstablishmentEntity | null> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from('establishments').select('*').eq('id', id).maybeSingle();
    if (isMissingEstablishmentsTableError(error)) {
      return getInMemoryEstablishmentRepository().findById(id);
    }
    if (error) throw new Error(error.message);
    return data ? fromRow(data as EstablishmentRow) : null;
  }

  async findByOwner(ownerId: string): Promise<EstablishmentEntity[]> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('establishments')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    if (isMissingEstablishmentsTableError(error)) {
      return getInMemoryEstablishmentRepository().findByOwner(ownerId);
    }
    if (error) throw new Error(error.message);
    return (data as EstablishmentRow[] | null)?.map(fromRow) ?? [];
  }

  async updateStatus(id: string, status: EstablishmentStatus): Promise<EstablishmentEntity | null> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('establishments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (isMissingEstablishmentsTableError(error)) {
      return getInMemoryEstablishmentRepository().updateStatus(id, status);
    }
    if (error) throw new Error(error.message);
    return data ? fromRow(data as EstablishmentRow) : null;
  }
}

const globalRepository = globalThis as unknown as {
  inMemoryEstablishmentRepository?: InMemoryEstablishmentRepository;
};

export function getInMemoryEstablishmentRepository(): InMemoryEstablishmentRepository {
  if (!globalRepository.inMemoryEstablishmentRepository) {
    globalRepository.inMemoryEstablishmentRepository = new InMemoryEstablishmentRepository();
  }
  return globalRepository.inMemoryEstablishmentRepository;
}

export function getEstablishmentRepository(): IEstablishmentRepository {
  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseEstablishmentRepository();
  }
  return getInMemoryEstablishmentRepository();
}
