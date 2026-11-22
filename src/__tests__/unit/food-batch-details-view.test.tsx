import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FoodBatchDetailsView } from '@/components/food-batches/FoodBatchDetailsView';
import type { FoodBatchDetails } from '@/services/food-batch.service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => vi.unstubAllGlobals());
function makeDetails(overrides: Partial<FoodBatchDetails> = {}): FoodBatchDetails {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    establishmentId: '22222222-2222-4222-8222-222222222222',
    publishedBy: '33333333-3333-4333-8333-333333333333',
    publishedAt: '2026-11-16T10:00:00.000Z',
    name: 'Pães Artesanais do Dia',
    category: 'Padaria',
    description: 'Cesta com pães franceses, baguetes e pães integrais produzidos hoje.',
    availableQuantity: 12,
    expiresAt: '2026-11-16T22:00:00.000Z',
    pickupStartsAt: '2026-11-16T18:00:00.000Z',
    pickupEndsAt: '2026-11-16T21:00:00.000Z',
    storageConditions: 'Manter em local seco e arejado',
    fitForConsumption: true,
    status: 'ACTIVE',
    revision: 0,
    establishment: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Padaria Bom Trigo',
      phone: '34999990000',
      email: 'contato@bomtrigo.com',
      zipCode: '38400100',
      street: 'Rua Floriano Peixoto',
      number: '120',
      complement: 'Esquina',
      neighborhood: 'Centro',
      city: 'Uberlândia',
      state: 'MG',
      latitude: -18.9186,
      longitude: -48.2772,
    },
    urgency: {
      level: 'HIGH',
      label: 'Alta urgência',
      hoursRemaining: 4,
    },
    isExpired: false,
    reservable: true,
    unavailableReason: null,
    ...overrides,
  };
}

describe('FoodBatchDetailsView', () => {
  it('exibe todas as informações do lote, estabelecimento, urgência e controles de reserva quando ativo', () => {
    render(<FoodBatchDetailsView details={makeDetails()} />);

    expect(screen.getByRole('heading', { name: 'Pães Artesanais do Dia' })).toBeInTheDocument();
    expect(
      screen.getByText('Cesta com pães franceses, baguetes e pães integrais produzidos hoje.')
    ).toBeInTheDocument();
    expect(screen.getByText('12 unidade(s)')).toBeInTheDocument();
    expect(screen.getByText('Manter em local seco e arejado')).toBeInTheDocument();

    expect(screen.getByText('Validade do alimento')).toBeInTheDocument();
    expect(screen.getByText('Janela de retirada')).toBeInTheDocument();

    expect(screen.getByText('Padaria Bom Trigo')).toBeInTheDocument();
    expect(screen.getByText(/Rua Floriano Peixoto, 120, Esquina/)).toBeInTheDocument();
    expect(screen.getByText('34999990000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver localização no mapa/i })).toBeInTheDocument();

    const urgency = screen.getByTestId('urgency-indicator');
    expect(urgency).toHaveAttribute('data-urgency-level', 'HIGH');
    expect(urgency).toHaveTextContent('Alta urgência');

    expect(screen.getByLabelText('Quantidade para reserva')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reservar lote' })).toBeEnabled();
  });

  it('não disponibiliza reserva quando o lote está expirado', () => {
    render(
      <FoodBatchDetailsView
        details={makeDetails({
          isExpired: true,
          reservable: false,
          unavailableReason: 'EXPIRED',
          urgency: { level: 'EXPIRED', label: 'Expirado', hoursRemaining: 0 },
        })}
      />
    );

    expect(screen.queryByRole('button', { name: 'Reservar lote' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantidade para reserva')).not.toBeInTheDocument();
    expect(screen.getByTestId('reservation-unavailable')).toHaveTextContent(
      'Reservas indisponíveis — Lote expirado'
    );
  });

  it('não disponibiliza reserva quando o lote está inativo', () => {
    render(
      <FoodBatchDetailsView
        details={makeDetails({
          status: 'INACTIVE',
          reservable: false,
          unavailableReason: 'INACTIVE',
        })}
      />
    );

    expect(screen.queryByRole('button', { name: 'Reservar lote' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantidade para reserva')).not.toBeInTheDocument();
    expect(screen.getByTestId('reservation-unavailable')).toHaveTextContent(
      'Reservas indisponíveis — Lote inativo'
    );
  });
});

it('pede confirmação antes de reservar e mostra sucesso no popup', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 201,
    json: async () => ({ success: true, data: { id: 'reserva-confirmada', quantity: 2 } }),
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<FoodBatchDetailsView details={makeDetails()} />);
  fireEvent.change(screen.getByLabelText('Quantidade para reserva'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reservar lote' }));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Confirmar reserva' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
  expect(await screen.findByText('Reserva de 2 unidade(s) realizada com sucesso.')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Reserva confirmada' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/receiver/reservations', expect.objectContaining({
    method: 'POST',
    body: expect.stringContaining('"quantity":2'),
  }));
  expect(screen.getByRole('link', { name: 'Ver minhas reservas' })).toHaveAttribute('href', '/painel/receptor');
});

it('permite cancelar a confirmação sem enviar uma reserva', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<FoodBatchDetailsView details={makeDetails()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reservar lote' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
