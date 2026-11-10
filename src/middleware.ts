import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { UserRole } from '@/types/user';

const PRIVATE_ROUTE_PREFIXES = ['/perfil', '/painel'];

const ROLE_RESTRICTED_ROUTES: Array<{ prefix: string; allowedRoles: readonly UserRole[] }> = [
  { prefix: '/painel/doador', allowedRoles: ['DONOR'] },
  { prefix: '/painel/receptor', allowedRoles: ['RECEIVER'] },
  { prefix: '/painel/admin', allowedRoles: ['ADMIN'] },
];

function parseSessionRole(cookieValue?: string): UserRole | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(cookieValue) as { role?: UserRole };
    if (parsed.role === 'DONOR' || parsed.role === 'RECEIVER' || parsed.role === 'ADMIN') {
      return parsed.role;
    }
    return null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('reaproveita_session');
  const userRole = parseSessionRole(sessionCookie?.value);
  const isAuthenticated = Boolean(sessionCookie?.value && userRole);

  const isLoginPage = pathname === '/login';
  const isRegisterPage = pathname === '/register';
  const isPrivateRoute = PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // 1. Bloqueia acesso não autenticado às rotas privadas e redireciona para /login
  if (!isAuthenticated && isPrivateRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Se autenticado e tenta acessar /login ou /register, redireciona para a Home
  if (isAuthenticated && (isLoginPage || isRegisterPage)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 3. Guarda de rota por papel (RBAC - RN14) nas páginas de painel
  if (isAuthenticated && userRole) {
    const matchedRule = ROLE_RESTRICTED_ROUTES.find(
      (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
    );

    if (matchedRule && !matchedRule.allowedRoles.includes(userRole)) {
      return NextResponse.redirect(new URL('/acesso-negado', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};