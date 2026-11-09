'use client';

import { useState, useEffect, FormEvent } from 'react';

type MessageState = {
  type: 'success' | 'error';
  text: string;
} | null;

export default function ProfileForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  // Busca os dados do usuário ao carregar a tela
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/users/me');
        if (res.ok) {
          const data = await res.json();
          setName(data.name || '');
          setPhone(data.phone || '');
        } else {
          setMessage({ type: 'error', text: 'Não foi possível carregar seu perfil. Você está logado?' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Erro de conexão ao carregar o perfil.' });
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, []);

  // Envia os dados atualizados para a nossa API
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      } else {
        // Se a nossa API retornar o erro 400 do Zod, mostramos a mensagem amigável
        setMessage({ type: 'error', text: data.details || data.error || 'Erro ao atualizar perfil.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro de conexão. Tente novamente.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-center text-gray-500 py-4">Carregando dados...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Toast de Mensagem (Sucesso ou Erro) */}
      {message && (
        <div className={`p-4 rounded-md text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome</label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Telefone</label>
        <input
          type="text"
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(11) 99999-9999"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
      </button>
    </form>
  );
}