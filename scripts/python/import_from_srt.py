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
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

from srt_cleaner import build_skeleton_json, load_and_clean_srt, time_to_ms
from deepseek_client import annotate_subtitles
from content_validator import validate_and_merge, debug_pretty_print


# 依次尝试加载 .env 和 .env.local，保证可以复用 Next.js 的本地配置
load_dotenv()
load_dotenv(".env.local", override=False)


API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")


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
  """在目录中选择视频文件：优先 output.mp4，否则取第一个 *.mp4。"""
  output_mp4 = dir_path / "output.mp4"
  if output_mp4.is_file():
    return output_mp4

  candidates = sorted(dir_path.glob("*.mp4"))
  if not candidates:
    raise FileNotFoundError(f"目录中未找到 mp4 文件: {dir_path}")
  return candidates[0]


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
  从目录名中解析标题和作者。
  约定：`标题-作者`，如果没有 '-'，则作者留空。
  """
  name = dir_path.name.strip()
  if "-" in name:
    title, author = name.split("&&", 1)
    return title.strip(), author.strip()
  return name, ""


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


def mark_done(dir_path: Path, cf_video_id: str, video_id: str) -> None:
  """在目录下写入一个标记文件，避免重复导入。"""
  done_file = dir_path / ".immersive_uploaded.json"
  payload = {"cf_video_id": cf_video_id, "video_id": video_id}
  try:
    done_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
  except Exception as exc:
    print(f"  -> 警告：写入标记文件失败（不影响导入结果）: {exc}")


def process_dir(
  dir_path: Path,
  force: bool = False,
  dry_run: bool = False,
  source: str = "srt",
  asr_model: str = "medium",
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

  skeleton = build_skeleton_json(title=title, author=author, subtitles=skeleton_subtitles)
  print(f"  -> 清洗后字幕行: {(len(skeleton_subtitles))}")

  # Step 6: 调用 DeepSeek 生成完整内容
  print("Step 6: 调用 DeepSeek 生成中文翻译 + 知识卡片...")
  llm_output = annotate_subtitles(skeleton)

  # Step 7: 使用脚本进行严格校验与合并
  print("Step 7: 使用脚本校验并规整数据结构...")
  merged = validate_and_merge(skeleton, llm_output)

  # 最终 meta/subtitles/knowledge 三块
  meta_clean = merged["meta"]
  subtitles_clean = merged["subtitles"]
  knowledge_clean = merged["knowledge"]

  print("  -> 校验后摘要：")
  print(f"     标题: {meta_clean['title']}")
  print(f"     作者: {meta_clean.get('author', '')}")
  print(f"     难度: {meta_clean['difficulty']} (1=入门, 2=进阶, 3=大师)")
  print(f"     标签: {', '.join(meta_clean.get('tags', []))}")
  print(f"     字幕行数: {len(subtitles_clean)}, 知识卡片数: {len(knowledge_clean)}")

  # dry-run 模式：仅输出 payload，不真正导入
  cf_meta = {"duration": 0.0, "poster": None}
  cf_video_id = "DRY_RUN_CF_ID"
  if dry_run:
    print("Step 8: dry-run 模式，仅构造 payload，不上传视频/不入库")
    payload = build_finalize_payload(
      cf_video_id=cf_video_id,
      meta_from_llm={"meta": meta_clean},
      subtitles=subtitles_clean,
      knowledge=knowledge_clean,
      cf_meta=cf_meta,
      poster_url=poster_url,
      cover_image_id=cover_image_id,
    )
    debug_pretty_print(payload)
    return

  # 实际上传视频 + 获取 Cloudflare 元数据
  upload_info = init_upload()
  upload_to_cloudflare(upload_info["uploadUrl"], video_path)

  cf_meta = fetch_cf_metadata(upload_info["uid"])

  # 构造 finalize payload 并上传
  payload = build_finalize_payload(
    cf_video_id=upload_info["uid"],
    meta_from_llm={"meta": meta_clean},
    subtitles=subtitles_clean,
    knowledge=knowledge_clean,
    cf_meta=cf_meta,
    poster_url=poster_url,
    cover_image_id=cover_image_id,
  )

  result = finalize_upload(payload)
  mark_done(dir_path, cf_video_id=upload_info["uid"], video_id=result["video_id"])
  print("🎉 该目录处理完成")


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

  args = parser.parse_args()

  if args.dir:
    process_dir(
      Path(args.dir),
      force=args.force,
      dry_run=args.dry_run,
      source=args.source,
      asr_model=args.asr_model,
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
      )

  print()
  print("=" * 60)
  print("全部目录处理完成")


if __name__ == "__main__":
  main()
