import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FoodBatchCatalog } from '@/components/food-batches/FoodBatchCatalog';
import type { FoodBatchCatalogItem } from '@/services/food-batch.service';

function makeOffer(overrides: Partial<FoodBatchCatalogItem> = {}): FoodBatchCatalogItem {
  const future = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

  return {
    id: '11111111-1111-4111-8111-111111111111',
    establishmentId: '22222222-2222-4222-8222-222222222222',
    name: 'Pães Artesanais',
    category: 'Pães e produtos de padaria',
    description: 'Cesta com baguetes e pães integrais fresquinhos.',
    availableQuantity: 7,
    expiresAt: future(5),
    pickupStartsAt: future(0.5),
    pickupEndsAt: future(4),
    publishedAt: new Date(Date.now() - 1800000).toISOString(),
    status: 'ACTIVE',
    revision: 0,
    establishment: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Padaria Bom Trigo',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
    },
    urgency: {
      level: 'HIGH',
      label: 'Alta urgência',
      hoursRemaining: 4,
    },
    reservable: true,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FoodBatchCatalog', () => {
  it('apresenta informações resumidas dos lotes e links para os detalhes de cada oferta', () => {
    const first = makeOffer();
    const second = makeOffer({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Marmita Vegetariana',
      category: 'Refeições prontas',
      description: 'Porção individual preparada hoje.',
      availableQuantity: 1,
      urgency: { level: 'CRITICAL', label: 'Urgência máxima', hoursRemaining: 1 },
      establishment: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Restaurante Sabor Verde',
        neighborhood: 'Santa Mônica',
        city: 'Uberlândia',
        state: 'MG',
      },
    });

    render(
      <FoodBatchCatalog
        initialOffers={[first, second]}
        initialUpdatedAt="2026-11-19T15:00:00.000Z"
        refreshIntervalMs={0}
      />
    );

    expect(screen.getByText('2 ofertas disponíveis')).toBeInTheDocument();

    const firstCard = screen.getByTestId(`offer-card-${first.id}`);
    expect(within(firstCard).getByRole('heading', { name: 'Pães Artesanais' })).toBeInTheDocument();
    expect(within(firstCard).getByText('Pães e produtos de padaria')).toBeInTheDocument();
    expect(within(firstCard).getByText('7 unidades')).toBeInTheDocument();
    expect(within(firstCard).getByText('Padaria Bom Trigo')).toBeInTheDocument();
    expect(within(firstCard).getByText('Centro, Uberlândia/MG')).toBeInTheDocument();
    expect(within(firstCard).getByTestId('urgency-indicator')).toHaveAttribute(
      'data-urgency-level',
      'HIGH'
    );
    expect(within(firstCard).getByRole('link', { name: /Ver detalhes/i })).toHaveAttribute(
      'href',
      `/lotes/${first.id}`
    );

    const secondCard = screen.getByTestId(`offer-card-${second.id}`);
    expect(within(secondCard).getByText('1 unidade')).toBeInTheDocument();
    expect(within(secondCard).getByRole('link', { name: /Ver detalhes/i })).toHaveAttribute(
      'href',
      `/lotes/${second.id}`
    );
  });

  it('exibe estado vazio quando não há ofertas ativas', () => {
    render(
      <FoodBatchCatalog
        initialOffers={[]}
        initialUpdatedAt="2026-11-19T15:00:00.000Z"
        refreshIntervalMs={0}
      />
    );

    expect(screen.getByText('0 ofertas disponíveis')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Nenhuma oferta disponível no momento' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Atualizar ofertas' }).length).toBeGreaterThan(0);
  });

  it('atualiza a disponibilidade manualmente buscando GET /food-batches sem cache', async () => {
    const initial = makeOffer({ availableQuantity: 9 });
    const added = makeOffer({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: 'Sucos Naturais',
      availableQuantity: 2,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: [makeOffer({ availableQuantity: 4 }), added],
          meta: { total: 2, updatedAt: '2026-11-19T15:05:00.000Z' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    render(
      <FoodBatchCatalog
        initialOffers={[initial]}
        initialUpdatedAt="2026-11-19T15:00:00.000Z"
        refreshIntervalMs={0}
      />
    );

    expect(screen.getByText('1 oferta disponível')).toBeInTheDocument();
    expect(screen.getByText('9 unidades')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar ofertas' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/food-batches', { cache: 'no-store' });
      expect(screen.getByText('2 ofertas disponíveis')).toBeInTheDocument();
    });

    expect(screen.getByText('4 unidades')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sucos Naturais' })).toBeInTheDocument();
    expect(screen.queryByText('9 unidades')).not.toBeInTheDocument();
  });

  it('atualiza automaticamente por polling e ao retornar visibilidade da aba', async () => {
    vi.useFakeTimers();

    const first = makeOffer({ availableQuantity: 6 });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [makeOffer({ availableQuantity: 3 })],
            meta: { total: 1, updatedAt: new Date().toISOString() },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [],
            meta: { total: 0, updatedAt: new Date().toISOString() },
          }),
          { status: 200 }
        )
      );

    render(
      <FoodBatchCatalog
        initialOffers={[first]}
        initialUpdatedAt={new Date().toISOString()}
        refreshIntervalMs={10_000}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3 unidades')).toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('0 ofertas disponíveis')).toBeInTheDocument();
  });

  it('remove oferta localmente quando o prazo expira e ressincroniza com o servidor', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-11-19T15:00:00.000Z');
    vi.setSystemTime(now);

    const expiringOffer = makeOffer({
      expiresAt: new Date(now.getTime() + 5_000).toISOString(),
      pickupStartsAt: new Date(now.getTime() - 60_000).toISOString(),
      pickupEndsAt: new Date(now.getTime() + 5_000).toISOString(),
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: [],
          meta: { total: 0, updatedAt: new Date(now.getTime() + 5_000).toISOString() },
        }),
        { status: 200 }
      )
    );

    render(
      <FoodBatchCatalog
        initialOffers={[expiringOffer]}
        initialUpdatedAt={now.toISOString()}
        refreshIntervalMs={0}
      />
    );

    expect(screen.getByTestId(`offer-card-${expiringOffer.id}`)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(`offer-card-${expiringOffer.id}`)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Nenhuma oferta disponível no momento' })
    ).toBeInTheDocument();
  });

  it('preserva ofertas visíveis e exibe alerta em falha de atualização, recuperando ao tentar novamente', async () => {
    const offer = makeOffer({ availableQuantity: 5 });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { message: 'Serviço temporariamente indisponível.' },
          }),
          { status: 500 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [makeOffer({ availableQuantity: 2 })],
            meta: { total: 1, updatedAt: '2026-11-19T15:10:00.000Z' },
          }),
          { status: 200 }
        )
      );

    render(
      <FoodBatchCatalog
        initialOffers={[offer]}
        initialUpdatedAt="2026-11-19T15:00:00.000Z"
        refreshIntervalMs={0}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar ofertas' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Serviço temporariamente indisponível.');
    });

    // Mantém oferta anterior visível durante erro transitório
    expect(screen.getByTestId(`offer-card-${offer.id}`)).toBeInTheDocument();
    expect(screen.getByText('5 unidades')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('2 unidades')).toBeInTheDocument();
    });
  });
});
