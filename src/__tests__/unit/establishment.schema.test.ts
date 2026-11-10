import { describe, expect, it } from 'vitest';
import { createEstablishmentSchema, isValidCnpj } from '@/schemas/establishment.schema';

const validPayload = {
  name: 'Padaria Pão Quente',
  cnpj: '11.222.333/0001-81',
  email: 'CONTATO@PADARIA.COM.BR',
  phone: '(34) 99999-0000',
  zipCode: '38400-100',
  street: 'Avenida Brasil',
  number: '1200',
  neighborhood: 'Centro',
  city: 'Uberlândia',
  state: 'mg',
  latitude: -18.9186,
  longitude: -48.2772,
};

describe('createEstablishmentSchema', () => {
  it('valida e normaliza um cadastro completo', () => {
    const result = createEstablishmentSchema.parse(validPayload);
    expect(result.cnpj).toBe('11222333000181');
    expect(result.email).toBe('contato@padaria.com.br');
    expect(result.phone).toBe('34999990000');
    expect(result.zipCode).toBe('38400100');
    expect(result.state).toBe('MG');
  });

  it('rejeita CNPJ inválido', () => {
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(createEstablishmentSchema.safeParse({ ...validPayload, cnpj: '11.111.111/1111-11' }).success).toBe(false);
  });

  it('exige latitude e longitude e valida seus limites', () => {
    const { longitude: _longitude, ...withoutLongitude } = validPayload;
    expect(createEstablishmentSchema.safeParse(withoutLongitude).success).toBe(false);
    expect(createEstablishmentSchema.safeParse({ ...validPayload, latitude: -91, longitude: -48.2 }).success).toBe(false);
    expect(createEstablishmentSchema.safeParse({ ...validPayload, latitude: -18.9, longitude: -48.2 }).success).toBe(true);
  });
});
