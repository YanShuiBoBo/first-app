import { z } from 'zod';

// 字幕条目 Schema
export const SubtitleItemSchema = z.object({
  start: z.number().min(0, '开始时间必须大于等于 0'),
  end: z.number().min(0, '结束时间必须大于等于 0'),
  text_en: z.string().min(1, '英文字幕不能为空'),
  // 中文字幕允许为空：有少量未翻译行时不再阻塞导入流程，
  // 前端可根据空字符串判定“暂无中文”。
  text_cn: z.string().default('')
}).refine(
  data => data.end > data.start,
  { message: '结束时间必须大于开始时间' }
);

// 知识卡片 Schema
export const KnowledgeCardSchema = z.object({
  trigger_word: z.string().min(1, '触发词不能为空'),
  data: z.object({
    headword: z.string().optional(),        // 词形原型（可选）
    ipa: z.string().optional(),              // 音标
    def: z.string().min(1, '释义不能为空'),   // 中文释义
    sentence: z.string().optional(),         // 英文例句（兼容老数据，优先使用 source.sentence_en）
    pos: z.string().optional(),              // 词性（如 v./n./adj.）
    collocations: z.array(z.string()).optional(), // 常见搭配
    synonyms: z.array(z.string()).optional(),     // 近义词
    antonyms: z.array(z.string()).optional(),     // 反义词
    derived_form: z.string().optional(),          // 关联词形
    difficulty_level: z.string().optional(),      // 难度标签（保留字段）
    structure: z.string().optional(),             // 短语 / 短语动词结构
    register: z.string().optional(),              // 语体（口语/正式等）
    paraphrase: z.string().optional(),            // 英文释义或同义改写
    function_label: z.string().optional(),        // 功能标签（如“缓和语气”）
    scenario: z.string().optional(),              // 典型使用场景描述
    note: z.string().optional(),                  // 使用提示（情绪、禁忌等）
    response_guide: z.string().optional(),        // 接话指南
    example: z
      .object({
        en: z.string().optional(),
        cn: z.string().optional()
      })
      .optional(),                                // 额外例句（非原句）
    source: z
      .object({
        sentence_en: z.string().optional(),       // 完整英文原句
        sentence_cn: z.string().optional(),       // 对应中文翻译
        timestamp_start: z.number().optional(),   // 片段起始时间（秒）
        timestamp_end: z.number().optional()      // 片段结束时间（秒）
      })
      .optional(),
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
  }).passthrough() // 允许保留额外字段，避免前端/脚本扩展时被截断
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
