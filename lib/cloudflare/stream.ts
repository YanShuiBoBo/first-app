import { CloudflareError } from '@/lib/utils/errors';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

export interface DirectUploadResponse {
  result: {
    uploadURL: string;
    uid: string;
  };
  success: boolean;
  errors: any[];
  messages: any[];
}

export interface VideoMetadata {
  uid: string;
  duration: number;
  thumbnail: string;
  playback: {
    hls: string;
    dash: string;
  };
}

/**
 * 获取 Cloudflare Stream Direct Upload URL
 */
export async function getDirectUploadUrl(): Promise<{
  uploadUrl: string;
  uid: string;
}> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new CloudflareError('缺少 Cloudflare 环境变量');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      maxDurationSeconds: 3600, // 最大 1 小时
      requireSignedURLs: false   // Phase 1 不需要签名 URL
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new CloudflareError(
      `获取上传 URL 失败: ${response.status}`,
      { response: error }
    );
  }

  const data: DirectUploadResponse = await response.json();

  if (!data.success) {
    throw new CloudflareError('Cloudflare API 返回失败', { errors: data.errors });
  }

  return {
    uploadUrl: data.result.uploadURL,
    uid: data.result.uid
  };
}

/**
 * 获取视频元数据
 */
export async function getVideoMetadata(videoId: string): Promise<VideoMetadata> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new CloudflareError('缺少 Cloudflare 环境变量');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${videoId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new CloudflareError(`获取视频元数据失败: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new CloudflareError('Cloudflare API 返回失败', { errors: data.errors });
  }

  return data.result;
}