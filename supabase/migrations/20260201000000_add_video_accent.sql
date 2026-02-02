-- ============================================
-- Immersive English - 视频口音字段（美音/英音等）
-- ============================================

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS accent TEXT NOT NULL DEFAULT 'unknown'
  CHECK (accent IN ('us', 'uk', 'mixed', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_videos_accent ON videos(accent);

