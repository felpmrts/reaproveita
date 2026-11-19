import { z } from 'zod';

export const FOOD_BATCH_CATEGORIES = [
  'Frutas, verduras e legumes',
  'Grãos, cereais e leguminosas',
  'Pães e produtos de padaria',
  'Laticínios e ovos',
  'Carnes e pescados',
  'Refeições prontas',
  'Bebidas',
  'Outros',
] as const;

export const CATALOG_VALIDITY_PRESETS = ['TODAY', 'NEXT_24H', 'NEXT_48H', 'NEXT_7D'] as const;
export const CATALOG_AVAILABILITY_FILTERS = ['ALL', 'PICKUP_NOW', 'PICKUP_TODAY'] as const;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const dateTime = z.string().datetime({ offset: true, message: 'Informe uma data e hora válidas.' });
const text = (max: number) => z.string().trim().min(1, 'Campo obrigatório.').max(max);

function emptyToUndefined(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return value;
}

function parseMinQuantityInput(value: unknown): unknown {
  const normalized = emptyToUndefined(value);
  if (normalized === undefined) return undefined;
  if (typeof normalized === 'number') return normalized;
  if (typeof normalized === 'string') {
    if (!/^\d+$/.test(normalized)) return Number.NaN;
    return Number(normalized);
  }
  return normalized;
}

export function isValidDateOrDateTime(value: string): boolean {
  if (DATE_ONLY_REGEX.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    return (
      utcDate.getUTCFullYear() === year &&
      utcDate.getUTCMonth() + 1 === month &&
      utcDate.getUTCDate() === day
    );
  }
  return z.string().datetime({ offset: true }).safeParse(value).success;
}

export function resolveCatalogDateStartMs(value: string): number {
  return DATE_ONLY_REGEX.test(value)
    ? Date.parse(`${value}T00:00:00.000-03:00`)
    : Date.parse(value);
}

export function resolveCatalogDateEndMs(value: string): number {
  return DATE_ONLY_REGEX.test(value)
    ? Date.parse(`${value}T23:59:59.999-03:00`)
    : Date.parse(value);
}

const CATALOG_QUERY_KEYS = [
  'search',
  'category',
  'expiresFrom',
  'expiresUntil',
  'validity',
  'availability',
  'minQuantity',
] as const;

export const foodBatchCatalogQuerySchema = z
  .object({
    search: z.preprocess(
      emptyToUndefined,
      z.string().max(120, 'A busca deve ter no máximo 120 caracteres.').optional()
    ),
    category: z.preprocess(
      emptyToUndefined,
      z.string().max(80, 'A categoria deve ter no máximo 80 caracteres.').optional()
    ),
    expiresFrom: z.preprocess(
      emptyToUndefined,
      z.string().refine(isValidDateOrDateTime, 'Informe uma data inicial de validade válida.').optional()
    ),
    expiresUntil: z.preprocess(
      emptyToUndefined,
      z.string().refine(isValidDateOrDateTime, 'Informe uma data limite de validade válida.').optional()
    ),
    validity: z.preprocess(
      emptyToUndefined,
      z
        .enum(CATALOG_VALIDITY_PRESETS, {
          errorMap: () => ({ message: 'Filtro de validade inválido.' }),
        })
        .optional()
    ),
    availability: z.preprocess(
      emptyToUndefined,
      z
        .enum(CATALOG_AVAILABILITY_FILTERS, {
          errorMap: () => ({ message: 'Filtro de disponibilidade inválido.' }),
        })
        .optional()
    ),
    minQuantity: z.preprocess(
      parseMinQuantityInput,
      z
        .number({
          invalid_type_error: 'Informe uma quantidade mínima válida (número inteiro positivo).',
        })
        .int('Informe uma quantidade mínima válida (número inteiro positivo).')
        .positive('Informe uma quantidade mínima válida (número inteiro positivo).')
        .max(2147483647, 'Informe uma quantidade mínima válida (número inteiro positivo).')
        .optional()
    ),
  })
  .superRefine((query, ctx) => {
    if (
      query.expiresFrom &&
      query.expiresUntil &&
      resolveCatalogDateStartMs(query.expiresFrom) > resolveCatalogDateEndMs(query.expiresUntil)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiresUntil'],
        message: 'A data limite de validade deve ser igual ou posterior à data inicial.',
      });
    }
  });

export type FoodBatchCatalogQuery = z.infer<typeof foodBatchCatalogQuerySchema>;

export function parseFoodBatchCatalogSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>
) {
  const raw: Record<string, string | undefined> = {};
  for (const key of CATALOG_QUERY_KEYS) {
    if (params instanceof URLSearchParams) {
      raw[key] = params.get(key) ?? undefined;
    } else {
      const value = params[key];
      raw[key] = Array.isArray(value) ? value[0] : value;
    }
  }
  return foodBatchCatalogQuerySchema.safeParse(raw);
}

const editableFoodBatchFields = {
  name: text(120),
  category: text(80),
  description: text(2000),
  storageConditions: text(500),
};

export const manageFoodBatchSchema = z.object({
  ...z.object(editableFoodBatchFields).partial().shape,
  status: z.enum(['INACTIVE', 'CLOSED']).optional(),
  revision: z.number().int().nonnegative().max(2147483647),
}).strict().refine(({ revision, ...changes }) => Object.keys(changes).length > 0);

export type ManageFoodBatchInput = z.infer<typeof manageFoodBatchSchema>;

export const publishFoodBatchSchema = z.object({
  ...editableFoodBatchFields,
  establishmentId: z.string().uuid('Selecione um estabelecimento.'),
  availableQuantity: z.number().int().positive().max(2147483647),
  expiresAt: dateTime,
  pickupStartsAt: dateTime,
  pickupEndsAt: dateTime,
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
