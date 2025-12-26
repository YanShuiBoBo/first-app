#!/bin/bash

# 不使用 -e/-u，避免 curl 网络错误时整脚本直接退出；我们手动检查错误并继续处理后续目录
set -o pipefail

# 批量导入目录型素材：
# - 根目录下每个子文件夹视为一个视频
# - 默认从子文件夹内读取 output.mp4 作为视频文件（否则取第一个 *.mp4）
# - 使用子文件夹名称（去掉 emoji、竖线等符号）作为英文标题
# - 通过 /api/admin/upload/init + /api/admin/upload/finalize 完成入库
# - 目前只关心「标题 + 视频」，其它字段使用占位值，后续可在素材管理或脚本中覆盖
#
# 依赖：
# - .env.local 中配置 ADMIN_SECRET、API_BASE_URL
# - jq, curl, iconv 可用

# 载入 .env.local（如果存在）
if [ -f ".env.local" ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env.local
  set +a
fi

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
: "${ADMIN_SECRET:?ADMIN_SECRET 未设置，请在 .env.local 中配置}"

# 素材根目录：优先使用第一个参数，否则使用 MATERIALS_DIR，否则默认 ./materials
ROOT_DIR="${1:-${MATERIALS_DIR:-./materials}}"

if [ ! -d "$ROOT_DIR" ]; then
  echo "错误：素材根目录不存在：$ROOT_DIR"
  exit 1
fi

echo "素材根目录：$ROOT_DIR"

# 占位封面图（后续可在素材管理中修改为真实 poster）
DEFAULT_POSTER_URL="https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Video+Thumbnail"

# 占位字幕（满足后端校验要求，后续会被真正字幕覆盖）
PLACEHOLDER_SUBTITLES='[
  {
    "start": 0,
    "end": 0.5,
    "text_en": "Placeholder subtitle",
    "text_cn": "占位字幕，请后续替换"
  }
]'

