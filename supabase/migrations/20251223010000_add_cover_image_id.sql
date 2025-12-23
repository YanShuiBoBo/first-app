-- ============================================
-- Immersive English - 增加视频首图 Cloudflare ID
-- ============================================

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS cover_image_id TEXT;  -- 首图 ID（例如 Cloudflare Images ID）

