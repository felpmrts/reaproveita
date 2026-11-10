'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { FoodBatch } from '@/repositories/food-batch.repository';
import type { ManageFoodBatchInput } from '@/schemas/food-batch.schema';

const statuses = {
  ACTIVE: { label: 'Ativa', style: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  INACTIVE: { label: 'Inativa', style: 'border-amber-200 bg-amber-50 text-amber-900' },
  CLOSED: { label: 'Encerrada', style: 'border-slate-200 bg-slate-100 text-slate-700' },
};
const badgeClass = 'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold';
const dateFormatter = new Intl.DateTimeFormat('pt-BR');
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2';

export function ManageFoodBatchForm({ offer }: { offer: FoodBatch }) {
  const [batch, setBatch] = useState(offer);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const expiresAt = Date.parse(batch.expiresAt);
  const expired = now !== null && expiresAt <= now;
  const status = statuses[batch.status];

  useEffect(() => {
    let timer: number | undefined;

    function refreshExpiry() {
      const currentTime = Date.now();
      setNow(currentTime);
      const remaining = expiresAt - currentTime;
      if (remaining > 0) timer = window.setTimeout(refreshExpiry, Math.min(remaining, 2147483647));
    }

    refreshExpiry();
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  function showDate(value: string) {
    return now === null ? '…' : dateFormatter.format(new Date(value));
  }

  async function update(change: Omit<ManageFoodBatchInput, 'revision'>) {
    setPending(true);
    setFeedback(undefined);
    try {
      const response = await fetch(`/food-batches/${batch.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...change, revision: batch.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Não foi possível atualizar a oferta.');
      setBatch(result.data);
      setEditing(false);
      setFeedback({ message: 'Oferta atualizada.', error: false });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Falha de comunicação.', error: true });
    } finally {
      setPending(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void update({
      name: String(form.get('name')),
      category: String(form.get('category')),
      description: String(form.get('description')),
      storageConditions: String(form.get('storageConditions')),
    });
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold text-slate-900">{batch.name}</h2>
          <p className="mt-0.5 break-words text-sm text-slate-600">{batch.category}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {expired && <span className={badgeClass + ' border-red-200 bg-red-50 text-red-800'}>Vencida</span>}
          {(!expired || batch.status !== 'ACTIVE') && (
            <span className={badgeClass + ' ' + status.style}>{status.label}</span>
          )}
        </div>
      </header>

      <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-600">Estoque</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {batch.availableQuantity} {batch.availableQuantity === 1 ? 'unidade' : 'unidades'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Validade</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{showDate(batch.expiresAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Período de retirada</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {showDate(batch.pickupStartsAt)} a {showDate(batch.pickupEndsAt)}
          </dd>
        </div>
      </dl>

      {!editing && (
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-slate-900">Descrição</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-600">{batch.description}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Condições de armazenamento</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-600">{batch.storageConditions}</dd>
          </div>
        </dl>
      )}
      {feedback && (
        <p role={feedback.error ? 'alert' : 'status'} className="mt-2 text-sm">{feedback.message}</p>
      )}
      {editing && batch.status !== 'CLOSED' && (
        <form onSubmit={save} className="mt-4 space-y-3 text-sm">
          <label className="block">Nome do alimento
            <input name="name" defaultValue={batch.name} required maxLength={120} className={inputClass} />
          </label>
          <label className="block">Categoria
            <input name="category" defaultValue={batch.category} required maxLength={80} className={inputClass} />
          </label>
          <label className="block">Descrição
            <textarea name="description" defaultValue={batch.description} required maxLength={2000} className={inputClass} />
          </label>
          <label className="block">Condições de armazenamento
            <textarea name="storageConditions" defaultValue={batch.storageConditions} required maxLength={500} className={inputClass} />
          </label>
          <button disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white disabled:opacity-60">
            Salvar alterações
          </button>
        </form>
      )}
      {batch.status !== 'CLOSED' && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
          <button type="button" disabled={pending} onClick={() => setEditing(!editing)} className="rounded-lg border px-3 py-2">
            {editing ? 'Cancelar edição' : 'Editar'}
          </button>
          {batch.status === 'ACTIVE' && (
            <button type="button" disabled={pending} onClick={() => void update({ status: 'INACTIVE' })} className="rounded-lg border px-3 py-2">
              Inativar
            </button>
          )}
          <button type="button" disabled={pending}
            onClick={() => { if (window.confirm('Encerrar esta oferta definitivamente?')) void update({ status: 'CLOSED' }); }}
            className="rounded-lg border border-red-200 px-3 py-2 text-red-700">
            Encerrar
          </button>
        </div>
      )}
    </article>
  );
}
