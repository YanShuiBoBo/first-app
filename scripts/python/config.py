import os
from dotenv import load_dotenv

# 加载环境变量
# 优先加载根目录下的 .env（如果存在），再尝试加载 .env.local，方便复用 Next.js 的配置
load_dotenv()
load_dotenv(".env.local", override=False)

class Config:
    """配置管理类"""

    # API 端点
    API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3000')
    ADMIN_SECRET = os.getenv('ADMIN_SECRET')

    # Claude API
    CLAUDE_API_KEY = os.getenv('CLAUDE_API_KEY')
    CLAUDE_MODEL = os.getenv('CLAUDE_MODEL', 'claude-3-5-sonnet-20241022')

    # 重试配置
    MAX_RETRIES = 3
    RETRY_DELAY = 2  # 秒

    # 文件路径
    TEMP_DIR = os.getenv('TEMP_DIR', './temp')

    @classmethod
    def validate(cls):
        """验证必需的配置项"""
        required = ['ADMIN_SECRET', 'CLAUDE_API_KEY']
        missing = [key for key in required if not getattr(cls, key)]

        if missing:
            raise ValueError(f'缺少环境变量: {", ".join(missing)}')

# 验证配置
Config.validate()
