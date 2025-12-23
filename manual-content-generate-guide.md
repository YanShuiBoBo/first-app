# 手动生成双语字幕和知识卡片指南

## 一、操作流程概述
```
1. 解析本地 SRT 文件 → 2. 手动调用 AI 生成内容 → 3. 保存为 JSON 文件 → 4. 使用修改后的脚本上传
```

## 二、详细步骤

### 1. 解析 SRT 文件
#### 工具：
- 使用已创建的 Python 脚本：`scripts/python/parse-srt-to-json.py`（我将为您创建）
- 或在线工具：https://srt-to-json.com/

#### 操作：
```bash
# 运行解析脚本
python scripts/python/parse-srt-to-json.py your-subtitle.srt
```

**输出格式示例** (`input_for_ai.json`):
```json
{
  "subtitles": [
    { "index": 1, "start": 0.5, "end": 2.1, "text_en": "Hello everyone!" },
    { "index": 2, "start": 2.2, "end": 4.8, "text_en": "Welcome to my channel." }
  ]
}
```

---

### 2. 手动调用 AI 生成内容
#### 提示词模板（适用于 Claude/OpenAI/Gemini）：

```
请你作为一位专业的英语教学专家，处理以下英文字幕：

{input_for_ai.json 中的 subtitles 内容}

任务要求：
1. 为每条字幕提供准确、自然的中文翻译
2. 识别视频中重要的词汇、短语、习语、俚语
3. 为这些知识点生成详细的学习卡片

输出格式必须是严格的 JSON，不要包含任何其他文本，格式如下：

{
  "subtitles": [
    {
      "index": 1,
      "text_cn": "中文翻译内容"
    },
    {
      "index": 2,
      "text_cn": "第二条翻译内容"
    }
  ],
  "cards": [
    {
      "trigger_word": "识别到的词汇或短语",
      "data": {
        "ipa": "音标（如果是单词）",
        "def": "中文释义",
        "sentence": "原句或例句",
        "type": "word|phrase|idiom|slang"
      }
    }
  ]
}

注意事项：
- 翻译要符合中文表达习惯，避免逐字翻译
- 知识卡片只选择真正有学习价值的内容（5-10个）
- type 字段只能是：word=单词, phrase=短语, idiom=习语, slang=俚语
- 不要添加任何 JSON 之外的文本
```

**将 `{input_for_ai.json 中的 subtitles 内容}` 替换为第1步生成的 subtitles 数组内容即可。**

---

### 3. 保存 AI 输出
将 AI 生成的结果保存为 `ai_generated_content.json` 文件。

**输出示例** (`ai_generated_content.json`):
```json
{
  "subtitles": [
    {
      "index": 1,
      "text_cn": "大家好！"
    },
    {
      "index": 2,
      "text_cn": "欢迎来到我的频道。"
    }
  ],
  "cards": [
    {
      "trigger_word": "channel",
      "data": {
        "ipa": "/ˈtʃænl/",
        "def": "频道，渠道",
        "sentence": "Welcome to my channel.",
        "type": "word"
      }
    }
  ]
}
```

---

### 4. 合并并上传
#### 工具：
- 使用我将创建的 `scripts/python/manual-upload.py` 脚本

#### 操作：
```bash
# 运行上传脚本
python scripts/python/manual-upload.py \
  --video your-video.mp4 \
  --subtitle-input input_for_ai.json \
  --ai-output ai_generated_content.json \
  --title "你的视频标题"
```

## 三、辅助脚本创建

### 1. 解析 SRT 到 JSON 脚本
创建 `scripts/python/parse-srt-to-json.py`:

```python
#!/usr/bin/env python3
"""
将 SRT 字幕解析为 AI 输入格式的 JSON
"""

import pysrt
import json
import sys
from pathlib import Path

def srt_to_json(srt_path: Path) -> dict:
    try:
        subs = pysrt.open(srt_path, encoding='utf-8')
    except UnicodeDecodeError:
        subs = pysrt.open(srt_path, encoding='gbk')

    subtitles = []
    for i, sub in enumerate(subs, 1):
        start = sub.start.hours * 3600 + sub.start.minutes * 60 + sub.start.seconds + sub.start.milliseconds / 1000
        end = sub.end.hours * 3600 + sub.end.minutes * 60 + sub.end.seconds + sub.end.milliseconds / 1000

        subtitles.append({
            "index": i,
            "start": round(start, 3),
            "end": round(end, 3),
            "text_en": sub.text.replace('\n', ' ')
        })

    return {"subtitles": subtitles}

def main():
    if len(sys.argv) != 2:
        print("用法: python parse-srt-to-json.py subtitle.srt")
        sys.exit(1)

    srt_path = Path(sys.argv[1])
    if not srt_path.exists():
        print(f"错误: 找不到文件 {srt_path}")
        sys.exit(1)

    json_data = srt_to_json(srt_path)
    output_path = srt_path.with_suffix('.json')

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    print(f"✅ 解析完成！输出文件: {output_path}")

if __name__ == '__main__':
    main()
```

### 2. 手动上传脚本
创建 `scripts/python/manual-upload.py`:

```python
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
        payload = {
            'cf_video_id': cf_video_id,
            'meta': {
                'title': title,
                'duration': 100.0,  # 请根据实际视频时长修改
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
```

## 四、文件位置说明

| 文件类型 | 路径 |
|---------|------|
| SRT 解析脚本 | `scripts/python/parse-srt-to-json.py` |
| 手动上传脚本 | `scripts/python/manual-upload.py` |
| SRT 解析输出 | `subtitle-file.srt.json`（与 SRT 文件同目录） |
| AI 输入提示词 | 使用 `manual-content-generate-guide.md` 中的模板 |
| AI 输出 | 任意位置，推荐与 SRT 文件同目录 |

## 五、注意事项
1. 确保 AI 输出严格符合 JSON 格式，不要包含任何额外文本
2. 上传前检查视频时长是否正确
3. 确保 Cloudflare 和 Supabase 配置已完成
