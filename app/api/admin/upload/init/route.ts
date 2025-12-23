import { NextRequest } from 'next/server';
import { getDirectUploadUrl } from '@/lib/cloudflare/stream';
import { successResponse, errorResponse } from '@/lib/utils/response';
import { ApiError, AuthError } from '@/lib/utils/errors';

/**
 * POST /api/admin/upload/init
 *
 * 获取 Cloudflare Stream 上传 URL
 * 需要 x-admin-secret Header 认证
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证管理员密钥
    const adminSecret = request.headers.get('x-admin-secret');
    if (adminSecret !== process.env.ADMIN_SECRET) {
      throw new AuthError('无效的管理员密钥');
    }

    // 2. 获取上传 URL
    const { uploadUrl, uid } = await getDirectUploadUrl();

    // 3. 返回结果
    return successResponse({
      uploadUrl,
      uid
    });

  } catch (error) {
    console.error('[API /admin/upload/init] 错误:', error);

    if (error instanceof ApiError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }

    return errorResponse('服务器内部错误');
  }
}