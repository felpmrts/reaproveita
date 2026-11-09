import { z, ZodError } from 'zod';
import { REGISTERABLE_ROLES } from '@/types/user';

/**
 * Formata erros do Zod em um mapa campo -> lista de mensagens de erro.
 * Seguro para execução tanto em Client Components quanto no BFF (Server).
 */
export function formatZodErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const pathKey = issue.path.length > 0 ? String(issue.path[0]) : '_form';
    if (!fieldErrors[pathKey]) {
      fieldErrors[pathKey] = [];
    }
    if (!fieldErrors[pathKey].includes(issue.message)) {
      fieldErrors[pathKey].push(issue.message);
    }
  }

  return fieldErrors;
}

/**
 * Regex de senha segura:
 * - Pelo menos 8 caracteres
 * - Pelo menos 1 letra maiúscula
 * - Pelo menos 1 letra minúscula
 * - Pelo menos 1 número
 * - Pelo menos 1 caractere especial
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const registerRoleSchema = z.enum(REGISTERABLE_ROLES, {
  errorMap: () => ({
    message: 'Selecione um perfil válido: Doador (DONOR) ou Receptor (RECEIVER).',
  }),
});

export const passwordSchema = z
  .string({
    required_error: 'A senha é obrigatória.',
    invalid_type_error: 'A senha deve ser um texto válido.',
  })
  .min(PASSWORD_MIN_LENGTH, `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`)
  .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiúscula.')
  .regex(/[a-z]/, 'A senha deve conter pelo menos uma letra minúscula.')
  .regex(/[0-9]/, 'A senha deve conter pelo menos um número.')
  .regex(/[^A-Za-z0-9]/, 'A senha deve conter pelo menos um caractere especial (ex.: !@#$%&*).');

export const phoneSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((val) => (val === '' ? null : val ?? null))
  .refine(
    (val) => {
      if (!val) return true;
      const digitsOnly = val.replace(/\D/g, '');
      return digitsOnly.length >= 10 && digitsOnly.length <= 13;
    },
    {
      message: 'Informe um telefone válido com DDD (10 ou 11 dígitos).',
    }
  );

/**
 * Schema Zod para o payload da rota POST /auth/register (RF01 / RN01).
 */
export const registerUserSchema = z.object({
  name: z
    .string({
      required_error: 'O nome é obrigatório.',
      invalid_type_error: 'O nome deve ser um texto válido.',
    })
    .trim()
    .min(3, 'O nome deve ter pelo menos 3 caracteres.')
    .max(120, 'O nome deve ter no máximo 120 caracteres.'),
  email: z
    .string({
      required_error: 'O e-mail é obrigatório.',
      invalid_type_error: 'O e-mail deve ser um texto válido.',
    })
    .trim()
    .min(1, 'O e-mail é obrigatório.')
    .max(255, 'O e-mail deve ter no máximo 255 caracteres.')
    .email('Informe um endereço de e-mail válido.')
    .transform((email) => email.toLowerCase()),
  password: passwordSchema,
  role: registerRoleSchema,
  phone: phoneSchema,
});

/**
 * Schema Zod para o formulário de cadastro no Frontend (inclui confirmação de senha).
 */
export const registerFormSchema = registerUserSchema
  .extend({
    confirmPassword: z
      .string({
        required_error: 'A confirmação de senha é obrigatória.',
      })
      .min(1, 'Confirme sua senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas informadas não coincidem.',
    path: ['confirmPassword'],
  });

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;

export const loginSchema = z.object({
  email: z
    .string({
      required_error: 'O e-mail é obrigatório.',
      invalid_type_error: 'O e-mail deve ser um texto válido.',
    })
    .trim()
    .min(1, 'O e-mail é obrigatório.')
    .email('Informe um endereço de e-mail válido.')
    .transform((email) => email.toLowerCase()),
  password: z
    .string({
      required_error: 'A senha é obrigatória.',
    })
    .min(1, 'A senha é obrigatória.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
