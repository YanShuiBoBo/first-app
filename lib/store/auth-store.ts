import { create } from 'zustand';

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
  login: (user: User, token: string) => void;

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
  login: (user, token) => {
    // 保存到 cookie
    document.cookie = `auth-token=${token}; path=/; max-age=86400;`;

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
      try {
        // 解码 token 获取用户信息
        const decoded = JSON.parse(atob(token));

        // 检查 token 是否过期
        if (decoded.exp > Date.now() / 1000) {
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
          // 清除过期 token
          document.cookie = 'auth-token=; path=/; max-age=0;';
        }
      } catch (error) {
        // 无效 token，清除
        document.cookie = 'auth-token=; path=/; max-age=0;';
      }
    }
  }
}));
