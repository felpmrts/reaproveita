import { z } from 'zod';

const dateTime = z.string().datetime({ offset: true, message: 'Informe uma data e hora válidas.' });
const text = (max: number) => z.string().trim().min(1, 'Campo obrigatório.').max(max);

export const publishFoodBatchSchema = z.object({
  establishmentId: z.string().uuid('Selecione um estabelecimento.'),
  name: text(120),
  category: text(80),
  description: text(2000),
  availableQuantity: z.number().int().positive().max(2147483647),
  expiresAt: dateTime,
  pickupStartsAt: dateTime,
  pickupEndsAt: dateTime,
  storageConditions: text(500),
  fitForConsumption: z.literal(true, {
    errorMap: () => ({ message: 'Confirme a adequação do alimento para consumo.' }),
  }),
}).strict().superRefine((batch, ctx) => {
  const now = Date.now();
  const expiresAt = Date.parse(batch.expiresAt);
  const startsAt = Date.parse(batch.pickupStartsAt);
  const endsAt = Date.parse(batch.pickupEndsAt);

  if (expiresAt <= now) {
    ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'A validade deve estar no futuro.' });
  }
  if (endsAt <= startsAt || endsAt <= now || endsAt > expiresAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['pickupEndsAt'],
      message: 'O fim da retirada deve estar no futuro, após o início e dentro da validade.',
    });
  }
});

export type PublishFoodBatchInput = z.infer<typeof publishFoodBatchSchema>;
