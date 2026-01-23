-- ============================================
-- Immersive English - 用户视频收藏表
-- 说明：
--  - 参考 user_video_progress 的设计，使用 user_email 作为用户维度。
--  - 一条记录表示「某用户收藏了某个视频」。
-- ============================================

CREATE TABLE IF NOT EXISTS user_video_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_email TEXT NOT NULL,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每个用户对每个视频只保留一条收藏记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_video_favorites_unique
  ON user_video_favorites(user_email, video_id);

CREATE INDEX IF NOT EXISTS idx_user_video_favorites_email
  ON user_video_favorites(user_email);

CREATE INDEX IF NOT EXISTS idx_user_video_favorites_video
  ON user_video_favorites(video_id);

-- 启用 RLS，并在当前阶段开放读写，后续接入正式认证后再收紧权限
ALTER TABLE user_video_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "公开读写 user_video_favorites"
  ON user_video_favorites
  FOR ALL
  USING (true)
  WITH CHECK (true);

