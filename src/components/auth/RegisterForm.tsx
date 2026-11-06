'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Store,
  HeartHandshake,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { formatZodErrors, registerFormSchema } from '@/schemas/auth.schema';
import { PublicUser, RegisterableRole, RegisterApiResponse } from '@/types/user';

interface RegisterFormProps {
  defaultRole?: RegisterableRole;
  onSuccess?: (user: PublicUser) => void;
}

const ROLE_OPTIONS: Array<{
  value: RegisterableRole;
  title: string;
  badge: string;
  description: string;
  nameLabel: string;
  namePlaceholder: string;
}> = [
  {
    value: 'RECEIVER',
    title: 'Quero Resgatar',
    badge: 'Receptor / Beneficiário',
    description:
      'Para pessoas físicas, famílias ou instituições sociais que desejam reservar e retirar alimentos excedentes.',
    nameLabel: 'Nome completo ou Nome da Instituição',
    namePlaceholder: 'Ex.: Maria Silva ou Instituto Alimentar Solidário',
  },
  {
    value: 'DONOR',
    title: 'Quero Doar',
    badge: 'Doador / Comerciante',
    description:
      'Para restaurantes, padarias, mercados e hortifrutis que desejam publicar lotes excedentes para retirada presencial.',
    nameLabel: 'Nome do Responsável ou Estabelecimento',
    namePlaceholder: 'Ex.: Padaria Pão Quente Ltda',
  },
];

