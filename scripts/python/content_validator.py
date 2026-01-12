#!/usr/bin/env python3
"""
内容校验与规整工具。

目标：在引入 LLM（DeepSeek）结果之后，用脚本强制保证数据结构和取值规范，
尽量避免「AI 发散」导致的脏数据。

主要职责：
1. 约束 difficulty 在 1-3；
2. 约束 tags 数量和类型（最多 2 个，全部字符串）；
3. subtitles：
   - 以 SRT 清洗阶段生成的 skeleton 为准；
   - 强制使用 skeleton 的 start/end/text_en；
   - 仅从 LLM 结果中取 text_cn（如果有）；保证行数一致；
4. knowledge：
   - 过滤掉字段不完整的卡片；
   - 限定 type 在允许枚举内，否则丢弃该字段；
   - 做简单去重。
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Set, Tuple

# 与后端 Zod 校验保持一致的类型集合
ALLOWED_KNOWLEDGE_TYPES: Set[str] = {
  "word",
  "phrase",
  "phrasal_verb",
  "expression",
  "spoken_pattern",
  "idiom",
  "slang",
  "proper_noun",
}


def clamp_difficulty(value: Any, default: int = 2) -> int:
  """把任意输入归一到 1-3 的区间内。"""
  try:
    d = int(value)
  except Exception:
    return default
  if d < 1:
    return 1
  if d > 3:
    return 3
  return d


def normalize_tags(value: Any, max_tags: int = 2) -> List[str]:
  """把 tags 归一为短字符串列表，并限制数量。"""
  if not isinstance(value, list):
    return []

  seen: Set[str] = set()
  result: List[str] = []

  for item in value:
    text = str(item).strip()
    if not text:
      continue
    if text in seen:
      continue
    seen.add(text)
    result.append(text)
    if len(result) >= max_tags:
      break

  return result


def merge_subtitles_with_skeleton(
  skeleton_subs: List[Dict[str, Any]],
  llm_subs: Any,
) -> List[Dict[str, Any]]:
  """
  以 skeleton 为准，对 LLM 输出的字幕做「只取中文」合并。

  规则：
  - 行数以 skeleton 为准；
  - start/end/text_en 一律取 skeleton；
  - text_cn 尝试从 llm_subs[i].text_cn 取值，取不到则给空字符串；
  - 即使 LLM 改动了时间或英文，也会被忽略。
  """
  result: List[Dict[str, Any]] = []

  if isinstance(llm_subs, list):
    normalized_llm = llm_subs
  else:
    normalized_llm = []

  for idx, base in enumerate(skeleton_subs):
    item = base.copy()

    text_cn = ""
    if idx < len(normalized_llm):
      cand = normalized_llm[idx]
      if isinstance(cand, dict):
        raw_cn = cand.get("text_cn")
        if isinstance(raw_cn, str):
          text_cn = raw_cn.strip()

    item["text_cn"] = text_cn
    # 确保字段齐全
    item.setdefault("text_en", "")
    item.setdefault("start", "")
    item.setdefault("end", "")

    result.append(item)

  return result


def normalize_knowledge(raw: Any) -> List[Dict[str, Any]]:
  """
  过滤并规整知识卡片数组。

  目标：
  - 保留 DeepSeek 生成的结构化字段（source / pos / collocations / ...）；
  - 只强制要求 trigger_word + data.def；
  - 过滤非法 type / 重复卡片。
  """
  if not isinstance(raw, list):
    return []

  normalized: List[Dict[str, Any]] = []
  seen_keys: Set[Tuple[str, str, str]] = set()

  def _norm_str(value: Any) -> str:
    return str(value).strip()

  def _normalize_string_list(value: Any, max_items: int = 4) -> List[str]:
    if not isinstance(value, list):
      return []
    seen_local: Set[str] = set()
    result: List[str] = []
    for item in value:
      text = _norm_str(item)
      if not text or text in seen_local:
        continue
      seen_local.add(text)
      result.append(text)
      if len(result) >= max_items:
        break
    return result

  for item in raw:
    if not isinstance(item, dict):
      continue

    trigger_word_raw = item.get("trigger_word", "")
    trigger_word = _norm_str(trigger_word_raw)
    data = item.get("data")

    if not trigger_word or not isinstance(data, dict):
      continue

    definition_raw = data.get("def", "")
    definition = _norm_str(definition_raw)
    if not definition:
      continue

    raw_type = data.get("type")
    type_str: Optional[str] = None
    if isinstance(raw_type, str):
      t = raw_type.strip()
      if t in ALLOWED_KNOWLEDGE_TYPES:
        type_str = t

    dedupe_key = (trigger_word, definition, type_str or "")
    if dedupe_key in seen_keys:
      continue
    seen_keys.add(dedupe_key)

    card_data: Dict[str, Any] = {"def": definition}
    if type_str:
      card_data["type"] = type_str

    # headword：若与 trigger_word 不同则保留
    headword_raw = data.get("headword")
    if isinstance(headword_raw, str):
      headword = headword_raw.strip()
      if headword and headword.lower() != trigger_word.lower():
        card_data["headword"] = headword

    # ipa / pos
    ipa_raw = data.get("ipa")
    if isinstance(ipa_raw, str):
      ipa = ipa_raw.strip()
      if ipa:
        card_data["ipa"] = ipa

    pos_raw = data.get("pos")
    if isinstance(pos_raw, str):
      pos = pos_raw.strip()
      if pos:
        card_data["pos"] = pos

    # 搭配 / 近义
    collocations = _normalize_string_list(data.get("collocations"))
    if collocations:
      card_data["collocations"] = collocations

    synonyms = _normalize_string_list(data.get("synonyms"))
    if synonyms:
      card_data["synonyms"] = synonyms

    # 其他文本字段
    difficulty_level_raw = data.get("difficulty_level")
    if isinstance(difficulty_level_raw, str):
      diff = difficulty_level_raw.strip()
      if diff:
        card_data["difficulty_level"] = diff

    structure_raw = data.get("structure")
    if isinstance(structure_raw, str):
      structure = structure_raw.strip()
      if structure:
        card_data["structure"] = structure

    register_raw = data.get("register")
    if isinstance(register_raw, str):
      register = register_raw.strip()
      if register:
        card_data["register"] = register

    paraphrase_raw = data.get("paraphrase")
    if isinstance(paraphrase_raw, str):
      paraphrase = paraphrase_raw.strip()
      if paraphrase and paraphrase != definition:
        card_data["paraphrase"] = paraphrase

    function_label_raw = data.get("function_label")
    if isinstance(function_label_raw, str):
      function_label = function_label_raw.strip()
      if function_label:
        card_data["function_label"] = function_label

    scenario_raw = data.get("scenario")
    if isinstance(scenario_raw, str):
      scenario = scenario_raw.strip()
      if scenario:
        card_data["scenario"] = scenario

    # sentence（英文原句，兼容老数据）
    sentence_raw = data.get("sentence")
    sentence = sentence_raw.strip() if isinstance(sentence_raw, str) else ""

    # source：语境 + 时间戳
    source_obj: Dict[str, Any] = {}
    source_raw = data.get("source")
    if isinstance(source_raw, dict):
      sent_en_raw = source_raw.get("sentence_en")
      if isinstance(sent_en_raw, str):
        sent_en = sent_en_raw.strip()
        if sent_en:
          source_obj["sentence_en"] = sent_en

      sent_cn_raw = source_raw.get("sentence_cn")
      if isinstance(sent_cn_raw, str):
        sent_cn = sent_cn_raw.strip()
        if sent_cn:
          source_obj["sentence_cn"] = sent_cn

      ts_start_raw = source_raw.get("timestamp_start")
      if isinstance(ts_start_raw, (int, float)):
        source_obj["timestamp_start"] = float(ts_start_raw)

      ts_end_raw = source_raw.get("timestamp_end")
      if isinstance(ts_end_raw, (int, float)):
        source_obj["timestamp_end"] = float(ts_end_raw)

    # 若没有显式的 source.sentence_en，但存在 sentence 字段，则把 sentence 视为英文原句
    if sentence and "sentence_en" not in source_obj:
      source_obj["sentence_en"] = sentence

    if source_obj:
      card_data["source"] = source_obj

    # 为兼容前端旧逻辑，保留一份平铺的 sentence（与 source.sentence_en 对齐）
    if "sentence_en" in source_obj:
      card_data["sentence"] = source_obj["sentence_en"]

    normalized.append(
      {
        "trigger_word": trigger_word,
        "data": card_data,
      }
    )

  return normalized


def validate_and_merge(
  skeleton: Dict[str, Any],
  llm_output: Dict[str, Any],
) -> Dict[str, Any]:
  """
  综合 skeleton（本地脚本生成）和 LLM 输出，得到最终干净的数据结构：

  返回结构：
  {
    "meta": {
      "title": str,
      "author": str,
      "difficulty": int (1-3),
      "tags": [str, ...],
      "description": str
    },
    "subtitles": [...],  # start/end/text_en/text_cn
    "knowledge": [...]
  }
  """
  # 1) 元信息
  title = llm_output.get("title") or skeleton.get("title") or "未命名视频"
  if not isinstance(title, str):
    title = str(title)
  title = title.strip()

  author = llm_output.get("author") or skeleton.get("author") or ""
  if not isinstance(author, str):
    author = str(author)
  author = author.strip()

  difficulty_raw = llm_output.get("difficulty")
  difficulty = clamp_difficulty(difficulty_raw)

  tags_raw = llm_output.get("tags")
  tags = normalize_tags(tags_raw)
  if not tags:
    # 兜底：使用 skeleton 的 tags 或默认一个通用标签
    tags = normalize_tags(skeleton.get("tags") or []) or ["日常生活"]

  description = llm_output.get("description") or skeleton.get("description") or ""
  if not isinstance(description, str):
    description = str(description)
  description = description.strip()

  # 可以简单裁剪简介长度，避免异常超长
  if len(description) > 600:
    description = description[:580].rstrip() + "..."

  # 2) 字幕合并
  skeleton_subs = skeleton.get("subtitles") or []
  if not isinstance(skeleton_subs, list):
    raise ValueError("skeleton.subtitles 必须是列表")

  llm_subs = llm_output.get("subtitles") or []
  subtitles = merge_subtitles_with_skeleton(skeleton_subs, llm_subs)

  # 3) 知识卡片
  knowledge_raw = llm_output.get("knowledge") or []
  knowledge = normalize_knowledge(knowledge_raw)

  meta = {
    "title": title,
    "author": author,
    "difficulty": difficulty,
    "tags": tags,
    "description": description,
  }

  return {
    "meta": meta,
    "subtitles": subtitles,
    "knowledge": knowledge,
  }


def debug_pretty_print(data: Any) -> None:
  """调试辅助输出。"""
  print(json.dumps(data, ensure_ascii=False, indent=2))


__all__ = [
  "clamp_difficulty",
  "normalize_tags",
  "merge_subtitles_with_skeleton",
  "normalize_knowledge",
  "validate_and_merge",
]
