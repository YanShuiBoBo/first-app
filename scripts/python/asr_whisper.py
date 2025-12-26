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
import re

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

  raw_segments: List[Dict[str, Any]] = []
  for seg in result.segments:
    text = (seg.text or "").strip()
    if not text:
      continue

    start = float(seg.start or 0.0)
    end = float(seg.end or start)
    if end <= start:
      end = start + 0.1

    raw_segments.append(
      {
        "start": start,
        "end": end,
        "text_en": text,
        "text_cn": "",
      }
    )

  # 第二步：按句号/问号/感叹号将相邻片段合并为「一句话」级别的时间片，
  # 但时间轴仍然来自 ASR 的最早 start 与最晚 end，保证整体口型对齐。
  return _merge_segments_into_sentences(raw_segments)


def _is_sentence_end(text: str) -> bool:
  """
  判断当前片段是否以句号/问号/感叹号结束。
  这里只做非常克制的判断，避免过度切分。
  """
  stripped = text.strip()
  if not stripped:
    return False
  last = stripped[-1]
  return last in {".", "?", "!"}


def _merge_segments_into_sentences(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
  """
  将 Whisper 返回的较细粒度片段，再按「句子」维度做一次合并：

  - 同一句的多个短片段被合并为一个时间片；
  - start 为该句第一个片段的 start；
  - end 为该句最后一个片段的 end；
  - text_en 为中间所有片段文本用空格拼接；
  - 当检测到句末标点 (.?!)，或片段之间存在较大的时间间隔时，结束当前句。
  """
  if not segments:
    return []

  merged: List[Dict[str, Any]] = []
  current: Dict[str, Any] = {}

  for idx, seg in enumerate(segments):
    text = str(seg.get("text_en", "")).strip()
    if not text:
      continue

    start = float(seg.get("start", 0.0))
    end = float(seg.get("end", start))

    # 先做一次重复片段过滤：
    # 如果上一句已经完整包含了当前文本，且时间范围也覆盖当前片段，则认为这是
    # Whisper 的重复输出（常见于结尾重复一遍短语），直接跳过。
    if merged:
      prev = merged[-1]
      prev_text = str(prev.get("text_en", "")).lower()
      curr_text = text.lower()

      def _normalize(s: str) -> str:
        # 去掉标点，只保留字母和数字，并压缩空白
        s = re.sub(r"[^\w]+", " ", s)
        s = re.sub(r"\s+", " ", s)
        return s.strip()

      prev_norm = _normalize(prev_text)
      curr_norm = _normalize(curr_text)

      if curr_norm and prev_norm and curr_norm in prev_norm:
        prev_start = float(prev.get("start", 0.0))
        prev_end = float(prev.get("end", prev_start))
        # 当前片段时间完全落在上一句内部（或非常靠近尾部），视为重复
        if start >= prev_start and end <= prev_end + 0.1:
          continue

    if not current:
      # 新句子开始
      current = {
        "start": start,
        "end": end,
        "text_en": text,
      }
    else:
      # 追加到当前句子
      gap = start - float(current["end"])
      current["end"] = max(float(current["end"]), end)
      current["text_en"] = (str(current["text_en"]) + " " + text).strip()

      # 如果时间间隔很大，也可以认为是新的语义单元
      if gap > 2.0:
        merged.append(
          {
            "start": float(current["start"]),
            "end": float(current["end"]),
            "text_en": str(current["text_en"]).strip(),
            "text_cn": "",
          }
        )
        current = {
          "start": start,
          "end": end,
          "text_en": text,
        }

    # 检测当前片段是否结束一个句子
    if _is_sentence_end(text):
      merged.append(
        {
          "start": float(current["start"]),
          "end": float(current["end"]),
          "text_en": str(current["text_en"]).strip(),
          "text_cn": "",
        }
      )
      current = {}

  # 收尾：如果最后一句没有以 .?! 结尾，也要落一条
  if current:
    merged.append(
      {
        "start": float(current["start"]),
        "end": float(current["end"]),
        "text_en": str(current["text_en"]).strip(),
        "text_cn": "",
      }
    )

  return merged


__all__ = ["generate_subtitles_from_audio"]
