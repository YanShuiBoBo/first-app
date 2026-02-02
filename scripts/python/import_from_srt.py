#!/usr/bin/env python3
"""
Immersive English - 基于 SRT / ASR 的全自动导入脚本

目标：在尽可能依赖「脚本 + 校验」的前提下，引入 LLM 的翻译与知识点结果，
保证最终入库的数据结构稳定、可控。

流程（单个目录）：
1. 目录约定：
   - output.mp4（或任意一个 .mp4 视频）
   - ${title}-${author}.srt 字幕文件
   - 若干封面图（*.png/*.jpg/*.jpeg/*.webp，可选）
2. 通过 /api/admin/upload/init 获取 Cloudflare Stream 直传 URL；
3. 上传视频到 Cloudflare，拿到 cf_video_id；
4. 上传封面图片到 /api/admin/images/upload，拿到 imagedelivery.net 地址；
5. 使用 srt_cleaner 解析和清洗 SRT（或使用 Whisper ASR 从音频生成字幕骨架）；
6. 调用 DeepSeek（deepseek_client.annotate_subtitles）生成：
   - 中文标题、简介、难度、标签；
   - 每句字幕的 text_cn；
   - 知识卡片数组；
7. 使用 content_validator 对 LLM 输出做严格约束：
   - difficulty 限制在 1-3；
   - tags 数量和类型规范化；
   - subtitles：强制沿用 skeleton 的 start/end/text_en，仅采用 text_cn；
   - knowledge：过滤不完整或非法 type 的卡片；
8. 调用 /api/admin/upload/finalize 入库。

使用示例：

  单个目录：
    python scripts/python/import_from_srt.py --dir "/path/to/视频标题-作者"

  批量导入根目录下所有子目录：
    python scripts/python/import_from_srt.py --root "/path/to/materials"
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

from srt_cleaner import build_skeleton_json, load_and_clean_srt, time_to_ms
from deepseek_client import annotate_subtitles, call_deepseek_chat, _extract_json_block
from content_validator import validate_and_merge, debug_pretty_print


# 依次尝试加载 .env 和 .env.local，保证可以复用 Next.js 的本地配置
load_dotenv()
load_dotenv(".env.local", override=False)


API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")


def coerce_time_to_seconds(value: Any) -> float:
  """
  将字幕中的 start/end 统一转换为秒数（float）。
  - ASR 返回通常已经是 number；
  - srt_cleaner.load_and_clean_srt 返回的是 "HH:MM:SS,mmm" 字符串。
  """
  if isinstance(value, (int, float)):
    return float(value)
  # 有些路径可能已经是数字字符串
  try:
    return float(str(value).strip())
  except Exception:
    return time_to_ms(str(value)) / 1000.0


def normalize_subtitles_to_seconds(subtitles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
  """把字幕骨架的 start/end 强制转为秒数，保证后续选段/切片/对齐逻辑可用。"""
  normalized: List[Dict[str, Any]] = []
  for item in subtitles:
    try:
      start = coerce_time_to_seconds(item.get("start", 0))
      end = coerce_time_to_seconds(item.get("end", 0))
    except Exception:
      continue
    if end <= start:
      continue
    normalized.append(
      {
        **item,
        "start": start,
        "end": end,
      }
    )
  return normalized


def require_env(name: str) -> str:
  """读取必须存在的环境变量，没有就退出。"""
  value = os.getenv(name)
  if not value:
    print(f"缺少环境变量: {name}")
    sys.exit(1)
  return value


def init_upload() -> Dict[str, Any]:
  """调用 /api/admin/upload/init 获取直传 uploadUrl + uid。"""
  admin_secret = require_env("ADMIN_SECRET")

  print("Step 1: 获取 Cloudflare 上传 URL...")
  resp = requests.post(
    f"{API_BASE_URL}/api/admin/upload/init",
    headers={"x-admin-secret": admin_secret},
    json={},
    timeout=30,
  )
  resp.raise_for_status()
  data = resp.json()

  if not data.get("success"):
    raise RuntimeError(f"init 接口返回错误: {data}")

  result = data["data"]
  print(f"  -> 成功获取上传 URL，UID: {result['uid']}")
  return result


def upload_to_cloudflare(upload_url: str, video_path: Path) -> None:
  """把本地 MP4 上传到 Cloudflare 直传 URL。"""
  print(f"Step 2: 上传视频到 Cloudflare Stream: {video_path}")

  size_mb = video_path.stat().st_size / (1024 * 1024)
  print(f"  -> 视频文件大小约为 {size_mb:.1f} MB")

  # Cloudflare 单次表单上传在约 200MB 左右存在上限，更大的文件推荐使用 tus 分片协议。
  # 当前脚本暂未实现 tus，因此在大文件时提前给出友好提示，避免 413 错误迷惑用户。
  if size_mb > 190:
    raise RuntimeError(
      "当前脚本使用的是 Cloudflare Stream 的表单直传方式，单次上传在 200MB 左右会返回 413。"
      f" 当前文件大小约为 {size_mb:.1f} MB，请考虑先用 ffmpeg 压缩到 180MB 以内，"
      "或后续改造脚本为 tus 分片上传。"
    )

  with open(video_path, "rb") as f:
    resp = requests.post(
      upload_url,
      files={"file": f},
      timeout=3600,
    )
    try:
      resp.raise_for_status()
    except requests.HTTPError as exc:
      if resp.status_code == 413:
        raise RuntimeError(
          "上传到 Cloudflare 时收到 413 Payload Too Large。"
          " 这通常表示当前直传方式的视频体积超过了 Cloudflare 对单次上传的限制。"
          " 建议先将视频压缩到更小（例如 1080p/更低码率，目标 < 180MB），"
          "或后续将脚本改造为使用 tus 分片上传协议。"
        ) from exc
      raise

  print("  -> 视频上传完成")


def fetch_cf_metadata(uid: str, max_attempts: int = 10, delay_sec: int = 10) -> Dict[str, Any]:
  """
  轮询 Cloudflare Stream API 获取视频元信息（duration、thumbnail 等）。

  - 最多轮询 max_attempts 次，每次间隔 delay_sec 秒；
  - 优先等待 readyToStream 为 true。
  """
  account_id = require_env("CF_ACCOUNT_ID")
  token = require_env("CF_STREAM_TOKEN")

  url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/stream/{uid}"
  headers = {"Authorization": f"Bearer {token}"}

  last_result: Dict[str, Any] = {}

  for attempt in range(1, max_attempts + 1):
    print(f"Step 3: 查询 Cloudflare 视频信息 (尝试 {attempt}/{max_attempts})...")
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    result = data.get("result", data)
    last_result = result
    ready = result.get("readyToStream")
    state = result.get("status", {}).get("state")

    duration = result.get("duration")
    thumbnail = result.get("thumbnail")
    preview = result.get("preview")

    if ready or state == "ready":
      print("  -> Cloudflare 视频已就绪")
      return {
        "duration": float(duration) if duration is not None else 0.0,
        "poster": thumbnail or preview,
        "raw": result,
      }

    print(
      f"  -> 视频还未就绪 (state={state}, readyToStream={ready})，"
      f"等待 {delay_sec} 秒后重试..."
    )
    time.sleep(delay_sec)

  print("  -> 等待 Cloudflare 就绪超时，将使用当前可用的字段继续")
  duration = float(last_result.get("duration") or 0.0)
  poster = last_result.get("thumbnail") or last_result.get("preview")
  return {"duration": duration, "poster": poster, "raw": last_result}


def upload_cover_image(image_path: Path) -> Optional[Tuple[str, str]]:
  """
  调用后端 /api/admin/images/upload 上传首图到 Cloudflare Images。

  返回 (image_id, delivery_url) 或 None（出错时）。
  """
  admin_secret = require_env("ADMIN_SECRET")

  print(f"Step 4: 上传首图到 Cloudflare Images: {image_path.name}")

  url = f"{API_BASE_URL}/api/admin/images/upload"

  with open(image_path, "rb") as f:
    files = {"file": (image_path.name, f, "image/*")}
    resp = requests.post(
      url,
      headers={"x-admin-secret": admin_secret},
      files=files,
      timeout=60,
    )

  try:
    data = resp.json()
  except Exception:
    print(f"  -> 警告：封面上传返回非 JSON 内容：{resp.text}")
    return None

  if resp.status_code >= 400 or not data.get("success"):
    print("  -> 警告：封面上传失败，将回退到视频缩略图或占位图：")
    try:
      print(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception:
      print(data)
    return None

  result = data.get("data") or {}
  image_id = result.get("id")
  delivery_url = result.get("deliveryUrl")

  if not image_id or not delivery_url:
    print("  -> 警告：封面上传成功但未返回 id/deliveryUrl")
    return None

  print(f"  -> 封面上传成功，Image ID={image_id}")
  return image_id, delivery_url


def find_video_file(dir_path: Path) -> Path:
  """
  在目录中选择视频文件：
  - 优先使用已存在的 output.mp4；
  - 否则：
    - 如果同时存在一个 mp4（视频画面）和一个 m4a（独立音轨），使用 ffmpeg 合成 output.mp4；
    - 否则退回到第一个 *.mp4。
  """
  output_mp4 = dir_path / "output.mp4"
  if output_mp4.is_file():
    return output_mp4

  # 查找候选视频 / 音频文件
  mp4_candidates = sorted(
    p for p in dir_path.glob("*.mp4") if p.name.lower() != "output.mp4"
  )
  m4a_candidates = sorted(dir_path.glob("*.m4a"))

  if mp4_candidates and m4a_candidates:
    video_src = mp4_candidates[0]
    audio_src = m4a_candidates[0]
    print(f"  -> 检测到独立视频和音频文件，将使用 ffmpeg 合成 output.mp4:")
    print(f"     视频: {video_src.name}")
    print(f"     音频: {audio_src.name}")

    # 使用 ffmpeg 合并：视频轨直接拷贝，音频转为 AAC，时长取较短的一方
    cmd = [
      "ffmpeg",
      "-y",  # 覆盖已有 output.mp4（如果存在）
      "-i",
      str(video_src),
      "-i",
      str(audio_src),
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      str(output_mp4),
    ]

    try:
      subprocess.run(cmd, check=True)
      print("  -> ffmpeg 合成完成，后续流程将使用 output.mp4")
      return output_mp4
    except FileNotFoundError:
      print("  -> 警告：未找到 ffmpeg 命令，改为直接使用原始 mp4 视频（无独立音轨合成）")
    except subprocess.CalledProcessError as exc:
      print(f"  -> 警告：ffmpeg 合成 output.mp4 失败（退出码 {exc.returncode}），将退回使用原始 mp4 视频")

  # 没有 m4a，或者 ffmpeg 不可用 / 合成失败时，退回到第一个 mp4
  if mp4_candidates:
    return mp4_candidates[0]

  raise FileNotFoundError(f"目录中未找到 mp4 文件: {dir_path}")


def find_cover_image_file(dir_path: Path) -> Optional[Path]:
  """
  在目录中寻找首图文件：
  - 支持 png / jpg / jpeg / webp；
  - 不递归子目录；
  - 取第一个匹配项。
  """
  patterns = ("*.png", "*.jpg", "*.jpeg", "*.webp")
  for pattern in patterns:
    for p in sorted(dir_path.glob(pattern)):
      if p.is_file():
        return p
  return None


def find_srt_file(dir_path: Path) -> Path:
  """
  在目录中寻找 SRT 字幕：
  - 优先匹配模式: *.srt；
  - 如有多个，以排序后的第一个为准。

  目录命名建议：`标题-作者`，SRT 文件名与之一致，但脚本不强制检查。
  """
  candidates = sorted(dir_path.glob("*.srt"))
  if not candidates:
    raise FileNotFoundError(f"目录中未找到 SRT 文件: {dir_path}")
  return candidates[0]


def parse_title_and_author_from_dir(dir_path: Path) -> Tuple[str, str]:
  """
  从目录名中仅解析作者，标题交给字幕 + LLM 自动生成。

  约定：目录名仍建议使用 `标题-作者` 形式，但这里只把 `-` 后面的部分当作作者，
  避免把文件夹名字误用为最终视频标题。
  """
  name = dir_path.name.strip()
  if "&&" in name:
    # 只取 `-` 后的部分作为作者；标题留空，由 DeepSeek 根据字幕内容生成
    _, author = name.split("&&", 1)
    return "", author.strip()
  # 没有 `-` 时，作者留空，标题同样交给 LLM
  return "", ""


def build_finalize_payload(
  cf_video_id: str,
  meta_from_llm: Dict[str, Any],
  subtitles: List[Dict[str, Any]],
  knowledge: List[Dict[str, Any]],
  cf_meta: Dict[str, Any],
  poster_url: Optional[str],
  cover_image_id: Optional[str],
) -> Dict[str, Any]:
  """根据各阶段结果构造 /api/admin/upload/finalize 的 payload。"""
  duration = float(cf_meta.get("duration") or 0.0)

  # poster 优先级：封面图 -> Cloudflare 缩略图 -> 占位图
  poster = poster_url or cf_meta.get("poster")
  if not poster:
    poster = f"https://videodelivery.net/{cf_video_id}/thumbnails/thumbnail.jpg"

  meta = {
    "title": meta_from_llm["meta"]["title"],
    "poster": poster,
    "duration": duration,
  }

  m = meta_from_llm["meta"]
  if m.get("author"):
    meta["author"] = m["author"]
  if m.get("description"):
    meta["description"] = m["description"]
  if m.get("difficulty") is not None:
    meta["difficulty"] = int(m["difficulty"])
  if m.get("tags"):
    meta["tags"] = m["tags"]
  if cover_image_id:
    meta["cover_image_id"] = cover_image_id

  # 将字幕的 start/end 统一归一为秒数（number），符合后端 Zod 校验
  normalized_subtitles: List[Dict[str, Any]] = []
  for item in subtitles:
    start_raw = item.get("start", 0)
    end_raw = item.get("end", 0)

    if isinstance(start_raw, (int, float)) and isinstance(end_raw, (int, float)):
      start_sec = float(start_raw)
      end_sec = float(end_raw)
    else:
      # 假定是 "HH:MM:SS,mmm" 字符串，回落到毫秒转换
      try:
        start_sec = time_to_ms(str(start_raw)) / 1000.0
        end_sec = time_to_ms(str(end_raw)) / 1000.0
      except Exception:
        start_sec = 0.0
        end_sec = 0.0

    normalized_subtitles.append(
      {
        "start": start_sec,
        "end": end_sec,
        "text_en": item.get("text_en", ""),
        "text_cn": item.get("text_cn", ""),
      }
    )

  payload: Dict[str, Any] = {
    "cf_video_id": cf_video_id,
    "meta": meta,
    "subtitles": normalized_subtitles,
    "cards": knowledge,
  }
  return payload


def finalize_upload(payload: Dict[str, Any]) -> Dict[str, Any]:
  """调用 /api/admin/upload/finalize 保存到 Supabase。"""
  admin_secret = require_env("ADMIN_SECRET")

  print("Step 8: 保存视频到平台 (finalize)...")
  resp = requests.post(
    f"{API_BASE_URL}/api/admin/upload/finalize",
    headers={
      "x-admin-secret": admin_secret,
      "Content-Type": "application/json",
    },
    json=payload,
    timeout=60,
  )

  try:
    data = resp.json()
  except Exception:
    print(f"  -> finalize 返回的非 JSON 内容：{resp.text}")
    resp.raise_for_status()
    raise

  if resp.status_code >= 400:
    print(f"  -> finalize 返回错误状态码: {resp.status_code}")
    print("  -> 返回内容:")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    resp.raise_for_status()

  if not data.get("success"):
    print("  -> finalize 接口 success=false，详细信息如下：")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    raise RuntimeError(f"finalize 接口返回错误: {data}")

  print(f"  -> 保存成功，video_id={data['data']['video_id']}")
  return data["data"]


def is_done(dir_path: Path) -> bool:
  """检测目录是否已经导入过。"""
  done_file = dir_path / ".immersive_uploaded.json"
  return done_file.exists()


def mark_done(dir_path: Path, records: List[Dict[str, str]]) -> None:
  """在目录下写入一个标记文件，避免重复导入。支持多片段记录。"""
  done_file = dir_path / ".immersive_uploaded.json"
  payload = {"uploads": records}
  try:
    done_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
  except Exception as exc:
    print(f"  -> 警告：写入标记文件失败（不影响导入结果）: {exc}")


def select_best_segments(subtitles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
  """
  调用 DeepSeek 让模型挑选若干个最有学习价值的连续片段。
  返回 [{start: float, end: float, reason: str}, ...]
  """
  min_len = 90.0
  max_len = 150.0
  estimated_duration = 0.0
  try:
    estimated_duration = float(max(s.get("end", 0.0) for s in subtitles))
  except Exception:
    estimated_duration = 0.0

  # 短视频：不强行卡 90-150s，直接整段返回（避免“选不出片段”导致流程中断）
  if 0 < estimated_duration <= max_len:
    start0 = float(subtitles[0].get("start") or 0.0)
    end0 = float(subtitles[-1].get("end") or estimated_duration)
    if end0 > start0:
      return [{"start": start0, "end": end0, "reason": "short video: use full"}]

  # 片段数量随视频时长增长：10 分钟左右默认 2 段；更长则相应增加。
  # 约束上限是为了控制后续 ASR + LLM 成本，避免一次导入跑太久。
  if estimated_duration < 5 * 60:
    target_segments = 1
  elif estimated_duration < 10 * 60:
    target_segments = 2
  elif estimated_duration < 15 * 60:
    target_segments = 3
  elif estimated_duration < 20 * 60:
    target_segments = 4
  else:
    target_segments = min(6, 4 + math.ceil((estimated_duration - 24 * 60) / (5 * 60)))

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
        {"start": "片段起始秒数(浮点)", "end": "片段结束秒数(浮点)", "reason": "选择理由，简短中文"}
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

  raw = call_deepseek_chat(system_prompt, user_payload,model = "deepseek-reasoner",temperature=0.35)

  def _parse(raw_text: str) -> Dict[str, Any]:
    try:
      return json.loads(raw_text)
    except json.JSONDecodeError:
      cleaned = _extract_json_block(raw_text)
      return json.loads(cleaned)

  data = _parse(raw)
  segments = data.get("segments") or []

  valid_segments: List[Dict[str, Any]] = []
  for seg in segments:
    try:
      start = float(seg["start"])
      end = float(seg["end"])
      if end <= start:
        continue
      length = end - start
      if length < min_len or length > max_len:
        continue
      valid_segments.append({"start": start, "end": end, "reason": seg.get("reason", "")})
    except Exception:
      continue

  valid_segments.sort(key=lambda s: float(s["start"]))
  deduped: List[Dict[str, Any]] = []
  for seg in valid_segments:
    if not deduped:
      deduped.append(seg)
      continue
    prev = deduped[-1]
    if float(seg["start"]) < float(prev["end"]):
      continue
    deduped.append(seg)
    if len(deduped) >= target_segments:
      break

  if deduped:
    return deduped

  # Fallback: 如果模型没按约束返回片段（或全部被过滤），用“字幕密度”做兜底选段。
  # 目标：确保长视频不会因为 LLM 一次失常就完全中断导入流程。
  print("  -> 警告：DeepSeek 选段结果不满足约束，将尝试候选片段二次选择 + 本地兜底策略")
  try:
    preview = raw.strip().replace("\n", " ")
    print(f"  -> DeepSeek 原始输出预览: {preview[:240]}{'...' if len(preview) > 240 else ''}")
  except Exception:
    pass

  def _fallback_segments_from_subtitles() -> List[Dict[str, Any]]:
    if not subtitles:
      return []

    # 估算全片时长
    try:
      duration = float(max(s.get("end", 0.0) for s in subtitles))
    except Exception:
      duration = 0.0

    if duration < min_len:
      return []

    target_len = 120.0
    # 避免片头/片尾的寒暄与收尾（但不做硬性限制）
    min_start = 10.0

    candidates: List[Tuple[float, float, float]] = []
    n = len(subtitles)

    for i in range(n):
      s0 = subtitles[i]
      try:
        start = float(s0.get("start") or 0.0)
      except Exception:
        continue

      if start < min_start:
        continue

      target_end = min(duration, start + target_len)

      # 向后找到该窗口内的最后一条字幕，以其 end 作为片段 end（自然边界）
      end = start
      score = 0.0
      for j in range(i, n):
        sj = subtitles[j]
        sj_start = float(sj.get("start") or 0.0)
        if sj_start > target_end:
          break
        sj_end = float(sj.get("end") or 0.0)
        end = max(end, sj_end)
        text = str(sj.get("text_en") or "").strip()
        if not text:
          continue
        # “字幕密度”近似：字符数 + 含缩写（更口语）小加分
        score += len(text)
        if "'" in text:
          score += 4

      length = end - start
      if length < min_len:
        continue
      if length > max_len:
        # 太长就截到 start+max_len，并重新找自然的 end
        target_end2 = start + max_len
        end2 = start
        score2 = 0.0
        for j in range(i, n):
          sj = subtitles[j]
          sj_start = float(sj.get("start") or 0.0)
          if sj_start > target_end2:
            break
          sj_end = float(sj.get("end") or 0.0)
          end2 = max(end2, sj_end)
          text = str(sj.get("text_en") or "").strip()
          if not text:
            continue
          score2 += len(text)
          if "'" in text:
            score2 += 4
        end = end2
        score = score2

      length = end - start
      if length < min_len or length > max_len:
        continue

      candidates.append((score, start, end))

    if not candidates:
      return []

    candidates.sort(key=lambda x: x[0], reverse=True)

    max_pick = max(8, target_segments)
    picked: List[Dict[str, Any]] = []
    for score, start, end in candidates:
      if any(not (end <= p["start"] or start >= p["end"]) for p in picked):
        continue
      picked.append(
        {
          "start": start,
          "end": end,
          "reason": f"fallback: 字幕密度高(score={int(score)})",
        }
      )
      if len(picked) >= max_pick:
        break

    return picked

  fallback_candidates = _fallback_segments_from_subtitles()
  if not fallback_candidates:
    return []

  # 二次调用 DeepSeek：只在少量候选片段中做选择，显著降低上下文长度，提高稳定性。
  try:
    condensed_prompt = (
      "你是英语精读选段编辑。下面给你若干个候选片段（每个都已经是 90-150 秒的连续区间）。\n"
      "请从中选择最适合 25-35 岁女性用户的 1-2 个片段：\n"
      "- 优先话题更感兴趣（城市生活/购物/美食/穿搭/护肤/职场社交/情绪与成长/旅行/朋友关系/观点表达）\n"
      "- 同时口语学习价值高（可复用表达、地道口语、高频短语、语气词、转折衔接）\n"
      "输出必须是严格 JSON：{\"segments\":[{\"start\":...,\"end\":...,\"reason\":\"...\"}]}\n"
      "start/end 必须严格等于候选片段给定的 start/end，不要改动数字。"
    )

    # 取前 8 个候选，给出少量英文片段摘要帮助判断
    candidates_payload: List[Dict[str, Any]] = []
    for idx, c in enumerate(fallback_candidates[:8], 1):
      start = float(c["start"])
      end = float(c["end"])
      excerpt_parts: List[str] = []
      for s in subtitles:
        st = float(s.get("start") or 0.0)
        if st < start:
          continue
        if st > end:
          break
        t = str(s.get("text_en") or "").strip()
        if t:
          excerpt_parts.append(t)
        if sum(len(x) for x in excerpt_parts) > 650:
          break
      candidates_payload.append(
        {
          "id": idx,
          "start": start,
          "end": end,
          "excerpt_en": " ".join(excerpt_parts)[:700],
        }
      )

    raw2 = call_deepseek_chat(
      system_prompt=condensed_prompt,
      user_payload={
        "target_segments": target_segments,
        "candidates": candidates_payload,
      },
      temperature=0.2,
    )
    data2 = _parse(raw2)
    segs2 = data2.get("segments") or []
    picked2: List[Dict[str, Any]] = []
    allowed = {(c["start"], c["end"]) for c in candidates_payload}
    for seg in segs2:
      try:
        s = float(seg["start"])
        e = float(seg["end"])
        if (s, e) not in allowed:
          continue
        picked2.append({"start": s, "end": e, "reason": str(seg.get("reason") or "")})
      except Exception:
        continue
    if picked2:
      picked2.sort(key=lambda x: x["start"])
      return picked2[:target_segments]
  except Exception:
    pass

  return fallback_candidates[:target_segments]


def _looks_like_sentence_end(text_en: str) -> bool:
  t = (text_en or "").strip()
  if not t:
    return False
  # A lightweight heuristic to avoid obvious mid-clause endings.
  if t.lower().endswith((" and", " but", " so", " or", " because", " i just", " we just", " you know")):
    return False
  return t.endswith((".", "!", "?", "…"))


def adjust_segment_boundaries(
  subtitles: List[Dict[str, Any]],
  start: float,
  end: float,
  min_len: float = 90.0,
  max_len: float = 150.0,
) -> Tuple[float, float]:
  """
  调整片段边界，尽量保证片段结尾落在一个“完整句子”结束处。
  - 优先向后延伸到下一个句号/问号/感叹号结尾（不超过 max_len）
  - 否则向前回退到最近的句末（仍满足 min_len）
  """
  if not subtitles:
    return start, end

  # 找到片段起点附近的字幕索引
  start_idx = 0
  for i, s in enumerate(subtitles):
    if float(s.get("start") or 0.0) >= start:
      start_idx = i
      break

  # 找到片段终点所在的字幕索引（end 应该来自字幕的 end）
  end_idx = 0
  for i, s in enumerate(subtitles):
    if float(s.get("end") or 0.0) <= end:
      end_idx = i
    else:
      break

  # 先尝试向后找一个更自然的句末
  for j in range(end_idx, len(subtitles)):
    j_end = float(subtitles[j].get("end") or 0.0)
    if j_end - start > max_len:
      break
    if _looks_like_sentence_end(str(subtitles[j].get("text_en") or "")):
      return start, j_end

  # 再尝试向前回退到最近的句末
  for j in range(end_idx, start_idx - 1, -1):
    j_end = float(subtitles[j].get("end") or 0.0)
    if j_end - start < min_len:
      break
    if _looks_like_sentence_end(str(subtitles[j].get("text_en") or "")):
      return start, j_end

  return start, end


def slice_subtitles_for_segment(
  subtitles: List[Dict[str, Any]], start: float, end: float
) -> List[Dict[str, Any]]:
  """截取时间窗内的字幕，并把时间轴归零到片段起点。"""
  sliced: List[Dict[str, Any]] = []
  for sub in subtitles:
    if sub["end"] <= start or sub["start"] >= end:
      continue
    sliced.append(
      {
        **sub,
        "start": max(0.0, sub["start"] - start),
        "end": max(0.0, sub["end"] - start),
      }
    )
  return sliced


def cut_clip(src: Path, start: float, end: float, out_path: Path) -> None:
  """
  使用 ffmpeg 纯截断（stream copy），不改变画质/码率。

  注意：stream copy 的切点通常会对齐到关键帧，可能出现起点略早/略晚的情况，
  但不会产生重编码导致的清晰度变化。
  """
  cmd_fast = [
    "ffmpeg",
    "-y",
    "-ss",
    str(start),
    "-to",
    str(end),
    "-i",
    str(src),
    "-map",
    "0",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-avoid_negative_ts",
    "make_zero",
    str(out_path),
  ]
  try:
    subprocess.run(cmd_fast, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not out_path.is_file():
      raise RuntimeError(f"切片失败，未生成文件: {out_path}")
    return
  except subprocess.CalledProcessError:
    pass

  cmd_precise = [
    "ffmpeg",
    "-y",
    "-i",
    str(src),
    "-ss",
    str(start),
    "-to",
    str(end),
    "-map",
    "0",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-avoid_negative_ts",
    "make_zero",
    str(out_path),
  ]
  subprocess.run(cmd_precise, check=True)

  if not out_path.is_file():
    raise RuntimeError(f"切片失败，未生成文件: {out_path}")


def process_dir(
  dir_path: Path,
  force: bool = False,
  dry_run: bool = False,
  source: str = "srt",
  asr_model: str = "medium",
  clip_asr: bool = True,
) -> None:
  """处理单个目录：上传 + 清洗 + LLM + 校验 + 入库。"""
  print()
  print("=" * 60)
  print(f"处理目录: {dir_path}")

  if is_done(dir_path) and not force:
    print("  -> 检测到已存在 .immersive_uploaded.json，默认跳过（如需重新导入请使用 --force）")
    return

  try:
    video_path = find_video_file(dir_path)
  except Exception as exc:
    print(f"  -> 跳过目录（未找到视频文件）: {exc}")
    return

  srt_path: Optional[Path] = None
  if source == "srt":
    try:
      srt_path = find_srt_file(dir_path)
    except Exception as exc:
      print(f"  -> 跳过目录（未找到 SRT 字幕文件）: {exc}")
      return

  title, author = parse_title_and_author_from_dir(dir_path)
  print(f"  -> 标题: {title}")
  if author:
    print(f"  -> 作者: {author}")
  print(f"  -> 视频: {video_path.name}")
  if source == "srt" and srt_path is not None:
    print(f"  -> 字幕(SRT): {srt_path.name}")
  elif source == "asr":
    print("  -> 字幕来源: ASR (Whisper / stable-ts)")

  # 4.x 封面图（可选）
  cover_image_path = find_cover_image_file(dir_path)
  cover_image_id: Optional[str] = None
  poster_url: Optional[str] = None

  if cover_image_path is not None:
    try:
      result = upload_cover_image(cover_image_path)
      if result is not None:
        cover_image_id, poster_url = result
    except Exception as exc:
      print(f"  -> 封面图上传失败，将回退到视频缩略图: {exc}")

  # Step 5: 生成英文字幕骨架（SRT 或 ASR）
  if source == "asr":
    from asr_whisper import generate_subtitles_from_audio

    print("Step 5: 使用 Whisper (stable-ts) 从音频生成英文字幕骨架...")
    skeleton_subtitles = generate_subtitles_from_audio(
      video_path,
      model_size=asr_model,
      language="en",
    )
  else:
    print("Step 5: 清洗 SRT 字幕并生成英文骨架...")
    if srt_path is None:
      raise RuntimeError("SRT 模式需要有效的字幕文件路径")
    skeleton_subtitles = load_and_clean_srt(srt_path)

  # 统一时间轴为秒数，避免后续选段/切片阶段因为字符串时间戳导致无法比较/计算。
  skeleton_subtitles = normalize_subtitles_to_seconds(skeleton_subtitles)

  skeleton = build_skeleton_json(title=title, author=author, subtitles=skeleton_subtitles)
  print(f"  -> 清洗后字幕行: {(len(skeleton_subtitles))}")

  # Step 6: 让 DeepSeek 先选出 1-2 个片段
  print("Step 6: 调用 DeepSeek 选出最有学习价值的片段...")
  segments = select_best_segments(skeleton_subtitles)
  if not segments:
    print("  -> DeepSeek 未返回有效片段，终止")
    return
  print(f"  -> 选中 {len(segments)} 个片段，将逐段处理上传")

  upload_records: List[Dict[str, str]] = []
  clip_dir = dir_path / ".clips_tmp"
  clip_dir.mkdir(parents=True, exist_ok=True)

  for idx, seg in enumerate(segments, 1):
    print("-" * 50)
    print(f"🎯 片段 {idx}: {seg['start']}s -> {seg['end']}s")
    if seg.get("reason"):
      print(f"理由: {seg['reason']}")

    # 调整边界，尽量落在完整句子结束处（避免 “我只...” 这种没说完的结尾）
    seg_start, seg_end = adjust_segment_boundaries(
      skeleton_subtitles,
      float(seg["start"]),
      float(seg["end"]),
      min_len=90.0,
      max_len=150.0,
    )

    # Step 7: 先切片（画质不变），再对片段做 ASR，保证字幕与片段时间轴精准对齐
    clip_path = clip_dir / f"{dir_path.name}_clip_{idx}.mp4"
    cut_clip(video_path, seg_start, seg_end, clip_path)
    if not clip_path.is_file():
      raise RuntimeError(f"切片文件未生成: {clip_path}")
    print(f"  -> 切片完成：{clip_path} ({clip_path.stat().st_size/1024/1024:.2f} MB)")

    clip_title = (title or "无标题") + f" - 片段{idx}"

    if clip_asr:
      from asr_whisper import generate_subtitles_from_audio

    if clip_asr:
      from asr_whisper import generate_subtitles_from_audio

      print("Step 7: 使用 Whisper (stable-ts) 对片段生成英文字幕骨架...")
      clip_subtitles = generate_subtitles_from_audio(
        clip_path,
        model_size=asr_model,
        language="en",
      )
      print(f"  -> 片段 ASR 完成，字幕行数: {len(clip_subtitles)}")
    else:
      print("Step 7: 使用原视频字幕切片作为片段英文字幕骨架（可能存在时间偏移）...")
      clip_subtitles = slice_subtitles_for_segment(skeleton_subtitles, seg_start, seg_end)

    if not clip_subtitles:
      print("  -> 片段字幕骨架为空，跳过")
      continue

    skeleton_clip = build_skeleton_json(title=clip_title, author=author, subtitles=clip_subtitles)

    # Step 8: 调用 DeepSeek 生成片段翻译 + 知识卡片
    print("Step 8: 调用 DeepSeek 生成片段翻译 + 知识卡片...")
    llm_output = annotate_subtitles(skeleton_clip)

    # Step 9: 校验与合并
    print("Step 9: 校验并规整片段数据结构...")
    merged = validate_and_merge(skeleton_clip, llm_output)
    meta_clean = merged["meta"]
    subtitles_clean = merged["subtitles"]
    knowledge_clean = merged["knowledge"]

    # 将选段理由写入简介，便于后续小红书笔记快速引用“话题+口语亮点”
    reason_text = str(seg.get("reason") or "").strip()
    if reason_text:
      extra_note = f"片段亮点：{reason_text}"
      if meta_clean.get("description"):
        meta_clean["description"] = f"{meta_clean['description']}\n{extra_note}"
      else:
        meta_clean["description"] = extra_note

    print("  -> 片段摘要：")
    print(f"     标题: {meta_clean['title']}")
    print(f"     字幕行数: {len(subtitles_clean)}, 知识卡片数: {len(knowledge_clean)}")

    # dry-run 模式：仅输出 payload，不真正导入
    duration_guess = float(seg_end - seg_start)
    cf_meta = {"duration": duration_guess, "poster": None}

    # 片段封面策略：
    # - 第一个片段：使用目录下上传的封面图（poster_url / cover_image_id）
    # - 后续片段：不传封面图字段，走 Cloudflare 返回的 thumbnail/preview
    seg_poster_url = poster_url if idx == 1 else None
    seg_cover_image_id = cover_image_id if idx == 1 else None
    if dry_run:
      print("Step 10: dry-run 模式，仅构造 payload，不上传视频/不入库")
      payload = build_finalize_payload(
        cf_video_id=f"DRY_RUN_CF_ID_{idx}",
        meta_from_llm={"meta": meta_clean},
        subtitles=subtitles_clean,
        knowledge=knowledge_clean,
        cf_meta=cf_meta,
        poster_url=seg_poster_url,
        cover_image_id=seg_cover_image_id,
      )
      debug_pretty_print(payload)
      continue

    # Step 10: 上传片段到 Cloudflare，并用 Cloudflare 的元信息（duration/poster）覆盖
    if not clip_path.is_file():
      raise RuntimeError(f"切片文件在上传前不存在: {clip_path}")
    print(f"Step 10: 准备上传片段，路径={clip_path}, 大小约 {clip_path.stat().st_size/1024/1024:.2f} MB")
    upload_info = init_upload()
    upload_to_cloudflare(upload_info["uploadUrl"], clip_path)
    cf_meta = fetch_cf_metadata(upload_info["uid"])

    payload = build_finalize_payload(
      cf_video_id=upload_info["uid"],
      meta_from_llm={"meta": meta_clean},
      subtitles=subtitles_clean,
      knowledge=knowledge_clean,
      cf_meta=cf_meta,
      poster_url=seg_poster_url,
      cover_image_id=seg_cover_image_id,
    )

    result = finalize_upload(payload)
    upload_records.append({"cf_video_id": upload_info["uid"], "video_id": result["video_id"]})
    print(f"✅ 片段 {idx} 上传完成，video_id={result['video_id']}")

  if upload_records and not dry_run:
    mark_done(dir_path, upload_records)
    print("🎉 该目录处理完成（多片段）")


def main() -> None:
  parser = argparse.ArgumentParser(
    description="基于 SRT + DeepSeek 的全自动导入脚本（视频 + 字幕 + 知识卡片）"
  )
  group = parser.add_mutually_exclusive_group(required=True)
  group.add_argument("--dir", type=str, help="单个视频目录路径")
  group.add_argument("--root", type=str, help="根目录，遍历其中的所有子目录")

  parser.add_argument(
    "--force",
    action="store_true",
    help="即使目录已存在 .immersive_uploaded.json 也强制重新导入",
  )
  parser.add_argument(
    "--dry-run",
    action="store_true",
    help="仅构造并打印 finalize payload，不真正上传视频/入库",
  )

  parser.add_argument(
    "--source",
    choices=["srt", "asr"],
    default="srt",
    help="字幕来源：srt=使用目录下 SRT 文件（默认），asr=使用 Whisper(stable-ts) 从音频自动识别",
  )
  parser.add_argument(
    "--asr-model",
    type=str,
    default="medium",
    help="asr 模式下使用的 Whisper 模型大小，例如 tiny/base/small/medium/large-v2/large-v3",
  )
  parser.add_argument(
    "--clip-asr",
    action=argparse.BooleanOptionalAction,
    default=True,
    help="切片后对每个片段使用 Whisper(stable-ts) 重新生成英文字幕骨架，保证字幕与片段时间轴对齐（默认开启）",
  )

  args = parser.parse_args()

  if args.dir:
    process_dir(
      Path(args.dir),
      force=args.force,
      dry_run=args.dry_run,
      source=args.source,
      asr_model=args.asr_model,
      clip_asr=args.clip_asr,
    )
    return

  root = Path(args.root)
  if not root.is_dir():
    print(f"root 不是有效目录: {root}")
    sys.exit(1)

  for subdir in sorted(root.iterdir()):
    if subdir.is_dir() and not subdir.name.startswith("."):
      process_dir(
        subdir,
        force=args.force,
        dry_run=args.dry_run,
        source=args.source,
        asr_model=args.asr_model,
        clip_asr=args.clip_asr,
      )

  print()
  print("=" * 60)
  print("全部目录处理完成")


if __name__ == "__main__":
  main()
