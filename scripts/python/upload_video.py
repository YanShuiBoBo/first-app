#!/usr/bin/env python3
"""
Immersive English - 视频上传脚本

用法:
    python upload_video.py --video video.mp4 --srt subtitle.srt --title "Vlog 01"
"""

import argparse
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List

import requests
from retry import retry
from tqdm import tqdm

from claude_processor import generate_translations_and_cards
from config import Config
from deepseek_client import _extract_json_block, call_deepseek_chat
from srt_parser import parse_srt

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


def select_best_segments(subtitles: List[Dict]) -> List[Dict]:
    """调用 DeepSeek 让模型挑出最有学习价值的 1-2 个片段。"""

    min_len = 90.0
    max_len = 150.0
    estimated_duration = 0.0
    try:
        estimated_duration = float(max(s.get('end', 0.0) for s in subtitles))
    except Exception:
        estimated_duration = 0.0

    # 短视频：不强行卡 90-150s，直接整段返回
    if 0 < estimated_duration <= max_len and subtitles:
        start0 = float(subtitles[0].get('start') or 0.0)
        end0 = float(subtitles[-1].get('end') or estimated_duration)
        if end0 > start0:
            return [{'start': start0, 'end': end0, 'reason': 'short video: use full'}]

    if estimated_duration < 8 * 60:
        target_segments = 1
    elif estimated_duration < 12 * 60:
        target_segments = 2
    elif estimated_duration < 18 * 60:
        target_segments = 3
    elif estimated_duration < 24 * 60:
        target_segments = 4
    else:
        target_segments = min(6, 4 + math.ceil((estimated_duration - 24 * 60) / (6 * 60)))

    system_prompt = f"""
你是英语精读选段编辑（面向 25-35 岁女性的口语精读平台）。
你的任务：从字幕时间轴中挑选若干个“连续片段”，用于剪辑成口语精读素材。

【硬性约束】
1) 每个片段时长必须在 90-150 秒之间（必须满足）。
2) start 必须等于某条字幕的 start；end 必须等于某条字幕的 end（不得自造时间）。
3) 片段之间不能重叠；按时间先后排序输出。
4) 每段必须是“连续讲同一件事/同一话题”的自然片段，不能跨场景跳切。
5) 片段结尾必须像“句子完整结束”：尽量以 . ! ? 结尾；
   不要在 and/but/so/I just/we just/you know 等未说完处截断。

【产出数量（关键）】
- 你必须按 video_hint.target_segments 输出片段数量（不要少于它，除非字幕总时长不足以满足硬性约束；不要多于它）。

【选择策略（用打分思维）】
从全片中找得分最高的片段，优先覆盖不同话题（不要几段都讲同一件事）。
每个候选片段按以下维度综合打分（高者优先）：
A. 口语学习价值（权重最高）：地道表达/短语动词/惯用语/语气词/转折衔接/可复用表达密度高。
B. 人群偏好：更像 25-35 岁女性会停下来看的话题：
   城市生活、购物、美食、穿搭、美妆护肤、职场社交、情绪与自我成长、旅行、朋友关系、观点表达。
C. 信息密度：同样 90-150 秒内“有效内容多”，少废话、少长停顿、少重复。
D. 可做精读：有清晰的小主题/小冲突/小结论（像一段完整的故事或观点）。

【输出格式】
只输出严格 JSON：
{{"segments":[{{"start":0.0,"end":120.0,"reason":"一句话说明：话题+口语亮点"}}]}}
不要输出任何其他文本。
""".strip()
    user_payload = {
        "subtitles": subtitles,
        "video_hint": {
            "estimated_duration_seconds": estimated_duration,
            "target_segments": target_segments,
        },
        "output_schema": {
            "segments": [
                {
                    "start": "片段起始秒数(浮点)",
                    "end": "片段结束秒数(浮点)",
                    "reason": "选择理由，简短中文"
                }
            ]
        },
        "rules": [
            "只输出 JSON 对象，不要输出 Markdown/解释/多余文本",
            "必须输出 exactly video_hint.target_segments 个 segments（除非总时长不足以满足 90-150 秒约束）",
            "每段必须满足：90 <= (end-start) <= 150",
            "segments 必须按 start 升序排列且互不重叠",
            "reason 必须包含：话题(女性偏好) + 口语亮点(可学表达/短语/语气)"
        ],
    }

    raw = call_deepseek_chat(system_prompt, user_payload, temperature=0.35)

    def _parse(raw_text: str) -> Dict:
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            cleaned = _extract_json_block(raw_text)
            return json.loads(cleaned)

    data = _parse(raw)
    segments = data.get('segments') or []

    valid_segments = []
    for seg in segments:
        try:
            start = float(seg['start'])
            end = float(seg['end'])
            if end <= start:
                continue
            length = end - start
            if length < min_len or length > max_len:
                continue
            valid_segments.append({
                'start': start,
                'end': end,
                'reason': seg.get('reason', '')
            })
        except Exception:
            continue

    # 去重/去重叠，保证输出稳定
    valid_segments.sort(key=lambda s: s['start'])
    deduped = []
    for seg in valid_segments:
        if not deduped:
            deduped.append(seg)
            continue
        prev = deduped[-1]
        if seg['start'] < prev['end']:
            continue
        deduped.append(seg)
        if len(deduped) >= target_segments:
            break

    if deduped:
        return deduped

    print('⚠️  DeepSeek 选段结果不满足约束，启用本地兜底选段策略')

    def _fallback_segments() -> List[Dict]:
        if not subtitles:
            return []
        try:
            duration = float(max(s.get('end', 0.0) for s in subtitles))
        except Exception:
            duration = 0.0
        if duration < min_len:
            return []

        target_len = 120.0
        min_start = 10.0
        candidates = []
        n = len(subtitles)
        for i in range(n):
            try:
                start = float(subtitles[i].get('start') or 0.0)
            except Exception:
                continue
            if start < min_start:
                continue
            target_end = min(duration, start + target_len)
            end = start
            score = 0.0
            for j in range(i, n):
                sj = subtitles[j]
                sj_start = float(sj.get('start') or 0.0)
                if sj_start > target_end:
                    break
                sj_end = float(sj.get('end') or 0.0)
                end = max(end, sj_end)
                text = str(sj.get('text_en') or '').strip()
                if not text:
                    continue
                score += len(text)
                if "'" in text:
                    score += 4
            length = end - start
            if length < min_len:
                continue
            if length > max_len:
                continue
            candidates.append((score, start, end))

        if not candidates:
            return []
        candidates.sort(key=lambda x: x[0], reverse=True)
        picked = []
        for score, start, end in candidates:
            if any(not (end <= p['start'] or start >= p['end']) for p in picked):
                continue
            picked.append({'start': start, 'end': end, 'reason': f'fallback: density={int(score)}'})
            if len(picked) >= target_segments:
                break
        return picked

    return _fallback_segments()


