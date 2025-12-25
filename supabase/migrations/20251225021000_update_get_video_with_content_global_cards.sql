-- 更新 get_video_with_content 函数：
-- 之前：knowledge_cards 只返回当前视频关联的卡片（WHERE video_id = v.id）
-- 现在：knowledge_cards 返回全局卡片列表（满足 RLS 的所有卡片），
--      这样精读页在高亮字幕时，可以复用“平台通用词库”，而不是只看本视频。

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
    )
  ) INTO result
  FROM videos v
  WHERE v.cf_video_id = video_cf_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

