import { create } from 'zustand';
import { verifyToken } from '@/lib/auth';

// 定义用户类型
export interface User {
  email: string;
  role: string;
  name: string;
}

// 定义登录状态类型
interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;

  // 登录
  login: (user: User, token: string, rememberMe?: boolean) => void;

  // 登出
  logout: () => void;

  // 初始化登录状态
  initialize: () => void;
}

// 创建登录状态管理
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoggedIn: false,

  // 登录
  login: (user, token, rememberMe = false) => {
    // 根据是否勾选“保持登录”设置不同的过期时间（默认 24 小时，保持登录为 30 天）
    const maxAgeSeconds = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;

    // 保存到 cookie
    document.cookie = `auth-token=${token}; path=/; max-age=${maxAgeSeconds};`;

    // 更新状态
    set({
      user,
      token,
      isLoggedIn: true
    });
  },

  // 登出
  logout: () => {
    // 清除 cookie
    document.cookie = 'auth-token=; path=/; max-age=0;';

    // 更新状态
    set({
      user: null,
      token: null,
      isLoggedIn: false
    });
  },

  // 初始化登录状态
  initialize: () => {
    // 从 cookie 获取 token
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('auth-token='))
      ?.split('=')[1];

    if (token) {
      const decoded = verifyToken(token);

      if (decoded) {
        set({
          user: {
            email: decoded.email,
            role: decoded.role,
            name: decoded.name
          },
          token,
          isLoggedIn: true
        });
      } else {
        // 无效或已过期 token，清除
        document.cookie = 'auth-token=; path=/; max-age=0;';
      }
    }
  }
}));
