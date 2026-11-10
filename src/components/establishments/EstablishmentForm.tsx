'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Crosshair, Loader2, MapPin } from 'lucide-react';
import type { EstablishmentEntity } from '@/types/establishment';
import { createEstablishmentSchema, updateEstablishmentSchema } from '@/schemas/establishment.schema';
import { formatCnpj, formatPhone, formatZipCode } from '@/lib/input-masks';

const initialValues = {
  name: '', cnpj: '', email: '', phone: '', zipCode: '', street: '', number: '', complement: '',
  neighborhood: '', city: '', state: '', latitude: '', longitude: '',
};

type FormValues = typeof initialValues;

export function EstablishmentForm({ establishment }: { establishment?: EstablishmentEntity }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => establishment ? {
    name: establishment.name,
    email: establishment.email,
    street: establishment.street,
    number: establishment.number,
    neighborhood: establishment.neighborhood,
    city: establishment.city,
    state: establishment.state,
    cnpj: formatCnpj(establishment.cnpj),
    phone: formatPhone(establishment.phone),
    zipCode: formatZipCode(establishment.zipCode),
    complement: establishment.complement ?? '',
    latitude: String(establishment.latitude ?? ''),
    longitude: String(establishment.longitude ?? ''),
  } : initialValues);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [showMapAttribution, setShowMapAttribution] = useState(false);

  const update = (field: keyof FormValues, value: string) => {
    const formattedValue = field === 'cnpj'
      ? formatCnpj(value)
      : field === 'phone'
        ? formatPhone(value)
        : field === 'zipCode'
          ? formatZipCode(value)
          : value;
    setValues((current) => ({ ...current, [field]: formattedValue }));
    setErrors((current) => ({ ...current, [field]: [] }));
    setBanner(null);
  };

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setBanner('Seu navegador não oferece suporte à localização geográfica.');
      return;
    }

    setIsLocating(true);
    setBanner(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const latitude = coords.latitude.toFixed(6);
        const longitude = coords.longitude.toFixed(6);
        setValues((current) => ({ ...current, latitude, longitude }));
        setErrors((current) => ({ ...current, latitude: [], longitude: [] }));
        setLocationStatus('Coordenadas obtidas. Buscando endereço...');

        try {
          const response = await fetch(`/api/geocoding/reverse?lat=${latitude}&lng=${longitude}`);
          const body = await response.json();
          if (!response.ok) throw new Error(body.error?.message);
          const address = body.data ?? {};
          setValues((current) => ({
            ...current,
            zipCode: address.zipCode ? formatZipCode(address.zipCode) : current.zipCode,
            street: address.street || current.street,
            number: address.number || current.number,
            neighborhood: address.neighborhood || current.neighborhood,
            city: address.city || current.city,
            state: address.state || current.state,
            latitude,
            longitude,
          }));
          setErrors((current) => ({
            ...current,
            zipCode: [], street: [], number: [], neighborhood: [], city: [], state: [],
            latitude: [], longitude: [],
          }));
          setLocationStatus('Localização e endereço preenchidos. Confira os dados antes de enviar.');
          setShowMapAttribution(true);
        } catch {
          setBanner('As coordenadas foram preenchidas, mas o endereço não pôde ser localizado automaticamente.');
          setLocationStatus(null);
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setBanner('Não foi possível obter sua localização. Autorize o acesso ou informe as coordenadas.');
        setLocationStatus(null);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const { cnpj, ...editableValues } = values;
    const result = establishment
      ? updateEstablishmentSchema.safeParse(editableValues)
      : createEstablishmentSchema.safeParse({ cnpj, ...editableValues });
    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(establishment ? `/establishments/${establishment.id}` : '/establishments', {
        method: establishment ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result.data),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.error?.details ?? {});
        setBanner(body.error?.message ?? 'Não foi possível salvar o estabelecimento.');
        return;
      }
      router.push('/painel/doador');
      router.refresh();
    } catch {
      setBanner('Falha de comunicação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const input = (field: keyof FormValues, label: string, options?: {
    type?: string;
    placeholder?: string;
    step?: string;
    inputMode?: 'text' | 'numeric' | 'email';
    maxLength?: number;
  }) => (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        aria-label={label}
        type={options?.type ?? 'text'}
        value={values[field]}
        readOnly={field === 'cnpj' && Boolean(establishment)}
        onChange={(event) => update(field, event.target.value)}
        placeholder={options?.placeholder}
        step={options?.step}
        inputMode={options?.inputMode}
        maxLength={options?.maxLength}
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
      {errors[field]?.[0] && <span className="mt-1 block text-xs text-red-600">{errors[field][0]}</span>}
    </label>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-7" noValidate>
      {banner && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{banner}</div>}

      <section>
        <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Building2 className="h-5 w-5 text-emerald-600" />Dados do estabelecimento</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{input('name', 'Nome do estabelecimento')}</div>
          {input('cnpj', 'CNPJ', { placeholder: '11.222.333/0001-81', inputMode: 'numeric', maxLength: 18 })}
          {input('phone', 'Telefone', { placeholder: '(34) 99999-0000', inputMode: 'numeric', maxLength: 15 })}
          {input('email', 'E-mail', { type: 'email' })}
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-semibold text-slate-900"><MapPin className="h-5 w-5 text-emerald-600" />Endereço e localização</h2>
        <p className="mt-1 text-xs text-slate-500">A localização é obrigatória para permitir buscas por proximidade.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">{input('zipCode', 'CEP', { placeholder: '38400-000', inputMode: 'numeric', maxLength: 9 })}</div>
          <div className="sm:col-span-4">{input('street', 'Logradouro')}</div>
          <div className="sm:col-span-2">{input('number', 'Número')}</div>
          <div className="sm:col-span-4">{input('complement', 'Complemento (opcional)')}</div>
          <div className="sm:col-span-3">{input('neighborhood', 'Bairro')}</div>
          <div className="sm:col-span-2">{input('city', 'Cidade')}</div>
          <div>{input('state', 'UF')}</div>
          <div className="sm:col-span-3">{input('latitude', 'Latitude', { type: 'number', step: 'any' })}</div>
          <div className="sm:col-span-3">{input('longitude', 'Longitude', { type: 'number', step: 'any' })}</div>
          <div className="sm:col-span-6">
            <button type="button" onClick={useCurrentLocation} disabled={isLocating} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
              {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              {isLocating ? 'Obtendo localização...' : 'Usar minha localização atual'}
            </button>
            {locationStatus && <p role="status" className="mt-2 text-xs font-medium text-emerald-700">{locationStatus}</p>}
            {showMapAttribution && (
              <p className="mt-1 text-xs text-slate-500">
                Endereço obtido com dados de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a>.
              </p>
            )}
          </div>
        </div>
      </section>

      <button type="submit" disabled={isSubmitting || isLocating} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSubmitting ? 'Enviando...' : establishment ? 'Salvar alterações' : 'Cadastrar estabelecimento'}
      </button>
    </form>
  );
}
