'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

const fields = [
  { name: 'name', label: 'Nome do alimento', maxLength: 120 },
  { name: 'availableQuantity', label: 'Quantidade disponível (unidades)', type: 'number' },
  { name: 'expiresAt', label: 'Validade', type: 'date' },
  { name: 'pickupStartsAt', label: 'Início da retirada', type: 'date' },
  { name: 'pickupEndsAt', label: 'Fim da retirada', type: 'date' },
];

const categories = [
  'Frutas, verduras e legumes',
  'Grãos, cereais e leguminosas',
  'Pães e produtos de padaria',
  'Laticínios e ovos',
  'Carnes e pescados',
  'Refeições prontas',
  'Bebidas',
  'Outros',
];

const control = 'mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900';

export function FoodBatchForm({ establishments }: { establishments: Array<{ id: string; name: string }> }) {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState('');
  const [published, setPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    const toIso = (name: string, time: string) => new Date(`${form.get(name)}T${time}`).toISOString();
    setSubmitting(true);
    setErrors({});
    setMessage('');

    try {
      const response = await fetch('/food-batches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          availableQuantity: Number(form.get('availableQuantity')),
          expiresAt: toIso('expiresAt', '23:59:59.999'),
          pickupStartsAt: toIso('pickupStartsAt', '00:00:00.000'),
          pickupEndsAt: toIso('pickupEndsAt', '23:59:59.999'),
          fitForConsumption: form.has('fitForConsumption'),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.error?.details ?? {});
        setMessage(result.error?.message ?? 'Não foi possível publicar o lote.');
        return;
      }
      setPublished(true);
    } catch {
      setMessage('Não foi possível enviar os dados. Confira as datas e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (name: string) => errors[name]?.[0] && (
    <span className="mt-1 block text-xs text-red-700">{errors[name][0]}</span>
  );

  if (published) {
    return (
      <div className="mt-4 space-y-4">
        <p className="text-emerald-800" role="status">Lote publicado com sucesso.</p>
        <Link
          href="/painel/doador/lotes"
          className="inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 text-sm font-medium text-slate-700">
      {message && <p role="alert" className="text-red-700">{message}</p>}
      <label className="block">
        Estabelecimento
        <select name="establishmentId" className={control} required>
          <option value="">Selecione um estabelecimento</option>
          {establishments.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
        {fieldError('establishmentId')}
      </label>
      <p className="text-xs text-slate-600">A retirada começa no primeiro dia e pode ocorrer até o fim do último dia indicado. A validade vai até o fim da data informada, no fuso do seu dispositivo.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Categoria
          <select name="category" className={control} required>
            <option value="">Selecione uma categoria</option>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
          {fieldError('category')}
        </label>
        {fields.map(({ name, label, type, maxLength }) => (
          <label key={name}>
            {label}
            <input name={name} type={type ?? 'text'} maxLength={maxLength}
              min={type === 'number' ? 1 : undefined} className={control} required />
            {fieldError(name)}
          </label>
        ))}
      </div>
      <label className="block">
        Descrição do alimento
        <textarea name="description" maxLength={2000} className={control} required />
        {fieldError('description')}
      </label>
      <label className="block">
        Condições de armazenamento
        <textarea name="storageConditions" maxLength={500} className={control} required />
        {fieldError('storageConditions')}
      </label>
      <label className="block">
        <input type="checkbox" name="fitForConsumption" className="mr-2" required />
        Confirmo que o alimento está adequado para consumo e assumo a responsabilidade pela higiene e pela veracidade das informações.
        {fieldError('fitForConsumption')}
      </label>
      <button type="submit" disabled={submitting}
        className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60">
        {submitting ? 'Publicando…' : 'Publicar lote'}
      </button>
    </form>
  );
}
