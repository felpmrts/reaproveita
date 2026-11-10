import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/geocoding/reverse/route';

describe('GET /api/geocoding/reverse', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejeita coordenadas inválidas sem chamar o provedor', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await GET(new NextRequest('http://localhost/api/geocoding/reverse?lat=999&lng=-48'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normaliza o endereço retornado pelo OpenStreetMap', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ address: {
        postcode: '38414-376', road: 'Rua Gamaliel José dos Santos', house_number: '144',
        suburb: 'Luizote de Freitas', city: 'Uberlândia', state: 'Minas Gerais',
        'ISO3166-2-lvl4': 'BR-MG',
      } }),
    } as Response);
    const response = await GET(new NextRequest('http://localhost/api/geocoding/reverse?lat=-18.9&lng=-48.3'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      zipCode: '38414-376', street: 'Rua Gamaliel José dos Santos', number: '144',
      neighborhood: 'Luizote de Freitas', city: 'Uberlândia', state: 'MG',
    });
  });
});
