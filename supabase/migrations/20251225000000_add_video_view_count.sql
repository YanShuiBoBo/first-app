-- ============================================
-- Immersive English - 视频点击量指标
-- 为每个视频增加 view_count 字段，并提供安全的自增函数
-- ============================================

-- 为 videos 表增加点击量字段
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0;

-- 按点击量排序的索引，便于后续做“最热门推荐”
CREATE INDEX IF NOT EXISTS idx_videos_view_count_desc
  ON videos(view_count DESC);

-- 提供一个安全的点击量自增函数
-- 通过 Cloudflare 视频 ID 进行定位，避免在前端暴露内部 UUID
CREATE OR REPLACE FUNCTION increment_video_view(p_cf_video_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE videos
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE cf_video_id = p_cf_video_id;
END;
$$;

-- 允许匿名/登录用户调用该函数（Supabase 内置角色）
GRANT EXECUTE ON FUNCTION increment_video_view(TEXT) TO anon, authenticated;

