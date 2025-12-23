import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 公共页面 - 不需要登录
const PUBLIC_PATHS = ['/login', '/register'];

// 管理页面 - 需要管理员权限
const ADMIN_PATHS = ['/admin', '/admin/*'];

// 中间件函数
export async function middleware(request: NextRequest) {
  // 获取当前路径
  const path = request.nextUrl.pathname;

  // 检查是否为公共页面
  const isPublic = PUBLIC_PATHS.includes(path);
  if (isPublic) {
    return NextResponse.next();
  }

  // 检查是否为注册页面 - 暂时只允许邀请码注册
  if (path === '/register') {
    // 这里可以添加邀请码验证逻辑
    return NextResponse.next();
  }

  // 检查是否已登录
  const token = request.cookies.get('auth-token')?.value;
  const isLoggedIn = !!token;

  // 如果未登录，重定向到登录页
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', request.nextUrl.origin);
    loginUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(loginUrl);
  }

  // 检查是否为管理页面
  const isAdminPath = ADMIN_PATHS.some(adminPath => {
    if (adminPath.endsWith('/*')) {
      const adminPrefix = adminPath.replace('/*', '');
      return path.startsWith(adminPrefix);
    }
    return path === adminPath;
  });

  // 如果是管理页面，检查是否为管理员
  if (isAdminPath) {
    // 这里可以添加管理员权限检查逻辑
    const isAdmin = true; // 临时模拟
    if (!isAdmin) {
      const homeUrl = new URL('/', request.nextUrl.origin);
      return NextResponse.redirect(homeUrl);
    }
  }

  // 允许访问
  return NextResponse.next();
}

// 配置中间件适用的路径
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
