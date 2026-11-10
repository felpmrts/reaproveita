/**
 * Papéis de usuário suportados no sistema (RBAC - Seção 3 do contexto).
 * - DONOR: Doador / Comerciante (restaurantes, padarias, mercados, hortifrutis)
 * - RECEIVER: Receptor / Beneficiário (pessoas físicas ou instituições sociais)
 * - ADMIN: Administrador da plataforma
 */
export const USER_ROLES = ['DONOR', 'RECEIVER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Papéis permitidos no autocadastro público (RF01).
 */
export const REGISTERABLE_ROLES = ['DONOR', 'RECEIVER'] as const;
export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number];

/**
 * Entidade de Usuário persistida no banco de dados (RN01).
 */
export interface UserEntity {
  id: string;
  authUserId?: string | null;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO público do usuário (sem exposição de hash de senha).
 */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dados de entrada já validados para criação de um novo usuário.
 */
export interface CreateUserRecordInput {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string | null;
  authUserId?: string | null;
}

/**
 * Estrutura padronizada de resposta da API de autenticação e autorização.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_JSON'
  | 'INTERNAL_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND';

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, string[]>;
  };
}

export type RegisterApiResponse = ApiSuccessResponse<PublicUser> | ApiErrorResponse;
