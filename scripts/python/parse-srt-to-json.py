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