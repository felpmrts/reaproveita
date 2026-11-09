import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { formatZodErrors, registerUserSchema, loginSchema, LoginInput } from '@/schemas/auth.schema';
import {
  DuplicateEmailError,
  getUserRepository,
  IUserRepository,
} from '@/repositories/user.repository';
import { PublicUser, UserEntity } from '@/types/user';

export { formatZodErrors };

/**
 * Gera hash seguro da senha usando scrypt com salt aleatório de 16 bytes.
 */
export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(plainPassword, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Verifica uma senha em texto plano contra um hash armazenado de forma resistente a timing attacks.
 */
export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedBuffer = scryptSync(plainPassword, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return timingSafeEqual(keyBuffer, derivedBuffer);
}

/**
 * Converte a entidade interna de usuário para o DTO público (omitindo passwordHash).
 */
export function toPublicUser(entity: UserEntity): PublicUser {
  return {
    id: entity.id,
    name: entity.name,
    email: entity.email,
    role: entity.role,
    phone: entity.phone ?? null,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR' as const;
  public readonly details: Record<string, string[]>;

  constructor(details: Record<string, string[]>, message = 'Dados de cadastro inválidos.') {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class InvalidCredentialsError extends Error {
  public readonly code = 'INVALID_CREDENTIALS' as const;

  constructor(message = 'E-mail ou senha inválidos.') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Serviço de Registro de Usuários (RF01 / RN01).
 * 1. Valida o payload estritamente com Zod (nome, e-mail válido, senha segura, perfil Doador/Receptor).
 * 2. Verifica unicidade de e-mail (RN01).
 * 3. Aplica hash seguro na senha e persiste o registro.
 */
export async function registerUser(
  rawPayload: unknown,
  repository: IUserRepository = getUserRepository()
): Promise<PublicUser> {
  const parsed = registerUserSchema.safeParse(rawPayload);

  if (!parsed.success) {
    throw new ValidationError(formatZodErrors(parsed.error));
  }

  const { name, email, password, role, phone } = parsed.data;

  // Verificação preventiva de unicidade de e-mail (RN01)
  const existingUser = await repository.findByEmail(email);
  if (existingUser) {
    throw new DuplicateEmailError(email);
  }

  const passwordHash = hashPassword(password);

  const createdUser = await repository.create({
    name,
    email,
    passwordHash,
    role,
    phone,
  });

  return toPublicUser(createdUser);
}

/**
 * Serviço de Autenticação de Usuários (RF03).
 * 1. Valida o payload estritamente com Zod.
 * 2. Busca o usuário pelo e-mail.
 * 3. Verifica a senha usando o hash seguro (scrypt).
 */
export async function loginUser(
  rawPayload: unknown,
  repository: IUserRepository = getUserRepository()
): Promise<PublicUser> {
  const parsed = loginSchema.safeParse(rawPayload);

  if (!parsed.success) {
    throw new ValidationError(formatZodErrors(parsed.error), 'Dados de login inválidos.');
  }

  const { email, password } = parsed.data;

  // Busca o usuário no banco/repositório
  const user = await repository.findByEmail(email);

  // Por segurança, se o usuário não existir, ou se a conta estiver inativa,
  // retornamos o mesmo erro genérico para não vazar informações (User Enumeration).
  if (!user || !user.isActive) {
    throw new InvalidCredentialsError();
  }

  // Verifica se a senha informada bate com o hash salvo
  const isPasswordValid = verifyPassword(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new InvalidCredentialsError();
  }

  return toPublicUser(user);
}
