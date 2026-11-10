function digits(value: string, limit: number): string {
  return value.replace(/\D/g, '').slice(0, limit);
}
export function formatCnpj(value: string): string {
  const raw = digits(value, 14);
  return raw
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\/\d{4})(\d)/, '$1-$2');
}

export function formatPhone(value: string): string {
  const raw = digits(value, 11);
  if (raw.length <= 10) {
    return raw
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return raw
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export function formatZipCode(value: string): string {
  return digits(value, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}
