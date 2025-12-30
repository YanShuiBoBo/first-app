import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

interface BatchKnownRequestBody {
  words?: string[];
  context?: {
    video_id?: string;
    sentence_en?: string;
    sentence_cn?: string;
    timestamp_start?: number;
    timestamp_end?: number;
  };
}

const parseAuthEmail = (req: NextRequest): string | null => {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)auth-token=([^;]+)/);
  if (!match) return null;

  const token = match[1];
  try {
    const json = Buffer.from(token, 'base64').toString('utf8');
    const payload = JSON.parse(json) as {
      email?: string;
      exp?: number;
    };

    if (
      !payload ||
      typeof payload.email !== 'string' ||
      !payload.email ||
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now() / 1000
    ) {
      return null;
    }

    return payload.email;
  } catch {
    return null;
  }
};

export async function POST(req: NextRequest) {
  try {
    const userEmail = parseAuthEmail(req);
    if (!userEmail) {
      return NextResponse.json(
        { error: '未登录，无法更新词汇状态' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as BatchKnownRequestBody;
    const words = Array.isArray(body.words)
      ? body.words
          .filter(w => typeof w === 'string')
          .map(w => w.trim())
          .filter(w => w.length > 0)
      : [];

    if (words.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const uniqueWords = Array.from(
      new Set(words.map(w => w.toLowerCase()))
    );

    const supabase = createServerClient();
    const rows = uniqueWords.map(word => {
      const row: {
        user_email: string;
        word: string;
        status: 'known';
        updated_at: string;
        last_seen_video_id?: string;
        context_snapshot?: BatchKnownRequestBody['context'];
      } = {
        user_email: userEmail,
        word,
        status: 'known',
        updated_at: new Date().toISOString()
      };

      if (body.context?.video_id) {
        row.last_seen_video_id = body.context.video_id;
      }
      if (body.context) {
        row.context_snapshot = body.context;
      }

      return row;
    });

    const { error } = await supabase
      .from('user_vocab_status')
      .upsert(rows, {
        onConflict: 'user_email,word'
      });

    if (error) {
      console.error('[vocab/status/batch-known] 批量更新失败:', error);
      return NextResponse.json(
        { error: '批量更新词汇状态失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated: uniqueWords.length
    });
  } catch (err) {
    console.error('[vocab/status/batch-known] 未知错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
