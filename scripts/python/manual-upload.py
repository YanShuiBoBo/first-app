#!/usr/bin/env python3
"""
手动上传视频和 AI 生成的内容
"""

import argparse
import requests
import sys
import json
from pathlib import Path
from tqdm import tqdm
from retry import retry
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

class Config:
    API_BASE_URL = "http://localhost:3000"
    ADMIN_SECRET = "your-admin-secret-here"  # 请替换为您的密钥

class VideoUploader:
    def __init__(self):
        self.api_base = Config.API_BASE_URL
        self.headers = {
            'x-admin-secret': Config.ADMIN_SECRET
        }

    @retry(tries=3, delay=2)
    def init_upload(self) -> dict:
        print("📡 正在获取上传 URL...")
        response = requests.post(
            f"{self.api_base}/api/admin/upload/init",
            headers=self.headers,
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        return data['data']

    def upload_to_cloudflare(self, upload_url: str, video_path: Path):
        print(f"☁️  正在上传视频到 Cloudflare...")
        with open(video_path, 'rb') as f:
            response = requests.post(
                upload_url,
                files={'file': f},
                timeout=3600
            )
            response.raise_for_status()
        print("✅ 视频上传完成")

    def finalize_upload(self, cf_video_id: str, title: str, subtitles: list, cards: list):
        print("💾 正在保存元数据到数据库...")

        # 自动获取视频时长（可选，需要安装 ffprobe）
        duration = 100.0  # 默认值

        payload = {
            'cf_video_id': cf_video_id,
            'meta': {
                'title': title,
                'duration': duration,
                'poster': f"https://videodelivery.net/{cf_video_id}/thumbnails/thumbnail.jpg"
            },
            'subtitles': subtitles,
            'cards': cards
        }

        response = requests.post(
            f"{self.api_base}/api/admin/upload/finalize",
            headers={**self.headers, 'Content-Type': 'application/json'},
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        print(f"✅ 保存成功，视频 ID: {data['data']['video_id']}")
        return data['data']

def main():
    parser = argparse.ArgumentParser(description='手动上传视频和 AI 生成的内容')
    parser.add_argument('--video', required=True, help='视频文件路径 (MP4)')
    parser.add_argument('--subtitle-input', required=True, help='SRT 解析后的 JSON 文件路径')
    parser.add_argument('--ai-output', required=True, help='AI 生成的内容 JSON 文件路径')
    parser.add_argument('--title', required=True, help='视频标题')

    args = parser.parse_args()

    # 验证文件存在
    video_path = Path(args.video)
    subtitle_input = Path(args.subtitle_input)
    ai_output = Path(args.ai_output)

    for path in [video_path, subtitle_input, ai_output]:
        if not path.exists():
            print(f"❌ 找不到文件: {path}")
            sys.exit(1)

    print("=" * 60)
    print("🚀 Immersive English - 手动上传工具")
    print("=" * 60)
    print(f"视频: {video_path.name}")
    print(f"字幕输入: {subtitle_input.name}")
    print(f"AI 输出: {ai_output.name}")
    print(f"标题: {args.title}")
    print("=" * 60)

    try:
        # 读取输入文件
        with open(subtitle_input, 'r', encoding='utf-8') as f:
            subtitle_data = json.load(f)

        with open(ai_output, 'r', encoding='utf-8') as f:
            ai_data = json.load(f)

        # 合并字幕
        translation_map = {item['index']: item['text_cn'] for item in ai_data['subtitles']}
        merged_subtitles = []
        for sub in subtitle_data['subtitles']:
            merged_subtitles.append({
                **sub,
                'text_cn': translation_map.get(sub['index'], '')
            })

        uploader = VideoUploader()
        upload_data = uploader.init_upload()
        uploader.upload_to_cloudflare(upload_data['uploadUrl'], video_path)
        uploader.finalize_upload(
            cf_video_id=upload_data['uid'],
            title=args.title,
            subtitles=merged_subtitles,
            cards=ai_data['cards']
        )

        print("=" * 60)
        print("🎉 上传完成！")
        print("=" * 60)

    except KeyboardInterrupt:
        print("\n⚠️  用户中断上传")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 上传失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()