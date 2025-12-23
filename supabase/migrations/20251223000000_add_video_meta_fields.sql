-- ============================================
-- Immersive English - 视频元数据扩展
-- 增加作者、简介、难度、标签等字段
-- ============================================

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS author TEXT,          -- 作者 / 主理人
  ADD COLUMN IF NOT EXISTS description TEXT,     -- 视频简介
  ADD COLUMN IF NOT EXISTS difficulty INT
    CHECK (difficulty BETWEEN 1 AND 5)
    DEFAULT 3,                                   -- 学习难度：1-5 星
  ADD COLUMN IF NOT EXISTS tags TEXT[]           -- 标签列表，如 ['日常生活', '旅游']
    DEFAULT ARRAY[]::TEXT[];

-- 为 tags 创建 GIN 索引，便于后续按标签筛选
CREATE INDEX IF NOT EXISTS idx_videos_tags_gin
  ON videos USING GIN (tags);

