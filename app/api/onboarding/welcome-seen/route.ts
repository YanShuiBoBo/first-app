import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { verifyAuthToken } from '@/lib/auth-token';

function parseAuthUser(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)auth-token=([^;]+)/);
  if (!match) return null;

  return verifyAuthToken(match[1]);
}

export async function POST(req: NextRequest) {
  try {
    const payload = parseAuthUser(req);
    if (!payload?.email) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('app_users')
      .select('onboarding_flags')
      .eq('email', payload.email)
      .maybeSingle();

    if (error) {
      console.error('[onboarding/welcome-seen] 查询失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    const flags =
      (data?.onboarding_flags as Record<string, unknown> | null) || {};

    if (flags.first_welcome_shown === true) {
      return NextResponse.json({ success: true, flags });
    }

    const nextFlags = {
      ...flags,
      first_welcome_shown: true,
      first_welcome_shown_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('app_users')
      .update({ onboarding_flags: nextFlags })
      .eq('email', payload.email);

    if (updateError) {
      console.error('[onboarding/welcome-seen] 更新失败:', updateError);
      return NextResponse.json({ error: '更新失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, flags: nextFlags });
  } catch (err) {
    console.error('[onboarding/welcome-seen] 未知错误:', err);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

