#!/usr/bin/env python3
"""
字幕清洗工具（SRT -> 干净的英文骨架 JSON）

核心功能：
1. 解析原始 SRT 文件为结构化列表；
2. 合并滚动 / 增量字幕（Hello -> Hello world -> Hello world!）；
3. 保留最早 start 和最晚 end，保证时间轴覆盖完整；
4. 按标点符号 (. ? !) 分句，并按字符长度比例重新分配时间；
5. 输出给后续 LLM 使用的「英文骨架 JSON」，供翻译和知识点抽取。

可以直接作为模块被导入，也可以命令行单独使用：

  python scripts/python/srt_cleaner.py \\
    --input "/path/to/video-title-author.srt" \\
    --output "/path/to/video-title-author.srt.cleaned.json"
"""

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Any


def parse_srt_text(srt_content: str) -> List[Dict[str, str]]:
  """
  解析原始 SRT 文本为列表字典。

  返回结构：
    [
      {"start": "HH:MM:SS,mmm", "end": "...", "text": "原始合并后的英文文本"},
      ...
    ]
  """
  # 这一正则基于用户提供的版本，适用于常规 SRT 文件
  pattern = re.compile(
    r"(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n((?:.+\n?)+)",
    re.MULTILINE,
  )
  matches = pattern.findall(srt_content)

  parsed_subs: List[Dict[str, str]] = []
  for match in matches:
    _index, start, end, text = match
    # 清洗文本：去除多余换行，合并空白，去除两端空格
    clean_text = re.sub(r"\s+", " ", text.replace("\r", " ").replace("\n", " ")).strip()
    if not clean_text:
      continue
    parsed_subs.append(
      {
        "start": start,
        "end": end,
        "text": clean_text,
      }
    )
  return parsed_subs


def is_subsequence(segment: str, whole: str) -> bool:
  """
  检查 segment 是否是 whole 的一部分（处理滚动字幕的核心）。

  逻辑比较宽容：去掉非单词字符，仅保留字母数字后判断是否包含。
  """
  s_clean = re.sub(r"[^\w]", "", segment).lower()
  w_clean = re.sub(r"[^\w]", "", whole).lower()
  if not s_clean:
    return False
  return s_clean in w_clean


def clean_rolling_captions(subs: List[Dict[str, str]]) -> List[Dict[str, str]]:
  """
  合并滚动/增量字幕，解决时间轴错乱问题。

  输入/输出结构与 parse_srt_text 相同。
  """
  if not subs:
    return []

  cleaned: List[Dict[str, str]] = []
  current_block = dict(subs[0])

  for i in range(1, len(subs)):
    next_block = subs[i]

    # 情况 1：Next 包含了 Current (增量模式：Hello -> Hello World)
    if current_block["text"] in next_block["text"] or is_subsequence(
      current_block["text"], next_block["text"]
    ):
      # 合并：保留最早的 start，更新为最晚的 end，使用更完整的文本
      current_block["end"] = next_block["end"]
      current_block["text"] = next_block["text"]

    # 情况 2：Current 包含了 Next (重复或错误：Hello World -> Hello)
    elif next_block["text"] in current_block["text"]:
      # 忽略 Next 的文本，但可能需要延长时间
      current_block["end"] = next_block["end"]

    # 情况 3：完全新的内容
    else:
      cleaned.append(current_block)
      current_block = dict(next_block)

  cleaned.append(current_block)
  return cleaned


def time_to_ms(t_str: str) -> int:
  """把 'HH:MM:SS,mmm' 转换为毫秒整数。"""
  # 简单切片，假设输入已经是合法 SRT 时间格式
  h = int(t_str[0:2])
  m = int(t_str[3:5])
  s = int(t_str[6:8])
  ms = int(t_str[9:12])
  return (h * 3600 + m * 60 + s) * 1000 + ms


def ms_to_time(ms: float) -> str:
  """把毫秒数转换为 'HH:MM:SS,mmm' 字符串。"""
  total = int(round(ms))
  h = total // 3600000
  total %= 3600000
  m = total // 60000
  total %= 60000
  s = total // 1000
  total %= 1000
  return f"{h:02d}:{m:02d}:{s:02d},{total:03d}"


