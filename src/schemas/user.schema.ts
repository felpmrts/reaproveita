import { z } from 'zod';
import { phoneSchema } from '@/schemas/auth.schema';

/**
 * Schema para atualização do perfil do usuário autenticado.
 *
 * Campos autorizados:
 * - name: nome do usuário.
 * - phone: telefone de contato.
 *
 * Campos adicionais são rejeitados para impedir alterações
 * indevidas de atributos protegidos.
 */
export const updateUserProfileSchema = z
  .object({
    name: z
      .string({
        required_error: 'O nome é obrigatório.',
        invalid_type_error: 'O nome deve ser um texto válido.',
      })
      .trim()
      .min(3, 'O nome deve ter pelo menos 3 caracteres.')
      .max(120, 'O nome deve ter no máximo 120 caracteres.')
      .optional(),

    phone: phoneSchema.optional(),
  })
  .strict();

export type UpdateUserProfileInput = z.infer<
  typeof updateUserProfileSchema
>;