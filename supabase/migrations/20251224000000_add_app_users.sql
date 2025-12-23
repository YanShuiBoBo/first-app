-- ============================================
-- Immersive English - 应用用户表（自定义登录用）
-- ============================================

-- 说明：
--  - 此表用于当前阶段的自定义登录 / 注册逻辑，不直接依赖 Supabase Auth。
--  - 上线前建议将密码字段替换为哈希，并逐步迁移到 Supabase Auth 正式方案。

CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,                 -- 用户邮箱
  password TEXT NOT NULL,                     -- 明文密码（仅开发阶段使用，生产环境请加密）
  name TEXT,                                  -- 显示名称
  role TEXT NOT NULL DEFAULT 'user'           -- 'user' | 'admin'
    CHECK (role IN ('user', 'admin')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_app_users_email ON app_users(email);

-- 自动更新 updated_at
CREATE TRIGGER update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- 开发阶段策略：允许所有角色对 app_users 做任意操作
-- ⚠️ 仅建议在当前「本地 + 内测」阶段使用，正式上线前请替换为严格策略
CREATE POLICY "app_users_dev_all"
  ON app_users
  FOR ALL
  USING (true)
  WITH CHECK (true);