sanitize_title() {
  local raw="$1"
  # 替换竖线为连字符，避免标题里出现 JSON 不友好字符
  local t="${raw//|/ - }"
  # 去掉 emoji / 非 ASCII 字符（需要 iconv）
  if command -v iconv >/dev/null 2>&1; then
    t=$(printf '%s' "$t" | iconv -c -f UTF-8 -t ASCII//TRANSLIT)
  fi
  # 合并多余空格并去除首尾空格
  t=$(printf '%s' "$t" | tr -s ' ')
  t="${t#"${t%%[![:space:]]*}"}"  # 去前导空格
  t="${t%"${t##*[![:space:]]}"}"  # 去尾随空格

  if [ -z "$t" ]; then
    t="$raw"
  fi

  printf '%s' "$t"
}

for dir in "$ROOT_DIR"/*/; do
  # 过滤掉非目录或隐藏目录
  [ -d "$dir" ] || continue
  base="$(basename "$dir")"
  if [ "$base" = ".DS_Store" ]; then
    continue
  fi

  echo
  echo "====================================="
  echo "处理目录：$dir"

  # 选择视频文件：优先 output.mp4，否则取第一个 *.mp4
  video_file=""
  if [ -f "$dir/output.mp4" ]; then
    video_file="$dir/output.mp4"
  else
    first_mp4=$(find "$dir" -maxdepth 1 -type f -name "*.mp4" | head -n 1 || true)
    if [ -n "$first_mp4" ]; then
      video_file="$first_mp4"
    fi
  fi

  if [ -z "$video_file" ]; then
    echo "跳过：未找到 mp4 文件"
    continue
  fi

  raw_title="$base"
  title=$(sanitize_title "$raw_title")

  echo "标题：$title"
  echo "视频：$video_file"

  # 优先尝试从当前目录中查找首图文件（png/jpg/jpeg/webp）
  poster_url="$DEFAULT_POSTER_URL"
  cover_image_id=""

  poster_file=$(find "$dir" -maxdepth 1 -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) | head -n 1 || true)
  if [ -n "$poster_file" ]; then
    echo "发现首图文件：$poster_file"
    echo "上传首图到 Cloudflare Images..."
    image_response=$(curl -s -X POST "$API_BASE_URL/api/admin/images/upload" \
      -F "file=@$poster_file")

    image_success=$(echo "$image_response" | jq -r '.success // false')
    if [ "$image_success" = "true" ]; then
      poster_url=$(echo "$image_response" | jq -r '.data.deliveryUrl')
      cover_image_id=$(echo "$image_response" | jq -r '.data.id // ""')
      echo "首图上传成功，poster: $poster_url"
    else
      echo "警告：首图上传失败，将使用默认占位图：$image_response"
    fi
  else
    echo "未找到首图文件，使用默认占位图"
  fi

  # Step 1: 获取上传 URL
  echo "Step 1: 获取 Cloudflare 上传 URL..."
  upload_response=$(curl -s -X POST "$API_BASE_URL/api/admin/upload/init" \
    -H "x-admin-secret: $ADMIN_SECRET" \
    -H "Content-Type: application/json" \
    -d '{}')

  upload_success=$(echo "$upload_response" | jq -r '.success // false')
  if [ "$upload_success" != "true" ]; then
    echo "错误：获取上传 URL 失败：$upload_response"
    continue
  fi

  upload_url=$(echo "$upload_response" | jq -r '.data.uploadUrl')
  upload_uid=$(echo "$upload_response" | jq -r '.data.uid')

  if [ -z "$upload_url" ] || [ "$upload_url" = "null" ]; then
    echo "错误：返回中没有 uploadUrl：$upload_response"
    continue
  fi

  echo "成功获取上传 URL，UID：$upload_uid"

  # Step 2: 上传视频到 Cloudflare
  echo "Step 2: 上传视频到 Cloudflare Stream..."
  if ! upload_result=$(curl -s -w "\n%{http_code}" -X POST "$upload_url" \
    -F "file=@$video_file"); then
    echo "错误：curl 上传请求失败（网络或 Cloudflare 直传 URL 问题）"
    continue
  fi

  upload_status=$(echo "$upload_result" | awk 'END {print $0}')
  upload_body=$(echo "$upload_result" | sed '$d')

  if [[ "$upload_status" != 2* ]]; then
    echo "错误：视频上传失败 - 状态码: $upload_status - 响应: $upload_body"
    continue
  fi

  cf_video_id="$upload_uid"
  echo "成功上传视频，CF_VIDEO_ID：$cf_video_id"

  # Step 3: 调用 finalize 入库（只填充标题 + 占位/本地首图 meta）
  echo "Step 3: 保存到 Supabase..."

  finalize_payload=$(jq -n \
    --arg cfid "$cf_video_id" \
    --arg title "$title" \
    --arg poster "$poster_url" \
    --arg cover_id "$cover_image_id" \
    --argjson subtitles "$PLACEHOLDER_SUBTITLES" \
    '{
      cf_video_id: $cfid,
      meta: ({
        title: $title,
        poster: $poster,
        duration: 0
      } + (if ($cover_id // "") != "" then { cover_image_id: $cover_id } else {} end)),
      subtitles: $subtitles,
      cards: []
    }')

  finalize_response=$(curl -s -X POST "$API_BASE_URL/api/admin/upload/finalize" \
    -H "x-admin-secret: $ADMIN_SECRET" \
    -H "Content-Type: application/json" \
    -d "$finalize_payload")

  echo "Finalize 响应：$finalize_response"

  finalize_success=$(echo "$finalize_response" | jq -r '.success // false')
  if [ "$finalize_success" != "true" ]; then
    echo "错误：保存到 Supabase 失败"
    continue
  fi

  echo "✅ 导入完成：$title （CF_VIDEO_ID: $cf_video_id）"
done

echo
echo "====================================="
echo "全部目录处理完成"
