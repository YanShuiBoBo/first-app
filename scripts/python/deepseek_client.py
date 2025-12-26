#!/usr/bin/env python3
"""
DeepSeek API 封装（用于字幕翻译 + 知识点抽取）。

设计原则：
- 把与具体 LLM 提供商相关的调用细节集中在这里；
- 外部只关心「输入骨架 JSON -> 输出完整 JSON」的逻辑；
- 真正导入数据库前，必须再经过 content_validator 做严格校验。

注意：
- 这里假设 DeepSeek 暴露的是 OpenAI Chat Completion 兼容接口，
  即 POST /v1/chat/completions；
- 如果你使用的是其他网关或官方接口，请根据实际情况调整
  DEEPSEEK_API_BASE / 路径 / 返回结构解析。
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv

# 允许复用 Next.js 的 .env.local
load_dotenv()
load_dotenv(".env.local", override=False)


DEEPSEEK_API_BASE = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")


def _require_env(name: str) -> str:
  value = os.getenv(name)
  if not value:
    raise RuntimeError(f"缺少环境变量: {name}")
  return value


def call_deepseek_chat(
  system_prompt: str,
  user_payload: Dict[str, Any],
  model: Optional[str] = None,
  temperature: float = 0.2,
) -> str:
  """
  统一的 ChatCompletion 调用封装，返回 LLM 的原始文本内容。
  """
  api_key = DEEPSEEK_API_KEY or _require_env("DEEPSEEK_API_KEY")
  model_name = model or DEEPSEEK_MODEL

  url = f"{DEEPSEEK_API_BASE.rstrip('/')}/v1/chat/completions"
  headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
  }

  messages = [
    {
      "role": "system",
      "content": system_prompt,
    },
    {
      "role": "user",
      "content": json.dumps(user_payload, ensure_ascii=False),
    },
  ]

  body = {
    "model": model_name,
    "messages": messages,
    "temperature": temperature,
  }

  resp = requests.post(url, headers=headers, json=body, timeout=120)
  resp.raise_for_status()
  data = resp.json()

  # 假设是 OpenAI 风格的响应结构
  try:
    return data["choices"][0]["message"]["content"]
  except Exception as exc:
    raise RuntimeError(f"解析 DeepSeek 响应失败: {data}") from exc


def _extract_json_block(text: str) -> str:
  """
  从 LLM 返回的文本中尽量截取出干净的 JSON 块。
  简单策略：找第一个 '{' 和最后一个 '}'，取中间部分。
  """
  start = text.find("{")
  end = text.rfind("}")
  if start == -1 or end == -1 or end <= start:
    raise ValueError("未在 LLM 输出中找到有效 JSON 块")
  return text[start : end + 1]


def annotate_subtitles(
  skeleton: Dict[str, Any],
  model: Optional[str] = None,
  temperature: float = 0.2,
) -> Dict[str, Any]:
  """
  使用 DeepSeek 对英文骨架字幕进行：
    1) 逐句中文翻译；
    2) 全局难度估计；
    3) 主题标签提取；
    4) 简介撰写；
    5) 知识卡片抽取。

  输入 skeleton 结构示例：
    {
      "title": "...",
      "author": "...",
      "difficulty": 0,
      "tags": [],
      "description": "",
      "subtitles": [
        {"start": "...", "end": "...", "text_en": "Hello.", "text_cn": ""},
        ...
      ],
      "knowledge": []
    }

  返回的 Dict 结构应该与用户给出的示例一致：
    {
      "title": "中文标题",
      "author": "作者",
      "difficulty": 2,
      "tags": [...],
      "description": "...",
      "subtitles": [
        {"start": "...", "end": "...", "text_en": "...", "text_cn": "..."},
        ...
      ],
      "knowledge": [...]
    }

  注意：最终结果还会经过 content_validator 进一步约束和修正。
  """
  system_prompt = (
    "你是一个严谨的英语教学编辑助手，负责把已经结构化好的英文字幕，"
    "转换成适合精读学习的平台内容。请严格按照以下要求输出：\\n"
    "1. 不要修改任何英文字幕 text_en 的内容，也不要修改 start/end 时间；\\n"
    "2. 只在每条字幕中补充 text_cn 字段，给出自然流畅的中文翻译；\\n"
    "3. 在顶层生成以下字段：title(中文标题)、author(作者或频道名)、"
    "difficulty(整数 1-3)、tags(1-2 个中文主题标签)、description(一段中文简介)、"
    "subtitles(中英文字幕数组)、knowledge(知识卡片数组)；\\n"
    "4. difficulty: 1=入门，2=进阶，3=大师，根据整体语言难度和表达复杂度判断；\\n"
    "5. knowledge 中每个元素包含 trigger_word 和 data，data 内必须有 def(中文释义)，"
    "可选 ipa(音标)、sentence(例句)、type(类型，"
    "只能是 word/phrase/phrasal_verb/expression/spoken_pattern/idiom/proper_noun/slang 之一)；\\n"
    "6. 请严格输出合法 JSON，不要包含任何注释、额外说明或 Markdown；"
    "确保可以被 json.loads 直接解析。"
  )

  raw_text = call_deepseek_chat(
    system_prompt=system_prompt,
    user_payload=skeleton,
    model=model,
    temperature=temperature,
  )

  # 先尝试直接解析
  try:
    return json.loads(raw_text)
  except Exception:
    # 再尝试从中提取 JSON 代码块
    json_block = _extract_json_block(raw_text)
    try:
      return json.loads(json_block)
    except Exception as exc:
      raise RuntimeError(
        "无法从 DeepSeek 输出中解析出合法 JSON，请检查 Prompt 或返回内容"
      ) from exc


__all__ = ["annotate_subtitles"]

