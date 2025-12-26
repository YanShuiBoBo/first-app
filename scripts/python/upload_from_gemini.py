#!/usr/bin/env python3
"""
基于 Gemini 导出的 JSON + 本地 MP4，一键完成：

1. 调用后端 `/api/admin/upload/init` 拿 Cloudflare 直传链接；
2. 把 MP4 上传到 Cloudflare Stream；
3. 轮询 Cloudflare 接口拿到 duration、thumbnail 等信息；
4. 调用 `/api/admin/upload/finalize` 把视频 + 字幕 + 知识卡片入库。

使用前准备（一次性）：
  1) 在项目根目录的 `.env` 或系统环境变量中配置：
       API_BASE_URL=http://localhost:3000          # 或你的线上域名
       ADMIN_SECRET=你的管理密钥                     # 与 Next API 中的 ADMIN_SECRET 一致
       CF_ACCOUNT_ID=你的 Cloudflare Account ID
       CF_STREAM_TOKEN=Cloudflare API Token        # 需要有 Stream 读取权限

  2) 每个视频一个目录，目录结构建议：
       /path/to/materials/
         My video title/
           video.mp4
           gemini.json      # Gemini 按约定结构输出的 JSON

  3) 运行示例：
       单个目录：
         python scripts/python/upload_from_gemini.py --dir "/path/to/materials/My video title"
       批量目录：
         python scripts/python/upload_from_gemini.py --root "/path/to/materials"
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv


# 依次尝试加载 .env 和 .env.local，保证可以复用 Next.js 的本地配置
load_dotenv()
load_dotenv(".env.local", override=False)


API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
ADMIN_SECRET = os.getenv("ADMIN_SECRET")
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID")
CF_STREAM_TOKEN = os.getenv("CF_STREAM_TOKEN")


def require_env(name: str) -> str:
  """读取必须存在的环境变量，没有就退出。"""
  value = os.getenv(name)
  if not value:
    print(f"❌ 缺少环境变量: {name}")
    sys.exit(1)
  return value


def init_upload() -> Dict[str, Any]:
  """调用 /api/admin/upload/init 获取直传 uploadUrl + uid。"""
  admin_secret = require_env("ADMIN_SECRET")

  print("📡 正在获取 Cloudflare 上传 URL...")
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
  print(f"✅ 获取成功，UID: {result['uid']}")
  return result


def upload_to_cloudflare(upload_url: str, video_path: Path) -> None:
  """把本地 MP4 上传到 Cloudflare 直传 URL。"""
  print(f"☁️  正在上传视频到 Cloudflare: {video_path}")
  with open(video_path, "rb") as f:
    resp = requests.post(
      upload_url,
      files={"file": f},
      timeout=3600,
    )
    resp.raise_for_status()
  print("✅ 视频上传完成")


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

  for attempt in range(1, max_attempts + 1):
    print(f"🔍 正在查询 Cloudflare 视频信息 (尝试 {attempt}/{max_attempts})...")
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    # Cloudflare 标准返回格式: { success, result, errors, messages }
    result = data.get("result", data)
    ready = result.get("readyToStream")
    state = result.get("status", {}).get("state")

    duration = result.get("duration")
    thumbnail = result.get("thumbnail")
    preview = result.get("preview")

    if ready or state == "ready":
      print("✅ Cloudflare 视频已就绪")
      return {
        "duration": float(duration) if duration is not None else 0.0,
        "poster": thumbnail or preview,
        "raw": result,
      }

    print(f"⏳ 视频还未就绪 (state={state}, readyToStream={ready})，等待 {delay_sec} 秒后重试...")
    time.sleep(delay_sec)

  # 超时情况下仍然返回已有字段，避免整个流程卡死
  print("⚠️  等待 Cloudflare 就绪超时，将使用当前可用的字段继续")
  result = data.get("result", data)
  return {
    "duration": float(result.get("duration") or 0.0),
    "poster": result.get("thumbnail") or result.get("preview"),
    "raw": result,
  }


def load_gemini_json(path: Path) -> Dict[str, Any]:
  """读取 Gemini 输出 JSON。"""
  with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
  return data


def find_cover_image(dir_path: Path) -> Optional[Path]:
  """
  在目录下寻找首图文件：
  - 只看当前目录（不递归子目录）；
  - 支持 png / jpg / jpeg / webp；
  - 显式忽略 output.mp4 / gemini.json 本身。
  """
  patterns = ("*.png", "*.jpg", "*.jpeg", "*.webp")
  for pattern in patterns:
    for p in sorted(dir_path.glob(pattern)):
      if not p.is_file():
        continue
      if p.name in ("output.mp4", "gemini.json"):
        continue
      return p
  return None


def upload_cover_image(image_path: Path) -> Optional[Tuple[str, str]]:
  """
  调用后端 /api/admin/images/upload 上传首图到 Cloudflare Images。

  返回:
    (image_id, delivery_url) 或 None（出错时）。
  """
  admin_secret = require_env("ADMIN_SECRET")

  print(f"🖼  发现首图文件: {image_path.name}，上传到 Cloudflare Images...")

  url = f"{API_BASE_URL}/api/admin/images/upload"

  with open(image_path, "rb") as f:
    files = {
      "file": (image_path.name, f, "image/*"),
    }
    resp = requests.post(
      url,
      headers={"x-admin-secret": admin_secret},
      files=files,
      timeout=60,
    )

  try:
    data = resp.json()
  except Exception:
    print(f"⚠️  封面上传返回非 JSON 内容：{resp.text}")
    return None

  if resp.status_code >= 400 or not data.get("success"):
    print("⚠️  封面上传失败，将回退为视频帧缩略图")
    try:
      print(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception:
      print(data)
    return None

  result = data.get("data") or {}
  image_id = result.get("id")
  delivery_url = result.get("deliveryUrl")

  if not image_id or not delivery_url:
    print("⚠️  封面上传成功但未返回 id/deliveryUrl，继续使用视频帧缩略图")
    return None

  print(f"✅ 封面上传成功，Image ID={image_id}")
  return image_id, delivery_url


def build_payload(
  cf_video_id: str,
  gem: Dict[str, Any],
  cf_meta: Dict[str, Any],
  poster_override: Optional[str] = None,
  cover_image_id: Optional[str] = None,
) -> Dict[str, Any]:
  """把 Gemini JSON + Cloudflare meta 映射为 /upload/finalize 所需的 payload。

  poster_override / cover_image_id 用于支持本地首图上传到 Cloudflare Images，
  优先使用 Images 的 imagedelivery.net 地址作为 poster。
  """

  # 1) meta
  title = gem.get("title") or "未命名视频"
  description = gem.get("description")
  author = gem.get("author")
  difficulty = gem.get("difficulty")
  tags = gem.get("tags") or []

  duration = cf_meta.get("duration") or 0.0

  # poster 优先级：
  # 1) 本地图片上传到 Cloudflare Images 后返回的 imagedelivery.net 地址
  # 2) Cloudflare Stream 返回的 thumbnail/preview
  # 3) 兜底：videodelivery.net 的缩略图
  poster: Optional[str] = None
  if poster_override:
    poster = poster_override
  else:
    poster = cf_meta.get("poster")

  if not poster:
    poster = f"https://videodelivery.net/{cf_video_id}/thumbnails/thumbnail.jpg"

  meta: Dict[str, Any] = {
    "title": title,
    "poster": poster,
    "duration": float(duration),
  }

  if author:
    meta["author"] = author
  if description:
    meta["description"] = description
  if isinstance(difficulty, (int, float)):
    meta["difficulty"] = int(difficulty)
  if isinstance(tags, list):
    meta["tags"] = tags

  # Cloudflare Images 的图片 ID（可选）
  if cover_image_id:
    meta["cover_image_id"] = cover_image_id

  # ---------- 2) subtitles ----------

  time_number_re = re.compile(r"^\d+(\.\d+)?$")

  def parse_time_to_seconds(value: Any) -> float:
    """
    支持三种格式:
      - 数字: 1.23
      - SRT 风格: "HH:MM:SS,mmm"
      - 简化: "MM:SS,mmm" 或 "SS,mmm"
    """
    if isinstance(value, (int, float)):
      return float(value)

    s = str(value).strip()
    if not s:
      raise ValueError("空的时间字符串")

    # 纯数字字符串，按秒解析
    if time_number_re.match(s):
      return float(s)

    # 替换逗号为点，方便解析小数秒
    s = s.replace(",", ".")
    parts = s.split(":")

    try:
      if len(parts) == 3:
        # HH:MM:SS(.mmm)
        h = int(parts[0])
        m = int(parts[1])
        sec = float(parts[2])
      elif len(parts) == 2:
        # MM:SS(.mmm)
        h = 0
        m = int(parts[0])
        sec = float(parts[1])
      elif len(parts) == 1:
        # SS(.mmm)
        h = 0
        m = 0
        sec = float(parts[0])
      else:
        raise ValueError(f"无法解析的时间格式: {s}")
    except Exception as e:
      raise ValueError(f"解析时间失败: {s} ({e})")

    return h * 3600 + m * 60 + sec

  raw_subs = gem.get("subtitles") or []
  subtitles: List[Dict[str, Any]] = []

  for item in raw_subs:
    try:
      start = parse_time_to_seconds(item["start"])
      end = parse_time_to_seconds(item["end"])
      text_en = str(item["text_en"]).strip()
      text_cn = str(item["text_cn"]).strip()
      if not text_en or not text_cn:
        continue

      # Zod 要求 end > start；如果 Gemini 给出的数据不符合，做一次轻微修正
      if end <= start:
        print(
          f"⚠️ 修正一条字幕 end<=start: start={start}, end={end}，"
          f"自动调整为 end = start + 0.5"
        )
        end = start + 0.5

      subtitles.append(
        {
          "start": start,
          "end": end,
          "text_en": text_en,
          "text_cn": text_cn,
        }
      )
    except Exception as e:  # 保守处理，单条出错不影响整体
      print(f"⚠️  跳过一条无效字幕: {e} - 数据: {item}")

  if not subtitles:
    raise ValueError("Gemini JSON 中没有有效字幕（subtitles），无法入库")

  # 3) cards（knowledge）
  raw_cards = gem.get("knowledge") or gem.get("cards") or []
  cards: List[Dict[str, Any]] = []

  allowed_types = {"word", "phrase", "idiom", "slang"}

  for item in raw_cards:
    try:
      trigger_word = item["trigger_word"]
      data = item["data"]
      if not trigger_word or not data.get("def"):
        continue

      # 规范化 type，只有在允许列表里的才保留，否则丢弃（避免 Zod 校验报错）
      raw_type = data.get("type")
      norm_type: Optional[str] = None
      if isinstance(raw_type, str):
        t = raw_type.strip().lower()
        if t in allowed_types:
          norm_type = t
        else:
          print(
            f"⚠️ 知识卡片 type 无法识别（{raw_type}），已忽略该字段，"
            f"允许值仅限: {', '.join(sorted(allowed_types))}"
          )

      card_data: Dict[str, Any] = {
        "def": data.get("def", "").strip(),
        "ipa": data.get("ipa"),
        "sentence": data.get("sentence"),
      }
      if norm_type:
        card_data["type"] = norm_type

      cards.append(
        {
          "trigger_word": trigger_word,
          "data": card_data,
        }
      )
    except Exception as e:
      print(f"⚠️  跳过一条无效知识卡片: {e} - 数据: {item}")

  payload = {
    "cf_video_id": cf_video_id,
    "meta": meta,
    "subtitles": subtitles,
    "cards": cards,
  }

  return payload


def finalize_upload(payload: Dict[str, Any]) -> Dict[str, Any]:
  """调用 /api/admin/upload/finalize 保存到 Supabase。"""
  admin_secret = require_env("ADMIN_SECRET")

  print("💾 正在保存视频到平台...")
  resp = requests.post(
    f"{API_BASE_URL}/api/admin/upload/finalize",
    headers={
      "x-admin-secret": admin_secret,
      "Content-Type": "application/json",
    },
    json=payload,
    timeout=60,
  )

  # 尝试解析返回体，方便排查 400 之类的错误（通常是 Zod 校验不通过）
  try:
    data = resp.json()
  except Exception:
    print(f"⚠️  finalize 返回的非 JSON 内容：{resp.text}")
    resp.raise_for_status()
    # 上面已经抛异常，这里只是为了类型完整
    raise

  if resp.status_code >= 400:
    print(f"❌ finalize 接口返回错误状态码: {resp.status_code}")
    print("返回内容:")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    resp.raise_for_status()

  if not data.get("success"):
    print("❌ finalize 接口 success=false，详细信息如下：")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    raise RuntimeError(f"finalize 接口返回错误: {data}")

  print(f"✅ 保存成功，video_id={data['data']['video_id']}")
  return data["data"]


def find_video_and_json(dir_path: Path) -> Tuple[Path, Path]:
  """在目录下自动寻找 MP4 和 Gemini JSON 文件。"""
  if not dir_path.is_dir():
    raise ValueError(f"不是有效目录: {dir_path}")

  mp4_files = sorted(dir_path.glob("*.mp4"))
  if not mp4_files:
    raise FileNotFoundError(f"目录中未找到 mp4 文件: {dir_path}")

  # 优先 output.mp4，否则取第一个
  video = next((p for p in mp4_files if p.name == "output.mp4"), mp4_files[0])

  # JSON：优先 gemini.json，其次 *.content.json，最后 *.json 中名字含 content/ai
  candidates = [
    dir_path / "gemini.json",
    dir_path / "content.json",
  ]
  candidates.extend(dir_path.glob("*.content.json"))
  candidates.extend(dir_path.glob("*.json"))

  json_file: Optional[Path] = None
  for p in candidates:
    if p.exists() and p.is_file():
      json_file = p
      break

  if not json_file:
    raise FileNotFoundError(f"目录中未找到 Gemini JSON 文件: {dir_path}")

  return video, json_file


def find_gemini_json(dir_path: Path) -> Path:
  """仅查找 Gemini JSON 文件（不要求目录中存在 MP4）。"""
  if not dir_path.is_dir():
    raise ValueError(f"不是有效目录: {dir_path}")

  candidates = [
    dir_path / "gemini.json",
    dir_path / "content.json",
  ]
  candidates.extend(dir_path.glob("*.content.json"))
  candidates.extend(dir_path.glob("*.json"))

  json_file: Optional[Path] = None
  for p in candidates:
    if p.exists() and p.is_file():
      json_file = p
      break

  if not json_file:
    raise FileNotFoundError(f"目录中未找到 Gemini JSON 文件: {dir_path}")

  return json_file


def mark_done(dir_path: Path, cf_video_id: str, video_id: str) -> None:
  """在目录下写入一个标记文件，避免重复导入。"""
  done_file = dir_path / ".immersive_uploaded.json"
  payload = {
    "cf_video_id": cf_video_id,
    "video_id": video_id,
  }
  try:
    with open(done_file, "w", encoding="utf-8") as f:
      json.dump(payload, f, ensure_ascii=False, indent=2)
  except Exception as e:
    print(f"⚠️  写入标记文件失败（不影响导入结果）: {e}")


def is_done(dir_path: Path) -> bool:
  """检测目录是否已经导入过。"""
  done_file = dir_path / ".immersive_uploaded.json"
  return done_file.exists()


def process_dir(
  dir_path: Path,
  force: bool = False,
  meta_only: bool = False,
  cf_id: Optional[str] = None,
  duration_override: Optional[float] = None,
) -> None:
  """处理单个目录。

  正常模式：上传视频到 Cloudflare + 入库；
  meta_only 模式：仅根据 gemini.json（以及本地封面图）生成并提交元数据，不上传视频。
  """
  print()
  print("=" * 60)
  print(f"📁 处理目录: {dir_path}")

  if is_done(dir_path) and not force and not meta_only:
    print("⏭  检测到已存在 .immersive_uploaded.json，默认跳过（如需重新导入请删除该文件或使用 --force）")
    return

  try:
    if meta_only:
      video_path = None
      json_path = find_gemini_json(dir_path)
    else:
      video_path, json_path = find_video_and_json(dir_path)
  except Exception as e:
    print(f"❌ 跳过目录（未找到必要文件）: {e}")
    return

  if video_path is not None:
    print(f"🎬 视频文件: {video_path.name}")
  print(f"🧠 Gemini JSON: {json_path.name}")

  # 先尝试处理本地封面图（如果有）
  cover_image_path = find_cover_image(dir_path)
  cover_image_id: Optional[str] = None
  poster_override: Optional[str] = None

  if cover_image_path is not None:
    try:
      result = upload_cover_image(cover_image_path)
      if result is not None:
        cover_image_id, poster_override = result
    except Exception as e:
      print(f"⚠️  上传封面图失败，将使用视频帧缩略图: {e}")

  try:
    gem = load_gemini_json(json_path)

    if meta_only:
      # 仅处理 gemini.json 基本信息，不上传视频。
      # cf_video_id 优先从参数 --cf-id 读取，其次尝试从 JSON 中读取。
      cf_video_id = cf_id or gem.get("cf_video_id") or gem.get("cf_id")
      if not cf_video_id:
        raise ValueError(
          "meta-only 模式需要提供 --cf-id 参数，"
          "或在 gemini.json 中包含 cf_video_id 字段"
        )

      cf_meta = {
        "duration": float(duration_override) if duration_override is not None else 0.0,
        "poster": None,
      }

      payload = build_payload(
        cf_video_id,
        gem,
        cf_meta,
        poster_override=poster_override,
        cover_image_id=cover_image_id,
      )
      result = finalize_upload(payload)

      mark_done(dir_path, cf_video_id=cf_video_id, video_id=result["video_id"])
      print("🎉 该目录（meta-only 模式）处理完成")
      return

    # 正常模式：上传视频 + 入库
    upload_info = init_upload()
    upload_to_cloudflare(upload_info["uploadUrl"], video_path)  # type: ignore[arg-type]

    cf_meta = fetch_cf_metadata(upload_info["uid"])
    payload = build_payload(
      upload_info["uid"],
      gem,
      cf_meta,
      poster_override=poster_override,
      cover_image_id=cover_image_id,
    )
    result = finalize_upload(payload)

    mark_done(dir_path, cf_video_id=upload_info["uid"], video_id=result["video_id"])
    print("🎉 该目录处理完成")

  except KeyboardInterrupt:
    print("\n⚠️  用户中断")
    sys.exit(1)
  except Exception as e:
    print(f"❌ 处理失败: {e}")
    import traceback

    traceback.print_exc()


def main() -> None:
  parser = argparse.ArgumentParser(
    description="使用 Gemini JSON 自动上传视频到 Cloudflare 并入库 Immersive English 平台"
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
    "--meta-only",
    action="store_true",
    help="只处理 gemini.json 基本信息数据（不上传视频），需要配合 --dir 使用",
  )
  parser.add_argument(
    "--cf-id",
    type=str,
    help="meta-only 模式下使用的 Cloudflare 视频 ID（cf_video_id）；如不提供，将尝试从 gemini.json 中读取 cf_video_id 字段",
  )
  parser.add_argument(
    "--duration",
    type=float,
    help="meta-only 模式下的视频时长（秒），可选，默认 0",
  )

  args = parser.parse_args()

  if args.meta_only and args.root:
    print("❌ meta-only 模式目前仅支持 --dir，不支持 --root 批量处理")
    sys.exit(1)

  if args.dir:
    process_dir(
      Path(args.dir),
      force=args.force,
      meta_only=args.meta_only,
      cf_id=args.cf_id,
      duration_override=args.duration,
    )
    return

  root = Path(args.root)
  if not root.is_dir():
    print(f"❌ root 不是有效目录: {root}")
    sys.exit(1)

  for subdir in sorted(root.iterdir()):
    if subdir.is_dir() and not subdir.name.startswith("."):
      process_dir(subdir, force=args.force)

  print()
  print("=" * 60)
  print("✅ 全部目录处理完成")


if __name__ == "__main__":
  main()