export function RegisterForm({ defaultRole = 'RECEIVER', onSuccess }: RegisterFormProps) {
  const [role, setRole] = useState<RegisterableRole>(defaultRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<PublicUser | null>(null);

  const selectedRoleConfig =
    ROLE_OPTIONS.find((option) => option.value === role) ?? ROLE_OPTIONS[0];

  const passwordChecks = [
    { label: 'Mínimo de 8 caracteres', valid: password.length >= 8 },
    { label: 'Letra maiúscula (A-Z)', valid: /[A-Z]/.test(password) },
    { label: 'Letra minúscula (a-z)', valid: /[a-z]/.test(password) },
    { label: 'Número (0-9)', valid: /[0-9]/.test(password) },
    { label: 'Caractere especial (!@#$%&*)', valid: /[^A-Za-z0-9]/.test(password) },
  ];

  function clearFieldError(fieldName: string) {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
    if (bannerError) {
      setBannerError(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBannerError(null);
    setFieldErrors({});

    const formPayload = {
      name,
      email,
      phone: phone.trim() === '' ? null : phone,
      password,
      confirmPassword,
      role,
    };

    // 1. Validação client-side imediata com Zod
    const validation = registerFormSchema.safeParse(formPayload);
    if (!validation.success) {
      const errors = formatZodErrors(validation.error);
      setFieldErrors(errors);
      setBannerError('Verifique os campos destacados antes de continuar.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: validation.data.name,
          email: validation.data.email,
          phone: validation.data.phone,
          password: validation.data.password,
          role: validation.data.role,
        }),
      });

      const result = (await response.json()) as RegisterApiResponse;

      if (!response.ok || !result.success) {
        const errorDetails = !result.success ? result.error.details : undefined;
        const errorMessage = !result.success
          ? result.error.message
          : 'Não foi possível concluir o cadastro.';

        if (errorDetails) {
          setFieldErrors(errorDetails);
        }
        setBannerError(errorMessage);
        return;
      }

      setRegisteredUser(result.data);
      onSuccess?.(result.data);
    } catch {
      setBannerError('Falha de comunicação com o servidor. Tente novamente em instantes.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (registeredUser) {
    return (
      <div
        data-testid="register-success"
        role="status"
        className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-8 text-center shadow-sm"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Conta criada com sucesso!</h2>
        <p className="mt-2 text-sm text-slate-600">
          Bem-vindo(a) ao <strong>Reaproveita</strong>,{' '}
          <span className="font-semibold text-slate-800">{registeredUser.name}</span>. Seu perfil
          foi registrado como{' '}
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            {registeredUser.role === 'DONOR' ? 'Doador / Comerciante' : 'Receptor / Beneficiário'}
          </span>
          .
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Ir para o Login
          </Link>
          <button
            type="button"
            onClick={() => {
              setRegisteredUser(null);
              setName('');
              setEmail('');
              setPhone('');
              setPassword('');
              setConfirmPassword('');
            }}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cadastrar outro usuário
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-label="Formulário de cadastro">
      {/* Seleção Visual de Perfil: Receptor vs Doador */}
      <fieldset>
        <legend className="mb-3 block text-sm font-semibold text-slate-800">
          1. Escolha como deseja participar da plataforma <span className="text-red-600">*</span>
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup">
          {ROLE_OPTIONS.map((option) => {
            const isSelected = role === option.value;
            const Icon = option.value === 'DONOR' ? Store : HeartHandshake;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-testid={`role-option-${option.value}`}
                onClick={() => {
                  setRole(option.value);
                  clearFieldError('role');
                }}
                className={`flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isSelected
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {option.badge}
                  </span>
                </div>

                <span className="mt-3 text-base font-bold text-slate-900">{option.title}</span>
                <span className="mt-1 text-xs leading-relaxed text-slate-600">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        {fieldErrors.role && (
          <p id="role-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
            {fieldErrors.role[0]}
          </p>
        )}
      </fieldset>

      {/* Alerta Geral de Erro (ex.: E-mail já cadastrado ou falha de validação) */}
      {bannerError && (
        <div
          role="alert"
          data-testid="register-error-banner"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Atenção no cadastro</p>
            <p className="mt-0.5 text-red-700">{bannerError}</p>
          </div>
        </div>
      )}

      {/* Campos de Dados Cadastrais */}
      <div className="space-y-4">
        {/* Nome */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700">
            {selectedRoleConfig.nameLabel} <span className="text-red-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearFieldError('name');
            }}
            placeholder={selectedRoleConfig.namePlaceholder}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            className={`mt-1 block w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
              fieldErrors.name
                ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 bg-white focus:border-emerald-600 focus:ring-emerald-100'
            }`}
          />
          {fieldErrors.name && (
            <p id="name-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
              {fieldErrors.name[0]}
            </p>
          )}
        </div>

        {/* E-mail */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            E-mail <span className="text-red-600">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFieldError('email');
            }}
            placeholder="seu@email.com.br"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={`mt-1 block w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
              fieldErrors.email
                ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 bg-white focus:border-emerald-600 focus:ring-emerald-100'
            }`}
          />
          {fieldErrors.email && (
            <p id="email-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
              {fieldErrors.email[0]}
            </p>
          )}
        </div>

        {/* Telefone / WhatsApp (Opcional) */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
            Telefone / WhatsApp <span className="text-xs font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              clearFieldError('phone');
            }}
            placeholder="(11) 99999-9999"
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
            className={`mt-1 block w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
              fieldErrors.phone
                ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 bg-white focus:border-emerald-600 focus:ring-emerald-100'
            }`}
          />
          {fieldErrors.phone && (
            <p id="phone-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
              {fieldErrors.phone[0]}
            </p>
          )}
        </div>

        {/* Senha */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Senha <span className="text-red-600">*</span>
          </label>
          <div className="relative mt-1">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              placeholder="Crie uma senha forte"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : 'password-requirements'}
              className={`block w-full rounded-xl border px-3.5 py-2.5 pr-10 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                fieldErrors.password
                  ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-red-200'
                  : 'border-slate-300 bg-white focus:border-emerald-600 focus:ring-emerald-100'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {fieldErrors.password && (
            <p id="password-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
              {fieldErrors.password[0]}
            </p>
          )}

          {/* Checklist visual de requisitos de senha segura */}
          <div
            id="password-requirements"
            className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Requisitos de segurança da senha:
            </p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {passwordChecks.map((item) => (
                <li
                  key={item.label}
                  className={`flex items-center gap-1.5 text-xs ${
                    item.valid ? 'font-medium text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      item.valid ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Confirmação de Senha */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
            Confirmar senha <span className="text-red-600">*</span>
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              clearFieldError('confirmPassword');
            }}
            placeholder="Repita a senha criada"
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined}
            className={`mt-1 block w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
              fieldErrors.confirmPassword
                ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-red-200'
                : 'border-slate-300 bg-white focus:border-emerald-600 focus:ring-emerald-100'
            }`}
          />
          {fieldErrors.confirmPassword && (
            <p
              id="confirmPassword-error"
              role="alert"
              className="mt-1.5 text-xs font-medium text-red-600"
            >
              {fieldErrors.confirmPassword[0]}
            </p>
          )}
        </div>
      </div>

      {/* Botão de Submissão */}
      <button
        type="submit"
        disabled={isSubmitting}
        data-testid="register-submit-button"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Criando sua conta...
          </>
        ) : (
          <>
            Criar conta como {role === 'DONOR' ? 'Doador' : 'Receptor'}
          </>
        )}
      </button>

      <p className="text-center text-xs text-slate-500">
        Já possui uma conta no Reaproveita?{' '}
        <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
          Entrar na plataforma
        </Link>
      </p>
    </form>
  );
}
