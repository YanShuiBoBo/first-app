import { z } from 'zod';

// 字幕条目 Schema
export const SubtitleItemSchema = z.object({
  start: z.number().min(0, '开始时间必须大于等于 0'),
  end: z.number().min(0, '结束时间必须大于等于 0'),
  text_en: z.string().min(1, '英文字幕不能为空'),
  text_cn: z.string().min(1, '中文字幕不能为空')
}).refine(
  data => data.end > data.start,
  { message: '结束时间必须大于开始时间' }
);

// 知识卡片 Schema
export const KnowledgeCardSchema = z.object({
  trigger_word: z.string().min(1, '触发词不能为空'),
  data: z.object({
    ipa: z.string().optional(),              // 音标
    def: z.string().min(1, '释义不能为空'),   // 中文释义
    sentence: z.string().optional(),         // 例句
    // 卡片类型：
    // word           单词
    // phrase         短语
    // phrasal_verb   短语动词
    // expression     惯用表达
    // spoken_pattern 口语句式
    // idiom          习语 / 俚语
    // slang          俚语（兼容老数据）
    // proper_noun    专有名词
    type: z
      .enum([
        'word',
        'phrase',
        'phrasal_verb',
        'expression',
        'spoken_pattern',
        'idiom',
        'slang',
        'proper_noun'
      ])
      .optional() // 类型
  })
});

// Finalize 请求 Schema
export const FinalizeRequestSchema = z.object({
  cf_video_id: z.string().min(1, 'Cloudflare 视频 ID 不能为空'),
  meta: z.object({
    title: z.string().min(1, '标题不能为空'),
    // 封面图 URL，首页只使用这个字段展示，不再依赖视频帧截图
    poster: z.string().url('缩略图必须是有效 URL'),
    duration: z.number().min(0, '时长必须大于等于 0'),
    // 新增元数据字段
    author: z.string().min(1, '作者不能为空').optional(),
    description: z.string().optional(),
    difficulty: z
      .number()
      .int()
      .min(1, '难度至少为 1')
      .max(5, '难度最多为 5')
      .optional(),
    tags: z.array(z.string()).optional(),
    // 首图 Cloudflare ID（可选）
    cover_image_id: z.string().optional()
  }),
  subtitles: z.array(SubtitleItemSchema).min(1, '至少需要一条字幕'),
  cards: z.array(KnowledgeCardSchema).optional()
});

export type FinalizeRequest = z.infer<typeof FinalizeRequestSchema>;
