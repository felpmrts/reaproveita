import { describe, expect, it } from 'vitest';
import { formatCnpj, formatPhone, formatZipCode } from '@/lib/input-masks';

describe('máscaras do cadastro de estabelecimento', () => {
  it('formata CNPJ progressivamente e limita a 14 dígitos', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('11222333000181999')).toBe('11.222.333/0001-81');
  });

  it('formata telefones fixos e celulares', () => {
    expect(formatPhone('3433334444')).toBe('(34) 3333-4444');
    expect(formatPhone('34999996718')).toBe('(34) 99999-6718');
  });

  it('formata CEP e limita a oito dígitos', () => {
    expect(formatZipCode('38414376')).toBe('38414-376');
    expect(formatZipCode('3841437699')).toBe('38414-376');
  });
});