def _looks_like_sentence_end(text_en: str) -> bool:
    t = (text_en or '').strip()
    if not t:
        return False
    if t.lower().endswith((' and', ' but', ' so', ' or', ' because', ' i just', ' we just', ' you know')):
        return False
    return t.endswith(('.', '!', '?', '…'))


def adjust_segment_boundaries(subtitles: List[Dict], start: float, end: float,
                              min_len: float = 90.0, max_len: float = 150.0) -> tuple[float, float]:
    """调整片段边界，尽量保证结尾落在完整句子结束处。"""
    if not subtitles:
        return start, end

    start_idx = 0
    for i, s in enumerate(subtitles):
        if float(s.get('start') or 0.0) >= start:
            start_idx = i
            break

    end_idx = 0
    for i, s in enumerate(subtitles):
        if float(s.get('end') or 0.0) <= end:
            end_idx = i
        else:
            break

    for j in range(end_idx, len(subtitles)):
        j_end = float(subtitles[j].get('end') or 0.0)
        if j_end - start > max_len:
            break
        if _looks_like_sentence_end(str(subtitles[j].get('text_en') or '')):
            return start, j_end

    for j in range(end_idx, start_idx - 1, -1):
        j_end = float(subtitles[j].get('end') or 0.0)
        if j_end - start < min_len:
            break
        if _looks_like_sentence_end(str(subtitles[j].get('text_en') or '')):
            return start, j_end

    return start, end


