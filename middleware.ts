import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from './lib/auth-token';

// 配置中间件匹配所有非静态资源路由
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$).*)'
  ]
};

export function middleware(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  // 公共路由（不需要登录）
  const publicPaths = ['/login', '/register', '/join', '/auto-join'];
  const isPublicPath = publicPaths.some(
    path => pathname === path || pathname.startsWith(`${path}/`)
  );

  // 试看路由：/watch/[videoId]?trial=1 允许未登录访问
  const isTrialWatch =
    pathname.startsWith('/watch') &&
    searchParams.get('trial') === '1';

  // 当前路径是否需要保护
  const isProtected = !isPublicPath && !isTrialWatch;

  if (!isProtected) {
    return NextResponse.next();
  }

  // 读取 cookie 中的 auth-token
  const token = request.cookies.get('auth-token')?.value;
  const decoded = token ? verifyAuthToken(token) : null;

  // 未登录：重定向到登录页，带上 redirect 参数
  if (!decoded) {
    const loginUrl = new URL('/login', request.nextUrl.origin);
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 管理员路由：要求角色为 admin
  if (pathname.startsWith('/admin')) {
    if (decoded.role !== 'admin') {
      // 非管理员用户访问管理员路由，重定向到首页
      return NextResponse.redirect(new URL('/', request.nextUrl.origin));
    }
  }

  // 其他情况允许继续
  return NextResponse.next();
}
