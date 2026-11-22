import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DonorReservationsPanel } from '@/components/reservations/DonorReservationsPanel';
import type {
  DonorReservationDetails,
  DonorReservationItem,
  DonorReservationsResult,
} from '@/services/reservation.service';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeItem(overrides: Partial<DonorReservationItem> = {}): DonorReservationItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    batchId: '22222222-2222-4222-8222-222222222222',
    batchTitle: 'Pães Artesanais do Dia',
    batchCategory: 'Padaria',
    batchStatus: 'ACTIVE',
    establishmentId: '33333333-3333-4333-8333-333333333333',
    establishmentName: 'Padaria Bom Trigo',
    quantity: 4,
    status: 'ACTIVE',
    pickupStartsAt: '2026-11-22T18:00:00.000Z',
    pickupEndsAt: '2026-11-22T20:00:00.000Z',
    expiresAt: '2026-11-22T22:00:00.000Z',
    createdAt: '2026-11-22T12:00:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
    completedAt: null,
    completedBy: null,
    completedByName: null,
    receiver: {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Maria Clara',
      phone: '34999991111',
    },
    ...overrides,
  };
}

function makeInitialData(items: DonorReservationItem[]): DonorReservationsResult {
  const establishmentsMap = new Map<string, string>();
  for (const item of items) {
    establishmentsMap.set(item.establishmentId, item.establishmentName);
  }

  return {
    items,
    summary: {
      total: items.length,
      active: items.filter((i) => i.status === 'ACTIVE').length,
      completed: items.filter((i) => i.status === 'COMPLETED').length,
      cancelled: items.filter((i) => i.status === 'CANCELLED').length,
      activeUnits: items
        .filter((i) => i.status === 'ACTIVE')
        .reduce((sum, i) => sum + i.quantity, 0),
      rescuedUnits: items
        .filter((i) => i.status === 'COMPLETED')
        .reduce((sum, i) => sum + i.quantity, 0),
    },
    establishments: Array.from(establishmentsMap.entries()).map(([id, name]) => ({
      id,
      name,
    })),
    updatedAt: '2026-11-22T13:00:00.000Z',
  };
}