def slice_subtitles_for_segment(subtitles: List[Dict], start: float, end: float) -> List[Dict]:
    """截取时间窗内的字幕，并把时间轴归零到片段起点。"""
    sliced = []
    for sub in subtitles:
        if sub['end'] <= start or sub['start'] >= end:
            continue
        sliced.append({
            **sub,
            'start': max(0.0, sub['start'] - start),
            'end': max(0.0, sub['end'] - start),
        })
    return sliced


def cut_clip(src: Path, start: float, end: float, out_path: Path):
    """
    使用 ffmpeg 纯截断（stream copy），不改变画质/码率。

    注意：stream copy 的切点通常会对齐到关键帧，可能出现起点略早/略晚的情况，
    但不会产生重编码导致的清晰度变化。
    """
    # 快速 seek（更快；对齐关键帧更明显）
    cmd_fast = [
        'ffmpeg', '-y',
        '-ss', str(start), '-to', str(end),
        '-i', str(src),
        '-map', '0',
        '-c', 'copy',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        str(out_path)
    ]
    try:
        subprocess.run(cmd_fast, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    except subprocess.CalledProcessError:
        pass

    # 精确 seek（更准但更慢；仍然不重编码）
    cmd_precise = [
        'ffmpeg', '-y',
        '-i', str(src),
        '-ss', str(start), '-to', str(end),
        '-map', '0',
        '-c', 'copy',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        str(out_path)
    ]
    subprocess.run(cmd_precise, check=True)


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

        # Step 1: 解析字幕
        subtitles = [s.to_dict() for s in parse_srt(str(srt_path))]

        # Step 2: 让 DeepSeek 选出 1-2 个片段
        segments = select_best_segments(subtitles)
        if not segments:
            print("❌ DeepSeek 未返回有效片段，终止")
            sys.exit(1)

        print(f"✅ 选中 {len(segments)} 个片段，将逐段处理上传")

        for idx, seg in enumerate(segments, 1):
            print("-" * 40)
            seg_start, seg_end = adjust_segment_boundaries(
                subtitles, float(seg['start']), float(seg['end']), min_len=90.0, max_len=150.0
            )
            print(f"🎯 片段 {idx}: {seg_start}s -> {seg_end}s")
            if seg.get('reason'):
                print(f"理由: {seg['reason']}")

            with tempfile.TemporaryDirectory() as td:
                clip_path = Path(td) / f"clip_{idx}.mp4"
                cut_clip(video_path, seg_start, seg_end, clip_path)

                # Step 3: 初始化上传
                upload_data = uploader.init_upload()

                # Step 4: 上传切片
                uploader.upload_to_cloudflare(upload_data['uploadUrl'], clip_path)

                # Step 5: 截取该片段的字幕并生成翻译/卡片
                sub_slice = slice_subtitles_for_segment(subtitles, seg_start, seg_end)
                subtitle_result = generate_translations_and_cards(sub_slice)

                duration = seg_end - seg_start

                # Step 6: 提交元数据
                final_result = uploader.finalize_upload(
                    cf_video_id=upload_data['uid'],
                    title=f"{args.title} - 片段{idx}",
                    duration=duration,
                    poster=f"https://videodelivery.net/{upload_data['uid']}/thumbnails/thumbnail.jpg",
                    subtitles=subtitle_result['subtitles'],
                    cards=subtitle_result['cards']
                )

                print(f"✅ 片段 {idx} 上传完成，视频 ID: {final_result['video_id']}")

        print("=" * 60)
        print("🎉 所有片段上传完成！")
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
