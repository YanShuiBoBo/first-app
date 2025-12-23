import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

// 定义中间件类型
export function middleware(request: NextRequest): NextResponse | undefined {
  // 检查是否是需要保护的路由
  const currentPath = request.nextUrl.pathname;

  console.log('Middleware checking path:', currentPath);

  // 允许访问的公共路由
  const publicPaths = ['/login', '/register'];

  // 检查是否是公共路由
  const isPublicPath = publicPaths.includes(currentPath);

  // 所有路由都需要保护，除了公共路由
  const isProtected = !isPublicPath;

  if (isProtected) {
    // 获取 token
    const token = request.cookies.get('auth-token')?.value;

    console.log('Found token:', token);

    // 验证 token
    const decoded = token ? verifyToken(token) : null;

    if (!token || !decoded) {
      // 如果没有 token 或 token 无效，重定向到登录页面
      const loginUrl = new URL('/login', request.nextUrl.origin);
      // 添加原始路径作为重定向参数
      loginUrl.searchParams.set('redirect', currentPath);

      console.log('Redirecting to login:', loginUrl.href);

      // 返回重定向响应
      return NextResponse.redirect(loginUrl);
    }

    // 如果是管理员路由，检查用户角色
    if (currentPath.startsWith('/admin')) {
      if (decoded.role !== 'admin') {
        // 非管理员用户不能访问管理员页面，重定向到首页
        return NextResponse.redirect(new URL('/', request.nextUrl.origin));
      }
    }
  }

  // 允许请求继续
  console.log('Allowing request to continue');
  return NextResponse.next();
}

// 配置中间件匹配所有路由
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};