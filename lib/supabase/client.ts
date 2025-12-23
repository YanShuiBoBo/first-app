import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 注意：这里暂时不定义 Database 类型，后续通过 Supabase CLI 生成后替换
// 为了通过 ESLint 的 any 检查，可以后续用真实的 Database 类型替换。
export type Database = any;

// 在浏览器端复用单例，避免多次创建 GoTrueClient 导致的闪烁和警告
let browserClient: SupabaseClient<Database> | null = null;

export function createBrowserClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}

