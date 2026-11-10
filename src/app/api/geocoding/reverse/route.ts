import { NextRequest, NextResponse } from 'next/server';

type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  residential?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  municipality?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
  'ISO3166-2-lvl4'?: string;
};

const BRAZILIAN_STATE_CODES: Record<string, string> = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE',
  'Distrito Federal': 'DF', 'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG', Pará: 'PA',
  Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI', 'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO', Roraima: 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
};

function stateCode(address: NominatimAddress): string {
  const isoCode = address['ISO3166-2-lvl4'];
  if (isoCode?.includes('-')) return isoCode.split('-').pop()?.toUpperCase() ?? '';
  return address.state ? BRAZILIAN_STATE_CODES[address.state] ?? '' : '';
}
export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get('lat'));
  const longitude = Number(request.nextUrl.searchParams.get('lng'));

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_COORDINATES', message: 'Coordenadas geográficas inválidas.' } },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org';
  const url = new URL('/reverse', baseUrl);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('layer', 'address');

  const contact = process.env.NOMINATIM_CONTACT_EMAIL;
  const userAgent = contact ? `Reaproveita/0.1 (${contact})` : 'Reaproveita/0.1';

  try {
    const response = await fetch(url, {
      headers: { 'accept-language': 'pt-BR,pt;q=0.9', 'user-agent': userAgent },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Reverse geocoding failed with status ${response.status}`);

    const result = (await response.json()) as { address?: NominatimAddress };
    const address = result.address ?? {};
    return NextResponse.json({
      success: true,
      data: {
        zipCode: address.postcode ?? '',
        street: address.road ?? address.pedestrian ?? address.residential ?? '',
        number: address.house_number ?? '',
        neighborhood: address.suburb ?? address.neighbourhood ?? address.quarter ?? address.city_district ?? '',
        city: address.city ?? address.municipality ?? address.town ?? address.village ?? '',
        state: stateCode(address),
      },
      attribution: '© OpenStreetMap contributors',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'REVERSE_GEOCODING_UNAVAILABLE', message: 'Não foi possível localizar o endereço destas coordenadas.' } },
      { status: 502 }
    );
  }
}
