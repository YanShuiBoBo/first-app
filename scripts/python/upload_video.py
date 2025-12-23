#!/usr/bin/env python3
"""
Immersive English - 视频上传脚本

用法:
    python upload_video.py --video video.mp4 --srt subtitle.srt --title "Vlog 01"
"""

import argparse
import requests
import sys
from pathlib import Path
from tqdm import tqdm
from retry import retry

from config import Config
from srt_parser import parse_srt
from claude_processor import generate_translations_and_cards

class VideoUploader:
    """视频上传器"""

    def __init__(self):
        self.api_base = Config.API_BASE_URL
        self.headers = {
            'x-admin-secret': Config.ADMIN_SECRET
        }

    @retry(tries=3, delay=2)
    def init_upload(self) -> dict:
        """步骤 1: 获取上传 URL"""
        print("📡 正在获取上传 URL...")

        response = requests.post(
            f"{self.api_base}/api/admin/upload/init",
            headers=self.headers,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()
        if not data['success']:
            raise Exception(f"API 错误: {data['error']['message']}")

        print(f"✅ 获取成功，UID: {data['data']['uid']}")
        return data['data']

    def upload_to_cloudflare(self, upload_url: str, video_path: Path):
        """步骤 2: 上传视频到 Cloudflare"""
        print(f"☁️  正在上传视频到 Cloudflare...")

        file_size = video_path.stat().st_size

        with open(video_path, 'rb') as f:
            response = requests.post(
                upload_url,
                files={'file': f},
                timeout=3600  # 1 小时超时
            )
            response.raise_for_status()

        print("✅ 视频上传完成")

    def process_subtitles(self, srt_path: Path) -> dict:
        """步骤 3: 处理字幕"""
        print("📝 正在解析 SRT 字幕...")
        subtitles = parse_srt(str(srt_path))
        print(f"✅ 解析完成，共 {len(subtitles)} 条字幕")

        print("🤖 正在调用 Claude API 生成翻译和知识卡片...")
        subtitle_dicts = [s.to_dict() for s in subtitles]
        result = generate_translations_and_cards(subtitle_dicts)
        print(f"✅ 生成完成，共 {len(result['cards'])} 张知识卡片")

        return result

    @retry(tries=3, delay=2)
    def finalize_upload(self, cf_video_id: str, title: str,
                       duration: float, poster: str,
                       subtitles: list, cards: list):
        """步骤 4: 提交元数据"""
        print("💾 正在保存元数据到数据库...")

        payload = {
            'cf_video_id': cf_video_id,
            'meta': {
                'title': title,
                'poster': poster,
                'duration': duration
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
        if not data['success']:
            raise Exception(f"API 错误: {data['error']['message']}")

        print(f"✅ 保存成功，视频 ID: {data['data']['video_id']}")
        return data['data']

def main():
    parser = argparse.ArgumentParser(description='上传视频到 Immersive English')
    parser.add_argument('--video', required=True, help='视频文件路径 (MP4)')
    parser.add_argument('--srt', required=True, help='字幕文件路径 (SRT)')
    parser.add_argument('--title', required=True, help='视频标题')

    args = parser.parse_args()

    # 验证文件存在
    video_path = Path(args.video)
    srt_path = Path(args.srt)

    if not video_path.exists():
        print(f"❌ 视频文件不存在: {video_path}")
        sys.exit(1)

    if not srt_path.exists():
        print(f"❌ 字幕文件不存在: {srt_path}")
        sys.exit(1)

    print("=" * 60)
    print("🚀 Immersive English - 视频上传工具")
    print("=" * 60)
    print(f"视频: {video_path.name}")
    print(f"字幕: {srt_path.name}")
    print(f"标题: {args.title}")
    print("=" * 60)

    try:
        uploader = VideoUploader()

        # Step 1: 初始化上传
        upload_data = uploader.init_upload()

        # Step 2: 上传视频
        uploader.upload_to_cloudflare(upload_data['uploadUrl'], video_path)

        # Step 3: 处理字幕
        subtitle_result = uploader.process_subtitles(srt_path)

        # Step 4: 提交元数据
        # 注意: 这里需要从 Cloudflare 获取实际的 duration 和 poster
        # 简化版本使用占位符
        final_result = uploader.finalize_upload(
            cf_video_id=upload_data['uid'],
            title=args.title,
            duration=100.0,  # TODO: 从视频文件或 Cloudflare 获取
            poster=f"https://videodelivery.net/{upload_data['uid']}/thumbnails/thumbnail.jpg",
            subtitles=subtitle_result['subtitles'],
            cards=subtitle_result['cards']
        )

        print("=" * 60)
        print("🎉 上传完成！")
        print(f"视频 ID: {final_result['video_id']}")
        print(f"Cloudflare ID: {final_result['cf_video_id']}")
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