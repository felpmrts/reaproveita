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
    pickupStartsAt: future(-0.5),
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

function jsonResponse(data: FoodBatchCatalogItem[]) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      meta: { total: data.length, updatedAt: '2026-11-19T15:10:00.000Z' },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('FoodBatchSearchFilters & Limpar Filtros (ST11 / SCRUM-81 / SCRUM-82)', () => {
  it('pesquisa pelo nome do alimento ao enviar o formulário e via debounce', async () => {
    vi.useFakeTimers();

    const bread = makeOffer({ id: 'aaaa1111-1111-4111-8111-111111111111', name: 'Pão Integral' });
    const fruit = makeOffer({
      id: 'bbbb2222-2222-4222-8222-222222222222',
      name: 'Cesta de Maçãs',
      category: 'Frutas, verduras e legumes',
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse([bread]))
      .mockResolvedValueOnce(jsonResponse([fruit]));

    render(
      <FoodBatchCatalog
        initialOffers={[bread, fruit]}
        initialUpdatedAt="2026-11-19T15:00:00.000Z"
        refreshIntervalMs={0}
        searchDebounceMs={250}
      />
    );

    const searchInput = screen.getByLabelText('Pesquisar alimento');
    fireEvent.change(searchInput, { target: { value: 'pao' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/food-batches?search=pao', {
      cache: 'no-store',
    });
    expect(screen.getByText('1 oferta disponível')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pão Integral' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cesta de Maçãs' })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'maca' } });
    fireEvent.submit(screen.getByRole('search', { name: 'Pesquisar e filtrar ofertas' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/food-batches?search=maca', {
      cache: 'no-store',
    });
    expect(screen.getByRole('heading', { name: 'Cesta de Maçãs' })).toBeInTheDocument();
  });

  it('combina filtros de busca, categoria, validade, disponibilidade e quantidade mínima e mantém filtros ao atualizar', async () => {
    const bread = makeOffer({ id: 'aaaa1111-1111-4111-8111-111111111111', name: 'Pão Integral' });
    const other = makeOffer({
      id: 'bbbb2222-2222-4222-8222-222222222222',
      name: 'Iogurte Natural',
      category: 'Laticínios e ovos',
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse([bread, other]))
      .mockResolvedValueOnce(jsonResponse([bread]))
      .mockResolvedValueOnce(jsonResponse([bread]))
      .mockResolvedValueOnce(jsonResponse([bread]))
      .mockResolvedValueOnce(jsonResponse([bread]));

    render(
      <FoodBatchCatalog
        initialOffers={[bread, other]}
        initialUpdatedAt="2026-11-19T15:00:00.000Z"
        refreshIntervalMs={0}
        searchDebounceMs={0}
        syncUrl
      />
    );

    const searchButton = screen.getByRole('button', { name: 'Buscar' });

    fireEvent.change(screen.getByLabelText('Pesquisar alimento'), { target: { value: 'Pão' } });
    fireEvent.change(screen.getByLabelText('Categoria'), {
      target: { value: 'Pães e produtos de padaria' },
    });
    await waitFor(() => expect(searchButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Data de validade (até)'), {
      target: { value: '2026-11-20' },
    });
    await waitFor(() => expect(searchButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Disponibilidade'), {
      target: { value: 'PICKUP_NOW' },
    });
    await waitFor(() => expect(searchButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Quantidade mínima'), {
      target: { value: '3' },
    });
    fireEvent.click(searchButton);

    const expectedUrl =
      '/food-batches?search=P%C3%A3o&category=P%C3%A3es+e+produtos+de+padaria&expiresUntil=2026-11-20&availability=PICKUP_NOW&minQuantity=3';

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchMock).toHaveBeenLastCalledWith(expectedUrl, { cache: 'no-store' });
      expect(searchButton).toBeEnabled();
    });

    expect(window.location.search).toContain('search=P%C3%A3o');
    expect(window.location.search).toContain('availability=PICKUP_NOW');
    expect(window.location.search).toContain('minQuantity=3');

    const activeChips = screen.getByLabelText('Filtros aplicados');
    expect(within(activeChips).getByText('Busca: "Pão"')).toBeInTheDocument();
    expect(within(activeChips).getByText('Categoria: Pães e produtos de padaria')).toBeInTheDocument();
    expect(within(activeChips).getByText('Validade até: 20/11/2026')).toBeInTheDocument();
    expect(
      within(activeChips).getByText('Disponibilidade: Retirada imediata (agora)')
    ).toBeInTheDocument();
    expect(within(activeChips).getByText('Qtd. mínima: 3 un.')).toBeInTheDocument();

    // Atualizar ofertas preserva os filtros aplicados
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar ofertas' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(fetchMock).toHaveBeenLastCalledWith(expectedUrl, { cache: 'no-store' });
    });
  });

  it('permite limpar todos os filtros pela ação "Limpar filtros", remover chips individuais e recuperar do estado vazio filtrado', async () => {
    const bread = makeOffer({ id: 'aaaa1111-1111-4111-8111-111111111111', name: 'Pão Integral' });
    const fruit = makeOffer({
      id: 'bbbb2222-2222-4222-8222-222222222222',
      name: 'Cesta de Maçãs',
      category: 'Frutas, verduras e legumes',
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse([bread])) // 1: categoria
      .mockResolvedValueOnce(jsonResponse([])) // 2: busca combinada sem resultados
      .mockResolvedValueOnce(jsonResponse([bread, fruit])) // 3: limpar filtros e ver todas
      .mockResolvedValueOnce(jsonResponse([bread])) // 4: categoria após limpar
      .mockResolvedValueOnce(jsonResponse([bread])) // 5: disponibilidade
      .mockResolvedValueOnce(jsonResponse([bread])) // 6: remover chip de disponibilidade
      .mockResolvedValueOnce(jsonResponse([bread, fruit])); // 7: limpar filtros no topo

    render(
      <FoodBatchCatalog
        initialOffers={[bread, fruit]}
        initialUpdatedAt="2026-11-19T15:00:00.000Z"
        refreshIntervalMs={0}
        searchDebounceMs={0}
        syncUrl
      />
    );

    const clearButton = screen.getByRole('button', { name: 'Limpar filtros' });
    const searchButton = screen.getByRole('button', { name: 'Buscar' });
    expect(clearButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Categoria'), {
      target: { value: 'Pães e produtos de padaria' },
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(searchButton).toBeEnabled();
    });
    expect(clearButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Pesquisar alimento'), {
      target: { value: 'Item Inexistente' },
    });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole('heading', {
          name: 'Nenhuma oferta encontrada para os filtros aplicados',
        })
      ).toBeInTheDocument();
    });

    const clearEmptyButton = screen.getByRole('button', { name: 'Limpar filtros e ver todas' });
    await waitFor(() => expect(clearEmptyButton).toBeEnabled());

    // Ação de limpar no estado vazio filtrado restaura o catálogo completo
    fireEvent.click(clearEmptyButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenLastCalledWith('/food-batches', { cache: 'no-store' });
      expect(screen.getByText('2 ofertas disponíveis')).toBeInTheDocument();
      expect(searchButton).toBeEnabled();
    });

    expect(screen.getByLabelText('Pesquisar alimento')).toHaveValue('');
    expect(screen.getByLabelText('Categoria')).toHaveValue('');
    expect(screen.getByLabelText('Data de validade (até)')).toHaveValue('');
    expect(screen.getByLabelText('Disponibilidade')).toHaveValue('');
    expect(screen.getByLabelText('Quantidade mínima')).toHaveValue(null);
    expect(window.location.search).toBe('');
    expect(screen.queryByLabelText('Filtros aplicados')).not.toBeInTheDocument();
    expect(clearButton).toBeDisabled();

    // Aplica categoria + disponibilidade e remove chip individual de disponibilidade
    fireEvent.change(screen.getByLabelText('Categoria'), {
      target: { value: 'Pães e produtos de padaria' },
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(searchButton).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText('Disponibilidade'), {
      target: { value: 'PICKUP_NOW' },
    });
    const removeAvailabilityChip = await screen.findByRole('button', {
      name: 'Remover filtro de disponibilidade',
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(removeAvailabilityChip).toBeEnabled();
    });

    // Remoção do chip mantém categoria selecionada
    fireEvent.click(removeAvailabilityChip);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(6);
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/food-batches?category=P%C3%A3es+e+produtos+de+padaria',
        { cache: 'no-store' }
      );
      expect(clearButton).toBeEnabled();
    });

    // Botão principal "Limpar filtros" limpa o último filtro ativo
    fireEvent.click(clearButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(7);
      expect(fetchMock).toHaveBeenLastCalledWith('/food-batches', { cache: 'no-store' });
      expect(screen.getByText('2 ofertas disponíveis')).toBeInTheDocument();
    });
    expect(clearButton).toBeDisabled();
  });
});
