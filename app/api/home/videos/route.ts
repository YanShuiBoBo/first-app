import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('videos')
      .select(
        // 首页仅选择卡片 / Hero 必需字段，减少单次响应体积
        'id, cf_video_id, title, poster, duration, author, difficulty, tags, cover_image_id, view_count'
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/home/videos] 查询失败:', error);
      return NextResponse.json(
        { error: 'Failed to load videos' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { videos: data ?? [] },
      {
        // 为生产环境提供简单的短缓存：CDN 30 秒，过期后后台重新拉取
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/home/videos] 未知错误:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

