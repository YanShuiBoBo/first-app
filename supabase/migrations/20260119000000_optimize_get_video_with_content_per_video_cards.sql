-- ============================================
-- Immersive English - 优化 get_video_with_content
-- 目标：仅返回当前视频关联的知识卡片，避免每次精读页加载整张卡片表。
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
      FROM knowledge_cards
      WHERE video_id = v.id
    )
  ) INTO result
  FROM videos v
  WHERE v.cf_video_id = video_cf_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

