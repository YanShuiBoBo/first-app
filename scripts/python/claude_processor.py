import json
import anthropic
from typing import List, Dict
from config import Config

client = anthropic.Anthropic(api_key=Config.CLAUDE_API_KEY)

def generate_translations_and_cards(subtitles: List[Dict]) -> Dict:
    """
    使用 Claude API 生成中文翻译和知识卡片

    Args:
        subtitles: 英文字幕列表 [{"start": 0.5, "end": 2.1, "text_en": "Hello"}]

    Returns:
        {
            "subtitles": [...],  # 包含 text_cn 的完整字幕
            "cards": [...]       # 知识卡片
        }
    """

    # 构建 Prompt
    prompt = _build_prompt(subtitles)

    # 调用 Claude API
    response = client.messages.create(
        model=Config.CLAUDE_MODEL,
        max_tokens=8000,
        temperature=0.3,  # 较低温度保证格式稳定
        system="""你是一位专业的英语教学专家。你的任务是：
1. 将英文字幕翻译成准确、自然的中文
2. 识别重要的词汇、短语、习语、俚语
3. 为这些知识点生成详细的学习卡片

输出格式必须是严格的 JSON，不要包含任何其他文本。""",
        messages=[{
            "role": "user",
            "content": prompt
        }]
    )

    # 解析响应
    try:
        result = json.loads(response.content[0].text)
        return _validate_result(result, subtitles)
    except json.JSONDecodeError as e:
        raise ValueError(f"Claude 返回的 JSON 格式错误: {e}\n{response.content[0].text}")

def _build_prompt(subtitles: List[Dict]) -> str:
    """构建 Claude Prompt"""

    # 将字幕格式化为易读的文本
    subtitle_text = "\n".join([
        f"[{i+1}] {sub['text_en']}"
        for i, sub in enumerate(subtitles)
    ])

    return f"""请处理以下英文字幕：

{subtitle_text}

请完成以下任务：

1. **翻译**: 为每条字幕提供准确、自然的中文翻译
2. **知识卡片**: 识别视频中重要的语言点，生成学习卡片

## 输出格式（严格 JSON）

{{
  "subtitles": [
    {{
      "index": 1,
      "text_cn": "中文翻译"
    }}
  ],
  "cards": [
    {{
      "trigger_word": "原文词汇或短语",
      "data": {{
        "ipa": "音标（如果适用）",
        "def": "中文释义",
        "sentence": "原句或例句",
        "type": "word|phrase|idiom|slang"
      }}
    }}
  ]
}}

## 注意事项
- 翻译要符合中文表达习惯，避免逐字翻译
- 知识卡片只选择真正有学习价值的内容（5-10个）
- type 字段：word=单词, phrase=短语, idiom=习语, slang=俚语
- 不要添加任何 JSON 之外的文本
"""

def _validate_result(result: Dict, original_subtitles: List[Dict]) -> Dict:
    """验证并合并结果"""

    if 'subtitles' not in result or 'cards' not in result:
        raise ValueError("Claude 返回缺少必需字段")

    # 合并翻译到原字幕
    translation_map = {item['index']: item['text_cn'] for item in result['subtitles']}

    merged_subtitles = []
    for i, sub in enumerate(original_subtitles, 1):
        merged_subtitles.append({
            **sub,
            'text_cn': translation_map.get(i, '翻译缺失')
        })

    return {
        'subtitles': merged_subtitles,
        'cards': result['cards']
    }