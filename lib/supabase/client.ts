import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 注意：这里暂时不定义 Database 类型，后续通过 Supabase CLI 生成后替换
// 为了通过 ESLint 的 any 检查，可以后续用真实的 Database 类型替换。
export type Database = any;

// 在浏览器端复用单例，避免多次创建 GoTrueClient 导致的闪烁和警告
let browserClient: SupabaseClient<Database> | null = null;

export function createBrowserClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // 在构建好的前端环境里，这两个变量应该已经被内联。
    // 如果仍然为空，说明 Vercel 上的环境变量没有配置好。
    const msg =
      'Supabase 环境变量缺失：请在部署平台中配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。';
    if (typeof window !== 'undefined') {
      // 浏览器侧：用 console.error 帮助定位问题，同时抛出更友好的错误。
      // 这里仍然抛错，因为没有后端地址时，应用无法正常工作。
      // eslint-disable-next-line no-console
      console.error(msg);
      throw new Error(msg);
    } else {
      // 服务器侧：同样抛出明确的错误，方便在构建日志中排查。
      throw new Error(msg);
    }
  }

  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
  return browserClient;
}

