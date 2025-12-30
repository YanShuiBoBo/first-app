import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

type VocabStatus = 'known' | 'unknown';

interface CheckRequestBody {
  words?: string[];
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
        { error: '未登录，无法查询词汇状态' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as CheckRequestBody;
    const words = Array.isArray(body.words)
      ? body.words.filter(
          w => typeof w === 'string' && w.trim().length > 0
        )
      : [];

    if (words.length === 0) {
      return NextResponse.json({});
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('user_vocab_status')
      .select('word,status')
      .eq('user_email', userEmail)
      .in('word', words);

    if (error) {
      console.error('[vocab/status/check] 查询失败:', error);
      return NextResponse.json(
        { error: '查询词汇状态失败' },
        { status: 500 }
      );
    }

    const result: Record<string, VocabStatus> = {};
    type Row = { word: string; status: VocabStatus };
    for (const row of (data || []) as Row[]) {
      const word = row.word;
      const status = row.status;
      if (!word || (status !== 'known' && status !== 'unknown')) continue;
      result[word] = status;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[vocab/status/check] 未知错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
