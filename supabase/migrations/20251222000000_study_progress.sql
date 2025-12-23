-- ============================================
-- Immersive English - Phase 2 学习进度与日历
-- ============================================

-- 1. 用户视频学习进度表
-- 按「用户邮箱 + 视频」维度记录是否学习过
CREATE TABLE IF NOT EXISTS user_video_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 由于当前项目使用自定义登录系统，这里暂时用用户邮箱作为标识
  user_email TEXT NOT NULL,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),

  last_position FLOAT DEFAULT 0,              -- 最近观看到的视频进度（秒）
  last_watched_at TIMESTAMPTZ DEFAULT NOW(),  -- 最近学习时间
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每个用户对每个视频只保留一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_video_progress_unique
  ON user_video_progress(user_email, video_id);

CREATE INDEX IF NOT EXISTS idx_user_video_progress_email
  ON user_video_progress(user_email);

CREATE INDEX IF NOT EXISTS idx_user_video_progress_status
  ON user_video_progress(status);

-- 2. 用户学习日历表
-- 按「用户邮箱 + 日期」记录当天是否学习（以及可扩展的时长）
CREATE TABLE IF NOT EXISTS user_study_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_email TEXT NOT NULL,
  study_date DATE NOT NULL,

  total_minutes INT DEFAULT 0,                -- 预留字段：学习总时长（分钟）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每个用户每天一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_study_days_unique
  ON user_study_days(user_email, study_date);

CREATE INDEX IF NOT EXISTS idx_user_study_days_email
  ON user_study_days(user_email);

CREATE INDEX IF NOT EXISTS idx_user_study_days_date
  ON user_study_days(study_date);

-- 3. RLS 策略
-- 当前阶段仍然使用 anon key 从前端直接访问，先开放读写，后续可切换为基于 Supabase Auth 的严格策略

ALTER TABLE user_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_study_days ENABLE ROW LEVEL SECURITY;

-- Phase 2: 允许匿名读写，后续接入正式认证后再收紧权限
CREATE POLICY "公开读写 user_video_progress"
  ON user_video_progress FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "公开读写 user_study_days"
  ON user_study_days FOR ALL
  USING (true)
  WITH CHECK (true);

