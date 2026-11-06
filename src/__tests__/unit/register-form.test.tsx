import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterForm } from '@/components/auth/RegisterForm';

describe('[QA/FE] Testes de Componente — Tela/Formulário de Cadastro (RegisterForm)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deve alternar visualmente entre os perfis Receptor (RECEIVER) e Doador (DONOR)', () => {
    render(<RegisterForm />);

    const receiverOption = screen.getByTestId('role-option-RECEIVER');
    const donorOption = screen.getByTestId('role-option-DONOR');
    const submitButton = screen.getByTestId('register-submit-button');

    expect(receiverOption).toHaveAttribute('aria-checked', 'true');
    expect(donorOption).toHaveAttribute('aria-checked', 'false');
    expect(submitButton).toHaveTextContent('Criar conta como Receptor');

    fireEvent.click(donorOption);

    expect(donorOption).toHaveAttribute('aria-checked', 'true');
    expect(receiverOption).toHaveAttribute('aria-checked', 'false');
    expect(submitButton).toHaveTextContent('Criar conta como Doador');
  });

  it('deve exibir erros de validação visualmente nos inputs quando submetido com dados inválidos', async () => {
    render(<RegisterForm />);

    const submitButton = screen.getByTestId('register-submit-button');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('register-error-banner')).toBeInTheDocument();
      expect(screen.getByText('O nome deve ter pelo menos 3 caracteres.')).toBeInTheDocument();
      expect(screen.getByText('O e-mail é obrigatório.')).toBeInTheDocument();
    });
  });

  it('deve exibir feedback visual de erro quando o servidor retornar 409 (e-mail já existente)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'Este e-mail já está cadastrado na plataforma.',
            details: {
              email: ['Este e-mail já está cadastrado na plataforma.'],
            },
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Maria da Silva' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'duplicado@reaproveita.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Senha/i), {
      target: { value: 'StrongPass@123' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar senha/i), {
      target: { value: 'StrongPass@123' },
    });

    fireEvent.click(screen.getByTestId('register-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('register-error-banner')).toHaveTextContent(
        'Este e-mail já está cadastrado na plataforma.'
      );
      expect(screen.getByLabelText(/E-mail/i)).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
