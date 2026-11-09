'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { formatZodErrors, loginSchema } from '@/schemas/auth.schema';
import { RegisterApiResponse } from '@/types/user';

/**
 * Componente de Formulário de Login (Frontend - RF03).
 * Responsável por capturar as credenciais, aplicar a validação client-side (Zod)
 * e comunicar-se com o BFF para autenticação e criação da sessão.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFieldError(fieldName: string) {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
    if (bannerError) setBannerError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBannerError(null);
    setFieldErrors({});

    const formPayload = { email, password };

    // 1. Validação client-side imediata com Zod (Evita requisições desnecessárias ao servidor)
    const validation = loginSchema.safeParse(formPayload);
    if (!validation.success) {
      setFieldErrors(formatZodErrors(validation.error));
      setBannerError('Verifique os campos destacados antes de continuar.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 2. Comunicação com o BFF (Backend-for-Frontend) via Route Handler
      // A rota /auth/login é responsável por validar as credenciais e criar o cookie HttpOnly
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });

      const result = (await response.json()) as RegisterApiResponse;

      if (!response.ok || !result.success) {
        if (!result.success && result.error.details) {
          setFieldErrors(result.error.details);
        }
        setBannerError(!result.success ? result.error.message : 'Não foi possível entrar.');
        return;
      }

      // 3. Gerenciamento de Sessão no Client-side
      // Após o sucesso, redireciona o usuário para a página inicial (Hub) e atualiza os Server Components
      router.push('/');
      router.refresh();
    } catch {
      setBannerError('Falha de comunicação com o servidor. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-label="Formulário de login">
      {/* Alerta Geral de Erro (ex.: Credenciais inválidas) */}
      {bannerError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Atenção</p>
            <p className="mt-0.5 text-red-700">{bannerError}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Campo de E-mail */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            E-mail <span className="text-red-600">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
            placeholder="seu@email.com.br"
            className={`mt-1 block w-full rounded-xl border px-3.5 py-2.5 text-sm shadow-sm transition focus:outline-none focus:ring-2 ${
              fieldErrors.email ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-100'
            }`}
          />
          {fieldErrors.email && <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.email[0]}</p>}
        </div>

        {/* Campo de Senha com Toggle de Visibilidade */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Senha <span className="text-red-600">*</span>
            </label>
          </div>
          <div className="relative mt-1">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
              placeholder="Sua senha"
              className={`block w-full rounded-xl border px-3.5 py-2.5 pr-10 text-sm shadow-sm transition focus:outline-none focus:ring-2 ${
                fieldErrors.password ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-100'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password && <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.password[0]}</p>}
        </div>
      </div>

      {/* Botão de Submissão */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
      >
        {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Entrando...</> : 'Entrar na plataforma'}
      </button>

      {/* Link para Cadastro */}
      <p className="text-center text-xs text-slate-500">
        Ainda não tem conta?{' '}
        <Link href="/register" className="font-semibold text-emerald-700 hover:underline">
          Cadastre-se gratuitamente
        </Link>
      </p>
    </form>
  );
}