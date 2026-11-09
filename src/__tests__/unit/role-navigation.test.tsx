import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { RoleNavigation, getVisibleMenuItemsForRole } from '@/components/auth/RoleNavigation';
import { middleware } from '@/middleware';

describe('Proteção de Rotas Privadas e Menus Condicionais por Papel (Subtask 3 - História 3)', () => {
  describe('RoleNavigation - Ocultação de menus restritos a outros papéis', () => {
    it('deve exibir apenas o menu do Receptor e ocultar menus de Doador e Administrador para perfil RECEIVER', () => {
      render(<RoleNavigation role="RECEIVER" />);

      expect(screen.getByTestId('menu-card-receiver-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('menu-card-donor-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('menu-card-admin-panel')).not.toBeInTheDocument();
    });

    it('deve exibir apenas o menu do Doador e ocultar menus de Receptor e Administrador para perfil DONOR', () => {
      render(<RoleNavigation role="DONOR" />);

      expect(screen.getByTestId('menu-card-donor-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('menu-card-receiver-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('menu-card-admin-panel')).not.toBeInTheDocument();
    });

    it('deve exibir apenas o Console Administrativo e ocultar menus de Doador e Receptor para perfil ADMIN', () => {
      render(<RoleNavigation role="ADMIN" />);

      expect(screen.getByTestId('menu-card-admin-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('menu-card-donor-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('menu-card-receiver-panel')).not.toBeInTheDocument();
    });

    it('getVisibleMenuItemsForRole deve filtrar estritamente os itens permitidos por papel', () => {
      expect(getVisibleMenuItemsForRole('DONOR').map((i) => i.href)).toEqual(['/painel/doador']);
      expect(getVisibleMenuItemsForRole('RECEIVER').map((i) => i.href)).toEqual([
        '/painel/receptor',
      ]);
      expect(getVisibleMenuItemsForRole('ADMIN').map((i) => i.href)).toEqual(['/painel/admin']);
    });
  });

  describe('Middleware - Proteção de Rotas Privadas e RBAC no Cliente', () => {
    it('deve redirecionar usuário não autenticado para /login ao tentar acessar rota privada (/perfil ou /painel/*)', () => {
      const reqPerfil = new NextRequest('http://localhost:3000/perfil');
      const resPerfil = middleware(reqPerfil);
      expect(resPerfil.headers.get('location')).toBe('http://localhost:3000/login');

      const reqAdmin = new NextRequest('http://localhost:3000/painel/admin');
      const resAdmin = middleware(reqAdmin);
      expect(resAdmin.headers.get('location')).toBe('http://localhost:3000/login');
    });

    it('deve redirecionar Receptor para /acesso-negado ao tentar acessar /painel/admin ou /painel/doador', () => {
      const receiverSession = JSON.stringify({
        id: 'u-rec',
        email: 'rec@reaproveita.com',
        role: 'RECEIVER',
      });

      const reqAdmin = new NextRequest('http://localhost:3000/painel/admin', {
        headers: {
          cookie: `reaproveita_session=${encodeURIComponent(receiverSession)}`,
        },
      });
      const resAdmin = middleware(reqAdmin);
      expect(resAdmin.headers.get('location')).toBe('http://localhost:3000/acesso-negado');

      const reqDonor = new NextRequest('http://localhost:3000/painel/doador', {
        headers: {
          cookie: `reaproveita_session=${encodeURIComponent(receiverSession)}`,
        },
      });
      const resDonor = middleware(reqDonor);
      expect(resDonor.headers.get('location')).toBe('http://localhost:3000/acesso-negado');
    });

    it('deve permitir acesso quando o usuário possui o papel correspondente à rota restrita', () => {
      const adminSession = JSON.stringify({
        id: 'u-adm',
        email: 'admin@reaproveita.com',
        role: 'ADMIN',
      });

      const reqAdmin = new NextRequest('http://localhost:3000/painel/admin', {
        headers: {
          cookie: `reaproveita_session=${encodeURIComponent(adminSession)}`,
        },
      });
      const resAdmin = middleware(reqAdmin);
      expect(resAdmin.headers.get('location')).toBeNull();
    });
  });
});
