-- ============================================
-- Immersive English - 为 app_users 增加手机号字段
-- ============================================

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS phone TEXT; -- 用户手机号（当前阶段仅采集，不做强校验）

