// 仅供中间件等服务端/边缘环境使用的 token 解析工具，不依赖 Supabase
// 与 lib/auth.ts 中 createToken 生成的结构保持一致：
// { email, role, name, exp }

export interface AuthTokenPayload {
  email: string;
  role: string;
  name: string;
  exp: number;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    // 与 lib/auth.ts 中 verifyToken 的逻辑保持一致，处理中文字符
    const decodedData = JSON.parse(
      decodeURIComponent(
        atob(token)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    ) as AuthTokenPayload;

    if (typeof decodedData.exp !== 'number') {
      return null;
    }

    if (decodedData.exp < Date.now() / 1000) {
      return null;
    }

    return decodedData;
  } catch {
    try {
      // 兼容旧的简单解码方式
      const decoded = JSON.parse(atob(token)) as AuthTokenPayload;
      if (typeof decoded.exp !== 'number') {
        return null;
      }
      if (decoded.exp < Date.now() / 1000) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }
}
