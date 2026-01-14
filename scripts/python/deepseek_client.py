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
from typing import Any, Dict, Optional, List

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


def _call_deepseek_for_chunk(
  payload: Dict[str, Any],
  model: Optional[str],
  temperature: float,
) -> Dict[str, Any]:
  """
  对单个字幕分片调用 DeepSeek，并解析为 JSON。
  - DeepSeek 只负责「翻译 + 语言学属性 + 元信息」，不负责时间轴等可本地计算的信息；
  - 字幕部分仅返回一个精简的 subtitles 对象数组：每项只包含 start + text_cn，
    其余字段全部由脚本基于 skeleton 填充。
  """
  system_prompt = """
你是一个严谨且懂“地道口语”的英语教学编辑助手，负责把英文字幕转换成适合“20-35岁女性”学习的精读内容。

【整体目标】
- 输入：一段英文字幕骨架 (subtitles 数组，仅包含 start/end/text_en 等字段)；
- 输出：只在需要模型理解的地方动脑，包括：
  1) 每条字幕对应的中文字幕 subtitles；
  2) 视频级别的元信息：title, author, difficulty, tags, description；
  3) 知识卡片数组 knowledge（围绕词汇/短语/表达的精读信息）。
- 时间戳、原句等结构性信息由调用方本地计算，你不需要重复返回。

【1. 字幕翻译 subtitles】
1. 不要修改英文字幕 text_en 的内容，也不要修改 start/end 时间（这些都由调用方管理）；
2. 只需要为每条字幕生成一个中文翻译，要求自然、口语化，符合 20-35 岁女性日常交流习惯；
3. 请在顶层生成字段 subtitles，它是一个对象数组：
   - subtitles[i] 必须严格对应输入 subtitles[i]；
   - 每个对象的结构必须是：
       { "start": <原样照抄输入 subtitles[i].start 的值>, "text_cn": "这一行的中文字幕" }
   - 数组长度必须与输入 subtitles 完全一致，不能多也不能少；
   - text_cn 必须是非空字符串，不能省略也不能留空。

【2. 元信息 meta】
4. 在顶层生成字段：title, author, difficulty(1-3), tags, description；
5. tags 字段：必须从以下 8 个标准标签中选择 1-2 个，不要自造标签：
   ["日常生活", "时尚穿搭", "美食购物", "城市旅行", "个人成长", "观点表达", "文化体验", "职场社交"]

【3. 知识卡片 knowledge】
6. 目标密度：请确保知识点覆盖全面。
   - 不仅提取生僻难词，也要提取：
     - 简单词的地道用法（如 "do" 的特殊含义）；
     - 高频口语词（如 "literally", "vibe"）；
     - 实用连接词和口语表达。
   - 只要对 ESL 学习者有积累价值，就可以提取。

7. knowledge 应该是数组，每个元素包含：
   - trigger_word: 触发词（单词 / 短语 / 表达的原文）；
   - data: 对应的详细信息。

  【7.1 公共字段 (所有类型必填)】
   data.type  (枚举: "word" / "phrase" / "expression")
   data.def   (中文释义，精准对应当前语境)
   data.ipa   (音标)
   data.example (对象): 
     - en: 一个简练、标准、生活化的额外例句（不要照抄字幕原句）；
     - cn: 上面例句的自然中文翻译；
   data.note  (字符串): 说明褒贬色彩、使用禁忌、情绪氛围（如“常用于女生自嘲”、“比 happy 更高级”）。

  【7.2 若 type = "word" (单词)】
   - 补充:
     data.pos          (词性)
     data.collocations (2-3 个高频搭配)
     data.synonyms     (近义词)
     data.antonyms     (反义词)
     data.derived_form (关联词形，如名词/形容词形式)

  【7.3 若 type = "phrase" (短语)】
   - 补充:
     data.structure (必须标明 sb./sth. 的位置)
     data.synonyms  (同义替换)

  【7.4 若 type = "expression" (常用表达/习语)】
   - 补充:
     data.function_label  (功能, 如 "委婉拒绝"、"表达惊讶")
     data.scenario        (适用场景)
     data.response_guide  (接话指南：给出 1-2 个地道回答方式)

【重要约束】
8. 不要返回 data.source、sentence 或任何带时间戳的字段；
   - 原字幕英文句子、中文翻译以及时间戳由调用方根据 trigger_word 与字幕本地匹配生成。

【输出格式】
9. 顶层必须返回一个严格的 JSON 对象（不要包含 Markdown / 注释），结构如下：
   {
     "title": "...",
     "author": "...",
     "difficulty": 2,
     "tags": ["日常生活"],
     "description": "...",
     "subtitles": [
       { "start": "...", "text_cn": "句1的中文" },
       { "start": "...", "text_cn": "句2的中文" }
     ],
     "knowledge": [ { "trigger_word": "...", "data": { ... } }, ... ]
   }

10. **请确保返回内容可以被 json.loads() 直接解析，
    字符串必须正确加引号，不能有多余逗号。**
"""

  # 为了兼容偶尔因为符号/转义导致的 JSON 解析失败，这里做有限次数的重试。
  max_attempts = 3
  last_exc: Optional[Exception] = None

  for attempt in range(1, max_attempts + 1):
    raw_text = call_deepseek_chat(
      system_prompt=system_prompt,
      user_payload=payload,
      model=model,
      temperature=temperature,
    )

    print(f"{raw_text}")

    try:
      # 先尝试直接解析
      return json.loads(raw_text)
    except Exception:
      try:
        # 再尝试从中提取 JSON 代码块
        json_block = _extract_json_block(raw_text)
        return json.loads(json_block)
      except Exception as exc:
        last_exc = exc
        # 如果还没到最大次数，打印告警并重试
        if attempt < max_attempts:
          print(
            f"[DEEPSEEK_RETRY] 第 {attempt} 次 JSON 解析失败，"
            f"正在重试 {attempt + 1}/{max_attempts} ..."
          )
          continue
        # 超过最大次数则抛出错误
        raise RuntimeError(
          "多次重试后仍无法从 DeepSeek 输出中解析出合法 JSON，"
          "请检查 Prompt 或返回内容。"
        ) from last_exc


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

  内部自动对字幕进行分片，多次调用 DeepSeek，避免单次上下文/输出被截断。

  返回结构与用户示例一致：
    {
      "title": "中文标题",
      "author": "作者",
      "difficulty": 2,
      "tags": [...],
      "description": "...",
      "subtitles": [...],
      "knowledge": [...]
    }
  """
  subtitles: List[Dict[str, Any]] = skeleton.get("subtitles") or []

  if not subtitles:
    return {
      "title": skeleton.get("title") or "未命名视频",
      "author": skeleton.get("author") or "",
      "difficulty": 2,
      "tags": skeleton.get("tags") or [],
      "description": skeleton.get("description") or "",
      "subtitles": [],
      "knowledge": [],
    }

  # 按字幕条目分片，避免一次发送过多内容导致 DeepSeek 截断。
  # 这里采用简单的条目数粒度控制，后续如有需要可改为按总字符数。
  max_items_per_chunk = 30

  all_text_cn: List[str] = ["" for _ in subtitles]
  all_knowledge: List[Dict[str, Any]] = []

  # 元信息（标题/作者/难度/标签/简介）：优先取第一批的结果，否则回退 skeleton
  meta_title = None
  meta_author = None
  meta_difficulty = None
  meta_tags: Optional[List[str]] = None
  meta_description = None

  total_chunks = (len(subtitles) + max_items_per_chunk - 1) // max_items_per_chunk

  for chunk_index in range(total_chunks):
    start_idx = chunk_index * max_items_per_chunk
    end_idx = min((chunk_index + 1) * max_items_per_chunk, len(subtitles))
    chunk_subs = subtitles[start_idx:end_idx]

    chunk_payload = {
      "title": skeleton.get("title") or "未命名视频",
      "author": skeleton.get("author") or "",
      "difficulty": skeleton.get("difficulty") or 0,
      "tags": skeleton.get("tags") or [],
      "description": skeleton.get("description") or "",
      "subtitles": chunk_subs,
      "knowledge": [],
    }

    print(f"  -> 请求 DeepSeek，分片 {chunk_index + 1}/{total_chunks}，字幕条目数: {len(chunk_subs)}")
    chunk_result = _call_deepseek_for_chunk(chunk_payload, model=model, temperature=temperature)

    # 第一片：采纳元信息
    if chunk_index == 0:
      meta_title = chunk_result.get("title") or chunk_payload["title"]
      meta_author = chunk_result.get("author") or chunk_payload["author"]
      meta_difficulty = chunk_result.get("difficulty")
      meta_tags = chunk_result.get("tags") or chunk_payload["tags"]
      meta_description = chunk_result.get("description") or chunk_payload["description"]

    # 合并字幕中文翻译：从 subtitles 对象数组中读取 text_cn。
    llm_subs: List[Dict[str, Any]] = chunk_result.get("subtitles") or []
    if len(llm_subs) != len(chunk_subs):
      print(
        f"[WARN] DeepSeek 返回的 subtitles 数量({len(llm_subs)}) "
        f"与输入分片数量({len(chunk_subs)}) 不一致，将按索引尽量对齐。"
      )

    for local_i in range(len(chunk_subs)):
      global_i = start_idx + local_i
      text_cn = ""
      if local_i < len(llm_subs) and isinstance(llm_subs[local_i], dict):
        raw_cn = llm_subs[local_i].get("text_cn")
        if isinstance(raw_cn, str):
          text_cn = raw_cn.strip()
      all_text_cn[global_i] = text_cn

    # 合并知识卡片
    chunk_kn = chunk_result.get("knowledge") or []
    if isinstance(chunk_kn, list):
      all_knowledge.extend(chunk_kn)

  # 组装整体 subtitles 结构：这里只需要把「每条字幕的中文」带回去，
  # start/end/text_en 仍由后续脚本基于 skeleton 统一合并。
  merged_subtitles: List[Dict[str, Any]] = []
  for idx, base in enumerate(subtitles):
    merged_subtitles.append(
      {
        "start": base.get("start"),
        "text_cn": all_text_cn[idx],
      }
    )

  result: Dict[str, Any] = {
    "title": meta_title or skeleton.get("title") or "未命名视频",
    "author": meta_author or skeleton.get("author") or "",
    "difficulty": meta_difficulty if meta_difficulty is not None else 2,
    "tags": meta_tags or skeleton.get("tags") or [],
    "description": meta_description or skeleton.get("description") or "",
    "subtitles": merged_subtitles,
    "knowledge": all_knowledge,
  }

  return result


__all__ = ["annotate_subtitles"]
