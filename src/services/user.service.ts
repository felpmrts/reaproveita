import { getUserRepository } from '@/repositories/user.repository';
import { PublicUser } from '@/types/user';
import { updateUserProfileSchema } from '@/schemas/user.schema';
import { toPublicUser, ValidationError } from '@/services/auth.service';
import { formatZodErrors } from '@/schemas/auth.schema'; // NOVO: importando o formatador

export class UserNotFoundError extends Error {
  constructor() {
    super('Usuário não encontrado.');
    this.name = 'UserNotFoundError';
  }
}

export const UserService = {
  /**
   * Busca o perfil do usuário pelo ID.
   */
  async getUserProfile(id: string): Promise<PublicUser> {
    const repository = getUserRepository();
    const user = await repository.findById(id);

    if (!user) {
      throw new UserNotFoundError();
    }

    return toPublicUser(user);
  },

  /**
   * Valida e atualiza os dados do perfil do usuário.
   */
  async updateUserProfile(id: string, payload: unknown): Promise<PublicUser> {
    const validation = updateUserProfileSchema.safeParse(payload);
    
    if (!validation.success) {
      // CORREÇÃO: Usamos o utilitário existente para extrair os erros do Zod e passá-los no formato correto
      const formattedErrors = formatZodErrors(validation.error);
      throw new ValidationError(formattedErrors);
    }

    const repository = getUserRepository();
    const updatedUser = await repository.update(id, validation.data);

    if (!updatedUser) {
      throw new UserNotFoundError();
    }

    return toPublicUser(updatedUser);
  }
};