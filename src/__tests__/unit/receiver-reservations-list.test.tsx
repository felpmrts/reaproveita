import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ReceiverReservationsList,
  type ReceiverReservationItem,
} from '@/components/reservations/ReceiverReservationsList';

const refreshMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: pushMock,
  }),
}));

beforeEach(() => {
  refreshMock.mockReset();
  pushMock.mockReset();
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

function makeReservation(
  overrides: Partial<ReceiverReservationItem> = {}
): ReceiverReservationItem {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    batchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    batchTitle: 'Cesta de Pães Artesanais',
    quantity: 3,
    status: 'ACTIVE',
    createdAt: '2026-11-22T12:00:00.000Z',
    ...overrides,
  };
}

describe('ST16 (SCRUM-91) — ReceiverReservationsList', () => {
  it('exibe o botão "Cancelar reserva" apenas para reservas ativas (oculta em concluídas e canceladas)', () => {
    render(
      <ReceiverReservationsList
        initialReservations={[
          makeReservation({ id: 'res-active', batchTitle: 'Lote Ativo', status: 'ACTIVE' }),
          makeReservation({ id: 'res-completed', batchTitle: 'Lote Retirado', status: 'COMPLETED' }),
          makeReservation({ id: 'res-cancelled', batchTitle: 'Lote Cancelado', status: 'CANCELLED' }),
        ]}
      />
    );

    const cancelButtons = screen.getAllByRole('button', { name: 'Cancelar reserva' });
    expect(cancelButtons).toHaveLength(1);
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('abre confirmação, cancela a reserva via PATCH, atualiza o status visual e chama router.refresh()', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Reserva cancelada com sucesso. A quantidade foi restituída ao lote.',
        data: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'CANCELLED',
          cancelledAt: '2026-11-22T12:15:00.000Z',
          cancellationReason: 'Não conseguirei buscar hoje',
          restoredToBatch: true,
          restoredQuantity: 3,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReceiverReservationsList initialReservations={[makeReservation()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Cancelar reserva' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Motivo do cancelamento (opcional)'), {
      target: { value: 'Não conseguirei buscar hoje' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(
      await screen.findByRole('status')
    ).toHaveTextContent(
      'Reserva cancelada com sucesso. A quantidade foi restituída ao lote.'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/receiver/reservations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'CANCELLED',
          reason: 'Não conseguirei buscar hoje',
        }),
      })
    );

    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancelar reserva' })
    ).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('fecha o diálogo sem enviar requisição quando o usuário clica em "Manter reserva"', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<ReceiverReservationsList initialReservations={[makeReservation()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    expect(
      screen.getByRole('dialog', { name: 'Cancelar reserva' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manter reserva' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exibe alerta quando a API retorna conflito (ex.: reserva já concluída) sem alterar o status local', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        error: {
          code: 'RESERVATION_COMPLETED',
          message: 'Reservas já concluídas não podem ser canceladas.',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReceiverReservationsList initialReservations={[makeReservation()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reservas já concluídas não podem ser canceladas.'
    );
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('redireciona para /login quando a sessão expirou (401)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Autenticação obrigatória.' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReceiverReservationsList initialReservations={[makeReservation()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/login');
    });
  });

  it('exibe estado vazio quando não há reservas', () => {
    render(<ReceiverReservationsList initialReservations={[]} />);
    expect(
      screen.getByText('Você ainda não possui reservas vinculadas ao seu perfil.')
    ).toBeInTheDocument();
  });
});

it('exibe estabelecimento, endereço e datas e atualiza o status pelo endpoint', async () => {
  const reservation = makeReservation({
    establishment: { id: 'est', name: 'Padaria da Praça', address: 'Avenida Brasil, 10 · Centro' },
    pickupStartsAt: '2026-11-22T12:00:00Z', pickupEndsAt: '2026-11-22T18:00:00Z',
  });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ success: true, data: [{ ...reservation, status: 'COMPLETED' }] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<ReceiverReservationsList initialReservations={[reservation]} />);
  expect(screen.getByText('Padaria da Praça')).toBeInTheDocument();
  expect(screen.getByText(/Avenida Brasil, 10/)).toBeInTheDocument();
  expect(screen.getByText('22/11/2026, 09:00 até 22/11/2026, 15:00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar reservas' }));
  expect(await screen.findByText('Concluída')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/receiver/reservations', expect.objectContaining({ cache: 'no-store' }));
});
