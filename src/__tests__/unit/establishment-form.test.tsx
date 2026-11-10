import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstablishmentForm } from '@/components/establishments/EstablishmentForm';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

describe('EstablishmentForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    refresh.mockReset();
  });

  it('envia um cadastro válido e retorna ao painel', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
    render(<EstablishmentForm />);

    const values: Record<string, string> = {
      'Nome do estabelecimento': 'Padaria Pão Quente', CNPJ: '11.222.333/0001-81',
      Telefone: '(34) 99999-0000', 'E-mail': 'contato@padaria.com.br', CEP: '38400-100',
      Logradouro: 'Avenida Brasil', Número: '1200', Bairro: 'Centro', Cidade: 'Uberlândia', UF: 'MG',
      Latitude: '-18.9186', Longitude: '-48.2772',
    };
    Object.entries(values).forEach(([label, value]) => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
    expect(screen.getByLabelText('CNPJ')).toHaveValue('11.222.333/0001-81');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(34) 99999-0000');
    expect(screen.getByLabelText('CEP')).toHaveValue('38400-100');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar estabelecimento' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/painel/doador');
    expect(refresh).toHaveBeenCalled();
  });

  it('preenche coordenadas e endereço usando a localização atual', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => success({
          coords: { latitude: -18.9186, longitude: -48.2772 },
        } as GeolocationPosition),
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {
        zipCode: '38414-376', street: 'Rua Gamaliel José dos Santos', number: '144',
        neighborhood: 'Luizote de Freitas', city: 'Uberlândia', state: 'MG',
      } }),
    } as Response);

    render(<EstablishmentForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização atual' }));

    await waitFor(() => expect(screen.getByLabelText('CEP')).toHaveValue('38414-376'));
    expect(screen.getByLabelText('Logradouro')).toHaveValue('Rua Gamaliel José dos Santos');
    expect(screen.getByLabelText('Número')).toHaveValue('144');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Luizote de Freitas');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Uberlândia');
    expect(screen.getByLabelText('UF')).toHaveValue('MG');
    expect(screen.getByLabelText('Latitude')).toHaveValue(-18.9186);
    expect(screen.getByLabelText('Longitude')).toHaveValue(-48.2772);
  });

  it('mostra validação antes de chamar a API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<EstablishmentForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar estabelecimento' }));
    expect(await screen.findByText('O nome do estabelecimento é obrigatório.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