describe('ST18 & ST19 (SCRUM-95 / SCRUM-97) — DonorReservationsPanel', () => {
  it('exibe identificação do receptor, quantidade reservada, horário previsto de retirada, status e indicador de alimentos resgatados', () => {
    const activeItem = makeItem();
    const completedItem = makeItem({
      id: '55555555-5555-4555-8555-555555555555',
      batchTitle: 'Cesta de Frutas',
      batchCategory: 'Hortifruti',
      quantity: 2,
      status: 'COMPLETED',
      completedAt: '2026-11-22T13:10:00.000Z',
      completedBy: 'donor-1',
      completedByName: 'Padaria Bom Trigo',
      receiver: {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Carlos Eduardo',
        phone: null,
      },
    });

    render(<DonorReservationsPanel initialData={makeInitialData([activeItem, completedItem])} />);

    expect(screen.getByText('Pães Artesanais do Dia')).toBeInTheDocument();
    expect(screen.getByText('Maria Clara')).toBeInTheDocument();
    expect(screen.getByText('ID: 44444444-4444-4444-8444-444444444444')).toBeInTheDocument();
    expect(screen.getByText('34999991111')).toBeInTheDocument();
    expect(screen.getByText('4 unidades')).toBeInTheDocument();
    expect(screen.getByText('4 unidades para separar')).toBeInTheDocument();
    expect(screen.getByTestId('rescued-food-indicator')).toHaveTextContent('2 unidades');
    expect(screen.getByTestId('rescued-food-indicator')).toHaveTextContent(
      '1 retirada confirmada'
    );
    expect(screen.getAllByText('Horário previsto para retirada')).toHaveLength(2);
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeInTheDocument();

    // Botão "Confirmar Retirada" aparece apenas para reserva ACTIVE
    expect(screen.getAllByRole('button', { name: 'Confirmar Retirada' })).toHaveLength(1);
  });

  it('filtra reservas por status, estabelecimento e busca textual', () => {
    const itemA = makeItem({
      id: 'res-a',
      batchTitle: 'Pães da Matriz',
      establishmentId: 'est-a',
      establishmentName: 'Padaria Matriz',
      status: 'ACTIVE',
      receiver: { id: 'rec-a', name: 'Ana Paula', phone: null },
    });
    const itemB = makeItem({
      id: 'res-b',
      batchTitle: 'Bolo da Filial',
      establishmentId: 'est-b',
      establishmentName: 'Padaria Filial',
      status: 'CANCELLED',
      receiver: { id: 'rec-b', name: 'Bruno Silva', phone: null },
    });

    render(<DonorReservationsPanel initialData={makeInitialData([itemA, itemB])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Canceladas (1)' }));
    expect(screen.queryByText('Pães da Matriz')).not.toBeInTheDocument();
    expect(screen.getByText('Bolo da Filial')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Todas (2)' }));
    fireEvent.change(screen.getByLabelText('Estabelecimento'), {
      target: { value: 'est-a' },
    });
    expect(screen.getByText('Pães da Matriz')).toBeInTheDocument();
    expect(screen.queryByText('Bolo da Filial')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Estabelecimento'), {
      target: { value: 'ALL' },
    });
    fireEvent.change(screen.getByLabelText('Buscar por receptor, lote ou código'), {
      target: { value: 'bruno' },
    });
    expect(screen.getByText('Bolo da Filial')).toBeInTheDocument();
    expect(screen.queryByText('Pães da Matriz')).not.toBeInTheDocument();
  });

  it('confirma retirada presencial pelo botão "Confirmar Retirada", atualiza status, auditoria e indicador de alimentos resgatados', async () => {
    const item = makeItem({ quantity: 4 });
    const confirmedItem: DonorReservationItem = {
      ...item,
      status: 'COMPLETED',
      completedAt: '2026-11-22T13:20:00.000Z',
      completedBy: 'donor-1',
      completedByName: 'Padaria Bom Trigo',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message:
          'Retirada presencial confirmada com sucesso! Indicadores de alimentos resgatados atualizados.',
        data: {
          ...confirmedItem,
          historyEntryId: 'hist-completed-1',
          idempotentReplay: false,
          summary: {
            total: 1,
            active: 0,
            completed: 1,
            cancelled: 0,
            activeUnits: 0,
            rescuedUnits: 4,
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DonorReservationsPanel initialData={makeInitialData([item])} />);

    expect(screen.getByTestId('rescued-food-indicator')).toHaveTextContent('0 unidades');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Retirada' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Confirmar retirada presencial' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Retirada presencial confirmada com sucesso!'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/donor/reservations/${item.id}/confirm-pickup`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(screen.getByTestId('rescued-food-indicator')).toHaveTextContent('4 unidades');
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirmar Retirada' })
    ).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('permite confirmar retirada digitando o código da reserva no campo dedicado e exibe erro em duplicidade (409)', async () => {
    const item = makeItem({ quantity: 3 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'Retirada presencial confirmada com sucesso!',
          data: {
            ...item,
            status: 'COMPLETED',
            completedAt: '2026-11-22T13:25:00.000Z',
            completedBy: 'donor-1',
            completedByName: 'Padaria Bom Trigo',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'RESERVATION_ALREADY_COMPLETED',
            message: 'A retirada desta reserva já foi confirmada anteriormente.',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<DonorReservationsPanel initialData={makeInitialData([item])} />);

    const codeField = screen.getByLabelText(
      'Confirmar retirada presencial por código da reserva'
    );
    fireEvent.change(codeField, { target: { value: item.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar por código' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Retirada presencial confirmada com sucesso!'
    );
    expect(screen.getByTestId('rescued-food-indicator')).toHaveTextContent('3 unidades');

    // Segunda tentativa com o mesmo código recebe 409
    fireEvent.change(codeField, { target: { value: item.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar por código' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A retirada desta reserva já foi confirmada anteriormente.'
    );
  });

  it('permite consultar o status detalhado e histórico de uma reserva via API', async () => {
    const item = makeItem();
    const detailsResponse: DonorReservationDetails = {
      ...item,
      status: 'CANCELLED',
      cancelledAt: '2026-11-22T12:30:00.000Z',
      cancellationReason: 'Receptor não pôde comparecer',
      history: [
        {
          id: 'hist-1',
          reservationId: item.id,
          batchId: item.batchId,
          actorId: item.receiver.id,
          action: 'CANCELLED',
          previousStatus: 'ACTIVE',
          newStatus: 'CANCELLED',
          quantity: item.quantity,
          restoredToBatch: true,
          restoredQuantity: item.quantity,
          reason: 'Receptor não pôde comparecer',
          occurredAt: '2026-11-22T12:30:00.000Z',
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: detailsResponse }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DonorReservationsPanel initialData={makeInitialData([item])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Consultar status' }));

    expect(
      await screen.findByText('Receptor não pôde comparecer')
    ).toBeInTheDocument();
    expect(screen.getByText('Reserva cancelada')).toBeInTheDocument();
    expect(
      screen.getByText('4 unidade(s) restituída(s) ao lote.')
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/donor/reservations/${item.id}`,
      expect.objectContaining({ cache: 'no-store' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('atualiza a lista de reservas recebidas via GET /api/donor/reservations', async () => {
    const initial = makeInitialData([]);
    const refreshedItem = makeItem({ batchTitle: 'Lote Recém Reservado' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: makeInitialData([refreshedItem]) }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DonorReservationsPanel initialData={initial} />);
    expect(
      screen.getByText('Nenhuma reserva recebida até o momento.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(await screen.findByText('Lote Recém Reservado')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/donor/reservations',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
