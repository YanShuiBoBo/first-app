-- Immersive English - 为 app_users 增加全局播放器设置字段
-- 用于跨设备保存用户的循环配置等偏好（例如单句循环、视频循环模式等）

ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS player_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

