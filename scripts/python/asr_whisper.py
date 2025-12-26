#!/usr/bin/env python3
"""
基于 stable-ts (stable_whisper) 的 ASR 字幕生成工具。

作用：
- 直接从视频音频轨生成英文字幕时间片（start/end/text_en），用于替代或补充 SRT；
- 保证时间轴与语音尽可能对齐，让回看和口型匹配更自然；
- 输出结构与 srt_cleaner.load_and_clean_srt 一致，方便接入现有导入链路。

依赖：
- pip install -U stable-ts
- 系统安装 ffmpeg
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

_MODEL_CACHE: Dict[str, Any] = {}


def _load_model(model_size: str = "medium") -> Any:
  """
  延迟加载 stable_whisper 模型，避免在未安装依赖时影响其他脚本。
  """
  global _MODEL_CACHE

  if model_size in _MODEL_CACHE:
    return _MODEL_CACHE[model_size]

  try:
    import stable_whisper  # type: ignore
  except ImportError as exc:
    raise RuntimeError(
      "未找到 stable_whisper（stable-ts），请先安装依赖：\n"
      "  pip install -U stable-ts\n"
      "并确保系统已安装 ffmpeg。"
    ) from exc

  model = stable_whisper.load_model(model_size)
  _MODEL_CACHE[model_size] = model
  return model


def generate_subtitles_from_audio(
  video_path: Path,
  model_size: str = "medium",
  language: str = "en",
) -> List[Dict[str, Any]]:
  """
  使用 stable-ts 从视频/音频文件生成英文字幕时间片。

  返回列表中每一项结构为：
    {
      "start": float,      # 秒
      "end": float,        # 秒
      "text_en": str,
      "text_cn": ""
    }
  """
  model = _load_model(model_size)

  # regroup=True：让模型帮忙把碎片词重组为自然的语句片段
  result = model.transcribe(
    str(video_path),
    language=language,
    regroup=True,
  )

  segments: List[Dict[str, Any]] = []
  for seg in result.segments:
    text = (seg.text or "").strip()
    if not text:
      continue

    start = float(seg.start or 0.0)
    end = float(seg.end or start)
    if end <= start:
      end = start + 0.1

    segments.append(
      {
        "start": start,
        "end": end,
        "text_en": text,
        "text_cn": "",
      }
    )

  return segments


__all__ = ["generate_subtitles_from_audio"]