def split_sentences_with_time(blocks: List[Dict[str, str]]) -> List[Dict[str, Any]]:
  """
  将合并后的块按句号/问号/感叹号拆分，并估算时间轴。

  返回字幕骨架：
    [
      {"start": "HH:MM:SS,mmm", "end": "...", "text_en": "句子", "text_cn": ""},
      ...
    ]
  """
  final_sentences: List[Dict[str, Any]] = []

  # 定义句子结束符
  sentence_endings = re.compile(r"([.?!])\\s*")

  for block in blocks:
    text = block["text"]
    start_time = block["start"]
    end_time = block["end"]

    if not text.strip():
      continue

    # 分割句子，保留分隔符
    parts = sentence_endings.split(text)

    # 重组句子（文本 + 标点）
    sentences: List[str] = []
    for i in range(0, len(parts) - 1, 2):
      combined = (parts[i] + parts[i + 1]).strip()
      if combined:
        sentences.append(combined)
    if len(parts) % 2 != 0 and parts[-1].strip():
      sentences.append(parts[-1].strip())

    if not sentences:
      # 没有句号的整块，当作一句
      sentences = [text.strip()]

    total_len = len(text)
    if total_len <= 0:
      continue

    current_ms = time_to_ms(start_time)
    end_ms = time_to_ms(end_time)
    duration = max(end_ms - current_ms, 1)

    for idx, sent in enumerate(sentences):
      sent_len = max(len(sent), 1)
      # 最后一句用剩余时间，避免浮点累积误差
      if idx == len(sentences) - 1:
        sent_end_ms = end_ms
      else:
        sent_duration = duration * (sent_len / total_len)
        sent_end_ms = current_ms + sent_duration

      final_sentences.append(
        {
          "start": ms_to_time(current_ms),
          "end": ms_to_time(sent_end_ms),
          "text_en": sent.strip(),
          "text_cn": "",
        }
      )

      current_ms = sent_end_ms

  # 额外的后处理：去除多余换行/空白，并尝试裁剪相邻句子之间的重复前后缀

  def trim_overlap(prev: str, curr: str, min_overlap: int = 10, max_overlap: int = 80) -> str:
    """
    如果 curr 的开头与 prev 的结尾存在较长的重叠（常见于滚动字幕重复若干单词），
    则裁剪掉 curr 中这部分重叠文本。
    """
    if not prev or not curr:
      return curr

    max_len = min(len(prev), len(curr), max_overlap)
    best = 0

    # 从长到短寻找最长重叠前缀
    for length in range(max_len, min_overlap - 1, -1):
      suffix = prev[-length:]
      if curr.startswith(suffix):
        best = length
        break

    if best >= min_overlap:
      return curr[best:].lstrip()
    return curr

  cleaned_sentences: List[Dict[str, Any]] = []
  prev_text: str = ""

  for sent in final_sentences:
    text_en = re.sub(r"\s+", " ", sent["text_en"]).strip()
    # 尝试剪掉与上一句重复的前缀（例如 "listen throughout the whole video to"）
    text_en = trim_overlap(prev_text, text_en, min_overlap=10, max_overlap=80)

    sent["text_en"] = text_en
    cleaned_sentences.append(sent)
    prev_text = text_en

  return cleaned_sentences


def load_and_clean_srt(path: Path) -> List[Dict[str, Any]]:
  """
  从文件加载 SRT，完成：
    1) 解析；
    2) 滚动字幕清洗；
    3) 保持与原字幕尽量一致的时间边界，不再按句子重新切割时间。

  返回字幕骨架列表，每一项对应一个时间片：
    {
      "start": "...",
      "end": "...",
      "text_en": "...",
      "text_cn": ""
    }
  """
  content = path.read_text(encoding="utf-8")
  parsed = parse_srt_text(content)
  deduped = clean_rolling_captions(parsed)
  result: List[Dict[str, Any]] = []
  for block in deduped:
    result.append(
      {
        "start": block["start"],
        "end": block["end"],
        "text_en": block["text"],
        "text_cn": "",
      }
    )
  return result


def build_skeleton_json(
  title: str,
  author: str,
  subtitles: List[Dict[str, Any]],
) -> Dict[str, Any]:
  """
  构造给 LLM 使用的英文骨架 JSON。
  knowledge 先留空，difficulty 先置 0，后续由 LLM 决定 1-3。
  """
  return {
    "title": title,
    "author": author,
    "difficulty": 0,
    "tags": [],
    "description": "",
    "subtitles": subtitles,
    "knowledge": [],
  }


def main() -> None:
  parser = argparse.ArgumentParser(
    description="清洗 SRT 字幕并生成英文骨架 JSON（供 LLM 使用）"
  )
  parser.add_argument("--input", required=True, help="输入 SRT 文件路径")
  parser.add_argument(
    "--output",
    required=True,
    help="输出 JSON 文件路径（英文骨架结构）",
  )
  parser.add_argument(
    "--title",
    required=False,
    default="未命名视频",
    help="视频标题（英文或占位）",
  )
  parser.add_argument(
    "--author",
    required=False,
    default="",
    help="作者/频道名（可选）",
  )

  args = parser.parse_args()

  srt_path = Path(args.input)
  out_path = Path(args.output)

  if not srt_path.is_file():
    raise SystemExit(f"找不到 SRT 文件: {srt_path}")

  subtitles = load_and_clean_srt(srt_path)
  skeleton = build_skeleton_json(args.title, args.author, subtitles)

  out_path.write_text(
    json.dumps(skeleton, ensure_ascii=False, indent=2),
    encoding="utf-8",
  )
  print(f"已生成英文骨架 JSON: {out_path}")


if __name__ == "__main__":
  main()
