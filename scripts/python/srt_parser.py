import pysrt
from typing import List, Dict

class SubtitleEntry:
    """字幕条目"""
    def __init__(self, start: float, end: float, text: str):
        self.start = start
        self.end = end
        self.text = text

    def to_dict(self) -> Dict:
        return {
            'start': self.start,
            'end': self.end,
            'text_en': self.text
        }

def parse_srt(srt_path: str) -> List[SubtitleEntry]:
    """
    解析 SRT 文件

    Args:
        srt_path: SRT 文件路径

    Returns:
        字幕条目列表
    """
    try:
        subs = pysrt.open(srt_path, encoding='utf-8')
    except UnicodeDecodeError:
        # 尝试 GBK 编码
        subs = pysrt.open(srt_path, encoding='gbk')

    entries = []
    for sub in subs:
        # 将时间转换为秒（浮点数）
        start = sub.start.hours * 3600 + sub.start.minutes * 60 + sub.start.seconds + sub.start.milliseconds / 1000
        end = sub.end.hours * 3600 + sub.end.minutes * 60 + sub.end.seconds + sub.end.milliseconds / 1000

        entries.append(SubtitleEntry(
            start=start,
            end=end,
            text=sub.text.replace('\n', ' ')  # 合并多行
        ))

    return entries

def format_time(seconds: float) -> str:
    """将秒数格式化为 HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)

    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"