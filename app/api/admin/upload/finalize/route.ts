import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { FinalizeRequestSchema } from '@/lib/validations/upload';
import { successResponse, errorResponse } from '@/lib/utils/response';
import { ApiError, AuthError, ValidationError, DatabaseError } from '@/lib/utils/errors';

/**
 * POST /api/admin/upload/finalize
 *
 * 保存视频元数据到 Supabase
 * 需要 x-admin-secret Header 认证
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证管理员密钥
    const adminSecret = request.headers.get('x-admin-secret');
    if (adminSecret !== process.env.ADMIN_SECRET) {
      throw new AuthError('无效的管理员密钥');
    }

    // 2. 解析请求体
    const body = await request.json();

    // 3. 验证数据格式
    const validationResult = FinalizeRequestSchema.safeParse(body);
    if (!validationResult.success) {
      throw new ValidationError(
        '请求数据格式错误',
        validationResult.error.flatten()
      );
    }

    const { cf_video_id, meta, subtitles, cards } = validationResult.data;

    // 4. 初始化 Supabase 客户端
    const supabase = createServerClient();

    // 5. 开始数据库操作

    // 5.1 插入视频记录
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .insert({
        cf_video_id,
        title: meta.title,
        poster: meta.poster,
        duration: meta.duration,
        // 新导入的视频默认设为未发布（processing），
        // 需要在素材管理中手动点击“发布”后才会出现在首页并对用户开放
        status: 'processing',
        author: meta.author,
        description: meta.description,
        difficulty: meta.difficulty ?? 3,
        tags: meta.tags ?? [],
        cover_image_id: meta.cover_image_id
      })
      .select()
      .single();

    if (videoError) {
      throw new DatabaseError('插入视频记录失败', videoError);
    }

    // 5.2 插入字幕记录
    const { error: subtitlesError } = await supabase
      .from('subtitles')
      .insert({
        video_id: video.id,
        content: subtitles
      });

    if (subtitlesError) {
      // 回滚：删除已创建的视频记录
      await supabase.from('videos').delete().eq('id', video.id);
      throw new DatabaseError('插入字幕失败', subtitlesError);
    }

    // 5.3 插入知识卡片（如果有）
    if (cards && cards.length > 0) {
      const cardsData = cards.map(card => ({
        video_id: video.id,
        trigger_word: card.trigger_word,
        data: card.data
      }));

      const { error: cardsError } = await supabase
        .from('knowledge_cards')
        .insert(cardsData);

      if (cardsError) {
        // 回滚：删除视频和字幕
        await supabase.from('videos').delete().eq('id', video.id);
        throw new DatabaseError('插入知识卡片失败', cardsError);
      }
    }

    // 6. 返回成功结果
    return successResponse({
      video_id: video.id,
      cf_video_id: video.cf_video_id,
      message: '视频上传完成'
    }, 201);

  } catch (error) {
    console.error('[API /admin/upload/finalize] 错误:', error);

    if (error instanceof ApiError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }

    return errorResponse('服务器内部错误');
  }
}
