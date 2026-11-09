import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('reaproveita_session');
  const isLoginPage = request.nextUrl.pathname === '/login';
  const isRegisterPage = request.nextUrl.pathname === '/register';

  // Se o usuário NÃO está logado e tenta acessar uma rota protegida (ex: dashboard)
  // Descomente as linhas abaixo quando criar as rotas privadas:
  /*
  if (!sessionCookie && !isLoginPage && !isRegisterPage && request.nextUrl.pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  */

  // Se o usuário JÁ está logado e tenta acessar a tela de login ou cadastro, manda para a home
  if (sessionCookie && (isLoginPage || isRegisterPage)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};