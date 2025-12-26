import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/response';
import { ApiError, CloudflareError } from '@/lib/utils/errors';

interface CloudflareImageResult {
  id: string;
  filename?: string;
  uploaded?: string;
  requireSignedURLs?: boolean;
  variants?: string[];
}

interface CloudflareImageResponse {
  result: CloudflareImageResult;
  success: boolean;
  errors: unknown[];
  messages: unknown[];
}

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function ensureCloudflareEnv() {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new CloudflareError('缺少 Cloudflare 环境变量（CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN）');
  }
}

function pickDeliveryUrl(variants?: string[]): string | null {
  if (!variants || variants.length === 0) return null;
  const publicVariant = variants.find((v) => v.includes('/public'));
  return publicVariant || variants[0] || null;
}

/**
 * POST /api/admin/images/upload
 *
 * 后台素材管理上传首图到 Cloudflare Images。
 * 请求体：multipart/form-data，字段名为 "file"。
 *
 * 返回：
 * {
 *   success: true,
 *   data: { id, deliveryUrl, variants }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    ensureCloudflareEnv();

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return errorResponse('缺少图片文件（字段名应为 file）', 'BAD_REQUEST', 400);
    }

    // 直接复用上传表单，只保留 file 字段，避免前端误传多余内容
    const uploadForm = new FormData();
    uploadForm.set('file', file);

    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`
      },
      body: uploadForm
    });

    const uploadJson = (await uploadRes.json()) as CloudflareImageResponse;

    if (!uploadRes.ok || !uploadJson.success) {
      throw new CloudflareError('图片上传失败', {
        status: uploadRes.status,
        body: uploadJson
      });
    }

    const imageId = uploadJson.result.id;

    // 按用户要求再次调用 Images 详情接口，获取标准的 imagedelivery.net 地址
    const detailUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1/${imageId}`;
    const detailRes = await fetch(detailUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`
      }
    });

    const detailJson = (await detailRes.json()) as CloudflareImageResponse;

    if (!detailRes.ok || !detailJson.success) {
      throw new CloudflareError('获取图片详情失败', {
        status: detailRes.status,
        body: detailJson
      });
    }

    const variants = detailJson.result.variants || [];
    const deliveryUrl = pickDeliveryUrl(variants);

    if (!deliveryUrl) {
      throw new CloudflareError('图片上传成功，但未返回可用的访问地址', {
        uploadJson,
        detailJson
      });
    }

    return successResponse({
      id: imageId,
      deliveryUrl,
      variants
    });
  } catch (error) {
    console.error('[API /admin/images/upload] 错误:', error);

    if (error instanceof ApiError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }

    const message =
      error instanceof Error
        ? error.message
        : '图片上传失败，请稍后重试';

    return errorResponse(
      message,
      'CLOUDFLARE_IMAGE_UPLOAD_FAILED',
      500
    );
  }
}
