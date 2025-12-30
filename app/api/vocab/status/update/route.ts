import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

type VocabStatus = 'known' | 'unknown';

interface UpdateRequestBody {
  word?: string;
  status?: VocabStatus;
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

    const body = (await req.json()) as UpdateRequestBody;
    const rawWord = typeof body.word === 'string' ? body.word.trim() : '';
    const status = body.status;

    if (!rawWord || (status !== 'known' && status !== 'unknown')) {
      return NextResponse.json(
        { error: '请求参数错误' },
        { status: 400 }
      );
    }

    const wordKey = rawWord.toLowerCase();
    const supabase = createServerClient();

    const payload: {
      user_email: string;
      word: string;
      status: VocabStatus;
      updated_at: string;
      last_seen_video_id?: string;
      context_snapshot?: UpdateRequestBody['context'];
    } = {
      user_email: userEmail,
      word: wordKey,
      status,
      updated_at: new Date().toISOString()
    };

    if (body.context?.video_id) {
      payload.last_seen_video_id = body.context.video_id;
    }
    if (body.context) {
      payload.context_snapshot = body.context;
    }

    const { error } = await supabase
      .from('user_vocab_status')
      .upsert(payload, {
        onConflict: 'user_email,word'
      });

    if (error) {
      console.error('[vocab/status/update] 更新失败:', error);
      return NextResponse.json(
        { error: '更新词汇状态失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[vocab/status/update] 未知错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
