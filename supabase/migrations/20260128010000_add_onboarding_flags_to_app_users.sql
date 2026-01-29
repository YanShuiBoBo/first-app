-- Immersive English - 为 app_users 增加引导提示状态字段
-- 用于跨设备记录用户是否已经看过首页 / 精读页等一次性使用说明弹窗。

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS onboarding_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

