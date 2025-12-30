-- ============================================
-- Immersive English - 用户词汇状态表 (Video Vocabulary Manager)
-- ============================================

-- 说明：
--  - 当前阶段仍然使用自定义登录系统，后端通过 auth-token 中的 email 标识用户，
--    因此这里沿用 user_video_progress / user_study_days 的做法，使用 user_email 作为主键维度。
--  - 后续若接入 Supabase Auth，可以新增 user_id 字段并做数据迁移。

-- 枚举：词汇状态
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'vocab_status_type'
  ) THEN
    CREATE TYPE vocab_status_type AS ENUM ('known', 'unknown');
  END IF;
END;
$$;

-- 用户词汇全局状态表
CREATE TABLE IF NOT EXISTS user_vocab_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 当前阶段使用用户邮箱作为标识，保持与 user_video_progress/user_study_days 一致
  user_email TEXT NOT NULL,

  -- 统一存储词汇原形 / 词条 key，如 "recommend"、"chill out"
  word TEXT NOT NULL,

  status vocab_status_type NOT NULL,

  -- 最后一次遇到该词汇的视频，便于回溯上下文
  last_seen_video_id UUID REFERENCES videos(id) ON DELETE SET NULL,

  -- 预留上下文快照：包含例句、中译、时间戳等
  -- 示例：
  -- {
  --   "video_id": "...",
  --   "sentence_en": "...",
  --   "sentence_cn": "...",
  --   "timestamp_start": 10.5,
  --   "timestamp_end": 12.0
  -- }
  context_snapshot JSONB,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每个用户对每个词只保留一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_vocab_status_unique
  ON user_vocab_status(user_email, word);

CREATE INDEX IF NOT EXISTS idx_user_vocab_status_email
  ON user_vocab_status(user_email);

CREATE INDEX IF NOT EXISTS idx_user_vocab_status_word
  ON user_vocab_status(word);

CREATE INDEX IF NOT EXISTS idx_user_vocab_status_status
  ON user_vocab_status(status);

-- 启用 RLS
ALTER TABLE user_vocab_status ENABLE ROW LEVEL SECURITY;

-- 开发阶段策略：允许匿名读写，后续接入正式认证后再收紧权限
CREATE POLICY "公开读写 user_vocab_status"
  ON user_vocab_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

