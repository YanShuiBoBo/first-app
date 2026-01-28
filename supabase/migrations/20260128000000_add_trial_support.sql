-- ============================================
-- 体验卡支持：access_codes.kind + app_users.plan/access_expires_at
-- ============================================

-- 1) 激活码类型：full / trial
ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'full';

-- kind 约束：仅允许 full（正式卡）或 trial（体验卡）
ALTER TABLE access_codes
  ADD CONSTRAINT access_codes_kind_check
  CHECK (kind IN ('full', 'trial'));

-- 2) app_users 增加套餐与账号有效期
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'full';

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_plan_check
  CHECK (plan IN ('full', 'trial'));
