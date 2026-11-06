import { randomUUID } from 'crypto';
import { CreateUserRecordInput, UserEntity } from '@/types/user';
import { createSupabaseAdminClient, isSupabaseConfigured } from '@/lib/supabase/server';

export class DuplicateEmailError extends Error {
  public readonly code = 'EMAIL_ALREADY_EXISTS' as const;

  constructor(email: string) {
    super(`O e-mail '${email}' já está cadastrado na plataforma.`);
    this.name = 'DuplicateEmailError';
  }
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  create(input: CreateUserRecordInput): Promise<UserEntity>;
  clear?(): Promise<void>;
}

/**
 * Repositório em memória com garantia de unicidade case-insensitive no e-mail (RN01).
 * Utilizado em ambiente de desenvolvimento local (quando Supabase não está configurado) e testes automatizados.
 */
export class InMemoryUserRepository implements IUserRepository {
  private usersById = new Map<string, UserEntity>();
  private userIdByEmail = new Map<string, string>();

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const userId = this.userIdByEmail.get(normalizedEmail);
    if (!userId) return null;
    return this.usersById.get(userId) ?? null;
  }

  async create(input: CreateUserRecordInput): Promise<UserEntity> {
    const normalizedEmail = input.email.trim().toLowerCase();

    if (this.userIdByEmail.has(normalizedEmail)) {
      throw new DuplicateEmailError(normalizedEmail);
    }

    const now = new Date().toISOString();
    const user: UserEntity = {
      id: randomUUID(),
      authUserId: input.authUserId ?? null,
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash: input.passwordHash,
      role: input.role,
      phone: input.phone ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.usersById.set(user.id, user);
    this.userIdByEmail.set(normalizedEmail, user.id);

    return user;
  }

  async clear(): Promise<void> {
    this.usersById.clear();
    this.userIdByEmail.clear();
  }
}

/**
 * Repositório oficial integrado ao PostgreSQL 15+ (Supabase) e Supabase Auth.
 * Garante RN01 (unicidade de ID e e-mail) tanto no Supabase Auth quanto na tabela public.users.
 */
export class SupabaseUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao consultar usuário por e-mail: ${error.message}`);
    }

    if (!data) return null;

    return {
      id: data.id,
      authUserId: data.auth_user_id,
      name: data.name,
      email: data.email,
      passwordHash: data.password_hash,
      role: data.role,
      phone: data.phone,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async create(input: CreateUserRecordInput): Promise<UserEntity> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from('users')
      .insert({
        auth_user_id: input.authUserId ?? null,
        name: input.name.trim(),
        email: normalizedEmail,
        password_hash: input.passwordHash,
        role: input.role,
        phone: input.phone ?? null,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      // Código 23505 no PostgreSQL = unique_violation (RN01)
      if (error.code === '23505' || error.message.toLowerCase().includes('unique')) {
        throw new DuplicateEmailError(normalizedEmail);
      }
      throw new Error(`Erro ao persistir usuário no banco de dados: ${error.message}`);
    }

    return {
      id: data.id,
      authUserId: data.auth_user_id,
      name: data.name,
      email: data.email,
      passwordHash: data.password_hash,
      role: data.role,
      phone: data.phone,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}

// Singleton global para manter estado consistente em memória durante dev/testes
const globalForUserRepository = globalThis as unknown as {
  inMemoryUserRepository?: InMemoryUserRepository;
  activeUserRepository?: IUserRepository;
};

export function getInMemoryUserRepository(): InMemoryUserRepository {
  if (!globalForUserRepository.inMemoryUserRepository) {
    globalForUserRepository.inMemoryUserRepository = new InMemoryUserRepository();
  }
  return globalForUserRepository.inMemoryUserRepository;
}

export function getUserRepository(): IUserRepository {
  if (globalForUserRepository.activeUserRepository) {
    return globalForUserRepository.activeUserRepository;
  }

  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseUserRepository();
  }

  return getInMemoryUserRepository();
}

export function setUserRepository(repository: IUserRepository | undefined): void {
  globalForUserRepository.activeUserRepository = repository;
}
