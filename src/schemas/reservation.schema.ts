import { z } from 'zod';

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
