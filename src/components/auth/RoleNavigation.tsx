import React from 'react';
import Link from 'next/link';
import { Store, HeartHandshake, ShieldCheck, ArrowRight } from 'lucide-react';
import { UserRole } from '@/types/user';

export interface RoleMenuItem {
  id: string;
  label: string;
  description: string;
  href: string;
  allowedRoles: readonly UserRole[];
}

export const ROLE_MENU_ITEMS: readonly RoleMenuItem[] = [
  {
    id: 'donor-panel',
    label: 'Meus Estabelecimentos (Painel do Doador)',
    description:
      'Gerencie exclusivamente os estabelecimentos comerciais aos quais você está vinculado e publique lotes excedentes.',
    href: '/painel/doador',
    allowedRoles: ['DONOR'],
  },
  {
    id: 'receiver-panel',
    label: 'Minhas Reservas (Painel do Receptor)',
    description:
      'Consulte e gerencie suas próprias reservas ativas e apresente seu código para retirada presencial.',
    href: '/painel/receptor',
    allowedRoles: ['RECEIVER'],
  },
  {
    id: 'admin-panel',
    label: 'Console de Governança (Painel Administrativo)',
    description:
      'Acesse operações administrativas autorizadas, audite estabelecimentos e monitore a plataforma.',
    href: '/painel/admin',
    allowedRoles: ['ADMIN'],
  },
];

/**
 * Filtra estritamente os itens de menu visíveis para o papel do usuário (RN14).
 */
export function getVisibleMenuItemsForRole(role: UserRole): RoleMenuItem[] {
  return ROLE_MENU_ITEMS.filter((item) => item.allowedRoles.includes(role));
}

interface RoleNavigationProps {
  role: UserRole;
}

/**
 * Componente que renderiza apenas os menus e cartões operacionais permitidos
 * para o perfil do usuário autenticado, ocultando elementos restritos a outros papéis.
 */
export function RoleNavigation({ role }: RoleNavigationProps) {
  const visibleItems = getVisibleMenuItemsForRole(role);

  return (
    <div data-testid="role-navigation" className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {visibleItems.map((item) => {
        const Icon =
          role === 'DONOR' ? Store : role === 'ADMIN' ? ShieldCheck : HeartHandshake;

        return (
          <div
            key={item.id}
            data-testid={`menu-card-${item.id}`}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{item.label}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{item.description}</p>
            </div>

            <div className="mt-6">
              <Link
                href={item.href}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Acessar Painel
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
