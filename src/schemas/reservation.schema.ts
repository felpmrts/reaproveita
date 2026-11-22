import { z } from 'zod';

export const reservationStatusSchema = z.enum(['ACTIVE', 'CANCELLED', 'COMPLETED']);

export const cancelReservationSchema = z
  .object({
    status: z.literal('CANCELLED'),
    reason: z
      .string()
      .trim()
      .max(300, 'O motivo do cancelamento deve ter no máximo 300 caracteres.')
      .optional(),
  })
  .strict();

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

export const donorReservationsQuerySchema = z
  .object({
    establishmentId: z
      .string()
      .uuid('Identificador de estabelecimento inválido.')
      .optional(),
    status: reservationStatusSchema.optional(),
    search: z
      .string()
      .trim()
      .max(120, 'O termo de busca deve ter no máximo 120 caracteres.')
      .optional(),
  })
  .strict();

export type DonorReservationsQueryInput = z.infer<typeof donorReservationsQuerySchema>;
