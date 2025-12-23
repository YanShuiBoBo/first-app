-- ============================================
-- Immersive English - Phase 1 数据库 Schema
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 视频主表
-- ============================================
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cf_video_id TEXT UNIQUE NOT NULL,           -- Cloudflare Stream 视频 ID
  title TEXT NOT NULL,                        -- 视频标题
  poster TEXT,                                -- 缩略图 URL
  duration FLOAT NOT NULL,                    -- 视频时长（秒）
  status TEXT NOT NULL DEFAULT 'processing'   -- 'processing' | 'published' | 'failed'
    CHECK (status IN ('processing', 'published', 'failed')),

  -- 元数据
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_videos_cf_video_id ON videos(cf_video_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_created_at ON videos(created_at DESC);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. 字幕表
-- ============================================
CREATE TABLE subtitles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,

  -- JSONB 存储字幕数据
  -- 格式: [{"start": 0.5, "end": 2.1, "text_en": "Hello", "text_cn": "你好"}]
  content JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_subtitles_video_id ON subtitles(video_id);
CREATE INDEX idx_subtitles_content_gin ON subtitles USING GIN(content); -- 支持 JSONB 查询

-- 确保每个视频只有一条字幕记录
CREATE UNIQUE INDEX idx_subtitles_video_unique ON subtitles(video_id);

-- ============================================
-- 3. 知识卡片表
-- ============================================
CREATE TABLE knowledge_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  trigger_word TEXT NOT NULL,                 -- 触发词（如 "Hello"）

  -- JSONB 存储卡片数据
  -- 格式: {"ipa": "/həˈloʊ/", "def": "打招呼", "sentence": "...", "type": "phrase"}
  data JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_knowledge_cards_video_id ON knowledge_cards(video_id);
CREATE INDEX idx_knowledge_cards_trigger_word ON knowledge_cards(trigger_word);
CREATE INDEX idx_knowledge_cards_data_gin ON knowledge_cards USING GIN(data);

-- ============================================
-- 4. 激活码表（预留给 Phase 3）
-- ============================================
CREATE TABLE access_codes (
  code TEXT PRIMARY KEY,                      -- 激活码（如 "ABC-123-XYZ"）
  user_id UUID REFERENCES auth.users(id),     -- 使用者 ID（可为空）
  valid_days INT NOT NULL DEFAULT 30,         -- 有效天数
  status TEXT NOT NULL DEFAULT 'unused'       -- 'unused' | 'active' | 'expired'
    CHECK (status IN ('unused', 'active', 'expired')),

  activated_at TIMESTAMPTZ,                   -- 激活时间
  expires_at TIMESTAMPTZ,                     -- 过期时间
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_access_codes_user_id ON access_codes(user_id);
CREATE INDEX idx_access_codes_status ON access_codes(status);

-- ============================================
-- 5. Row Level Security (RLS) 策略
-- ============================================

-- 启用 RLS
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtitles ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

-- Phase 1: 允许匿名读取所有已发布视频（用于测试）
-- Phase 3 会替换为基于激活码的策略
CREATE POLICY "允许读取已发布视频"
  ON videos FOR SELECT
  USING (status = 'published');

CREATE POLICY "允许读取字幕"
  ON subtitles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM videos
      WHERE videos.id = subtitles.video_id
      AND videos.status = 'published'
    )
  );

CREATE POLICY "允许读取知识卡片"
  ON knowledge_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM videos
      WHERE videos.id = knowledge_cards.video_id
      AND videos.status = 'published'
    )
  );

-- ============================================
-- 6. 辅助函数：获取视频完整数据
-- ============================================
CREATE OR REPLACE FUNCTION get_video_with_content(video_cf_id TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'video', row_to_json(v.*),
    'subtitles', (
      SELECT content FROM subtitles WHERE video_id = v.id
    ),
    'knowledge_cards', (
      SELECT json_agg(
        json_build_object('trigger_word', trigger_word, 'data', data)
      )
      FROM knowledge_cards WHERE video_id = v.id
    )
  ) INTO result
  FROM videos v
  WHERE v.cf_video_id = video_cf_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql;