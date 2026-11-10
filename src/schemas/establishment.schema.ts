import { z } from 'zod';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(`${cnpj.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

const requiredText = (label: string, min = 2, max = 120) =>
  z.string({ required_error: `${label} é obrigatório.` }).trim().min(min, `${label} é obrigatório.`).max(max);

const requiredCoordinate = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
    z
      .number({ required_error: `${label} é obrigatória.`, invalid_type_error: `${label} inválida.` })
      .min(min, `${label} inválida.`)
      .max(max, `${label} inválida.`)
  );

export const createEstablishmentSchema = z
  .object({
    name: requiredText('O nome do estabelecimento', 3),
    cnpj: z
      .string({ required_error: 'O CNPJ é obrigatório.' })
      .transform(onlyDigits)
      .refine(isValidCnpj, 'Informe um CNPJ válido.'),
    email: z.string({ required_error: 'O e-mail é obrigatório.' }).trim().toLowerCase().email('Informe um e-mail válido.'),
    phone: z
      .string({ required_error: 'O telefone é obrigatório.' })
      .transform(onlyDigits)
      .refine((value) => value.length === 10 || value.length === 11, 'Informe um telefone válido com DDD.'),
    zipCode: z
      .string({ required_error: 'O CEP é obrigatório.' })
      .transform(onlyDigits)
      .refine((value) => value.length === 8, 'Informe um CEP válido.'),
    street: requiredText('O logradouro', 3, 160),
    number: requiredText('O número', 1, 20),
    complement: z.string().trim().max(120).optional().transform((value) => value || undefined),
    neighborhood: requiredText('O bairro', 2, 100),
    city: requiredText('A cidade', 2, 100),
    state: z
      .string({ required_error: 'O estado é obrigatório.' })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Informe a UF com duas letras.'),
    latitude: requiredCoordinate(-90, 90, 'Latitude'),
    longitude: requiredCoordinate(-180, 180, 'Longitude'),
  })
  .strict();

export type CreateEstablishmentInput = z.infer<typeof createEstablishmentSchema>;
