#!/bin/bash

set -euo pipefail

# 配置
# 优先使用环境变量 / .env.local 中的配置，便于在不同环境复用脚本
if [ -f ".env.local" ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env.local
  set +a
fi

MATERIALS_DIR="${MATERIALS_DIR:-./materials}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
: "${ADMIN_SECRET:?ADMIN_SECRET 未设置，请在 .env.local 中配置}"

# 检查是否有视频和字幕文件
VIDEO_FILES=($MATERIALS_DIR/*.mp4)
SRT_FILES=($MATERIALS_DIR/*.srt)

if [ ${#VIDEO_FILES[@]} -eq 0 ] || [ ${#SRT_FILES[@]} -eq 0 ]; then
    echo "错误: 没有找到视频或字幕文件"
    exit 1
fi

# 创建临时目录
TEMP_DIR=$(mktemp -d)
echo "使用临时目录: $TEMP_DIR"

# 处理文件
for ((i=0; i<${#VIDEO_FILES[@]}; i++)); do
    VIDEO_FILE=${VIDEO_FILES[$i]}
    VIDEO_NAME=$(basename "$VIDEO_FILE" .mp4)

    # 找到对应的SRT文件
    SRT_FILE="$MATERIALS_DIR/$VIDEO_NAME.srt"
    if [ ! -f "$SRT_FILE" ]; then
        echo "跳过 $VIDEO_FILE - 找不到对应的SRT文件"
        continue
    fi

    echo -e "\n====================================="
    echo "处理文件: $VIDEO_NAME"
    echo "视频: $VIDEO_FILE"
    echo "字幕: $SRT_FILE"

    # Step 1: 获取上传URL
    echo "Step 1: 获取Cloudflare上传URL..."
    UPLOAD_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/admin/upload/init" \
        -H "x-admin-secret: $ADMIN_SECRET" \
        -H "Content-Type: application/json" \
        -d '{}')

    UPLOAD_URL=$(echo $UPLOAD_RESPONSE | jq -r '.data.uploadUrl')
    UPLOAD_UID=$(echo $UPLOAD_RESPONSE | jq -r '.data.uid')

    if [ -z "$UPLOAD_URL" ] || [ "$UPLOAD_URL" == "null" ]; then
        echo "错误: 获取上传URL失败 - $UPLOAD_RESPONSE"
        continue
    fi

    echo "成功获取上传URL - UID: $UPLOAD_UID"

    # Step 2: 上传视频到Cloudflare
    echo "Step 2: 上传视频到Cloudflare Stream..."
    # Cloudflare Direct Upload 需要 multipart/form-data POST，字段名为 file
    UPLOAD_RESULT=$(curl -s -w "\n%{http_code}" -X POST "$UPLOAD_URL" \
        -F "file=@$VIDEO_FILE")

    UPLOAD_STATUS=$(echo "$UPLOAD_RESULT" | awk 'END {print $0}')
    UPLOAD_BODY=$(echo "$UPLOAD_RESULT" | sed '$d')

    if [[ "$UPLOAD_STATUS" != 2* ]]; then
        echo "错误: 视频上传失败 - 状态码: $UPLOAD_STATUS - 响应: $UPLOAD_BODY"
        continue
    fi

    # Direct Upload 返回的视频 ID 与 init 接口中的 uid 一致，这里直接复用
    CF_VIDEO_ID="$UPLOAD_UID"
    echo "成功上传视频 - CF_VIDEO_ID: $CF_VIDEO_ID"

    # Step 3: 解析和处理SRT字幕（优先使用预生成的 seed JSON）
    echo "Step 3: 解析和处理SRT字幕..."

    SEED_FILE="seed/${VIDEO_NAME}.content.json"

    if [ -f "$SEED_FILE" ]; then
        echo "使用 seed 文件: $SEED_FILE 生成双语字幕和知识卡片..."
        META_TITLE=$(jq -r '.meta.title' "$SEED_FILE")
        META_POSTER=$(jq -r '.meta.poster' "$SEED_FILE")
        META_DURATION=$(jq -r '.meta.duration' "$SEED_FILE")
        BILINGUAL_SUBTITLES=$(jq '.subtitles' "$SEED_FILE")
        KNOWLEDGE_CARDS=$(jq '.cards' "$SEED_FILE")
    else
        echo "警告: 未找到 seed 文件 $SEED_FILE，使用默认占位数据。"
        META_TITLE="$VIDEO_NAME"
        META_POSTER="https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Video+Thumbnail"
        META_DURATION=120.5

        # 生成占位双语字幕（仅作为兜底，不建议用于正式数据）
        BILINGUAL_SUBTITLES=$(cat << 'EOF'
[
  {
    "start": 0.5,
    "end": 2.1,
    "text_en": "Hello everyone, welcome to my channel.",
    "text_cn": "大家好，欢迎来到我的频道。"
  },
  {
    "start": 2.2,
    "end": 4.8,
    "text_en": "Today we're going to talk about learning English.",
    "text_cn": "今天我们将讨论学习英语的话题。"
  },
  {
    "start": 5.0,
    "end": 7.5,
    "text_en": "It's really important to practice every day.",
    "text_cn": "每天练习真的很重要。"
  }
]
EOF
)

        # 生成占位知识卡片
        KNOWLEDGE_CARDS=$(cat << 'EOF'
[
  {
    "trigger_word": "channel",
    "data": {
      "ipa": "/ˈtʃænl/",
      "def": "频道，渠道",
      "sentence": "Welcome to my channel.",
      "type": "word"
    }
  },
  {
    "trigger_word": "practice",
    "data": {
      "ipa": "/ˈpræktɪs/",
      "def": "练习，实践",
      "sentence": "It's important to practice every day.",
      "type": "word"
    }
  }
]
EOF
)
    fi

    # Step 4: 保存到Supabase
    echo "Step 4: 保存到Supabase..."

    FINALIZE_PAYLOAD=$(cat <<EOF
{
    "cf_video_id": "$CF_VIDEO_ID",
    "meta": {
        "title": "$META_TITLE",
        "poster": "$META_POSTER",
        "duration": $META_DURATION
    },
    "subtitles": $BILINGUAL_SUBTITLES,
    "cards": $KNOWLEDGE_CARDS
}
EOF
)

    FINALIZE_RESPONSE=$(curl -s -X POST "$API_BASE_URL/api/admin/upload/finalize" \
        -H "x-admin-secret: $ADMIN_SECRET" \
        -H "Content-Type: application/json" \
        -d "$FINALIZE_PAYLOAD")

    echo "Finalize响应: $FINALIZE_RESPONSE"

    if echo "$FINALIZE_RESPONSE" | grep -q '"success":true'; then
        echo "成功保存到Supabase"
    else
        echo "错误: 保存到Supabase失败"
    fi

done

# 清理临时目录
rm -rf $TEMP_DIR

echo -e "\n====================================="
echo "处理完成"
