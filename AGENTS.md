# Repository Guidelines

## Project Structure & Module Organization
- Next.js App Router lives in `app/` (pages, layouts, API routes).
- Shared UI goes in `components/` (e.g. `components/dashboard/`, `components/layout/`).
- Reusable logic is under `lib/` (auth, Supabase/Cloudflare integration, Zustand stores, utils, Zod validations).
- Static assets are in `public/`. Supabase SQL migrations live in `supabase/migrations/`.
- Python helper scripts for subtitle/content workflows are in `scripts/python/`.

## Build, Test, and Development Commands
- `npm run dev` – start the local dev server at `http://localhost:3000`.
- `npm run build` – production build; run before large refactors or release work.
- `npm run start` – run the built app in production mode.
- `npm run lint` – run ESLint with the shared config; fix or justify all warnings before committing.

## Coding Style & Naming Conventions
- TypeScript + React 19 + Next.js 16; prefer function components and hooks.
- Use 2‑space indentation, single quotes, and semicolons (match existing files).
- Components and React hooks: `PascalCase` (`Header`, `StatsCard`); variables/functions: `camelCase`.
- Keep client-only code in files marked with `"use client";` and avoid server-only APIs there.
- Run `npm run lint` after non-trivial changes; use the existing ESLint/Tailwind setup instead of ad‑hoc rules.

## Testing Guidelines
- No formal JS test framework is configured yet; testing is primarily manual via `npm run dev`.
- Before opening a PR, exercise login/register, video watch, and upload flows you touched.
- If you add critical business logic (auth, billing, content processing), consider adding a minimal test harness and keep tests under a `tests/` directory or next to the module.

## Commit & Pull Request Guidelines
- Current history uses short, capitalized summaries (e.g. `Initial commit`); follow that style in the imperative mood.
- Keep commits focused and descriptive: “Add Cloudflare upload finalize route” is better than “fix stuff”.
- For PRs, include: purpose, key changes, affected routes/components, and any config/env changes.
- Link related issues or docs (e.g. `manual-content-generate-guide.md`, `CLAUDE.md`) and add screenshots or GIFs for UI changes when possible.

## Agent-Specific Instructions
- 与最终用户的交流（包括回答问题、撰写文档示例等）请默认使用简体中文，除非用户明确要求使用其他语言。

---

# 📂 产品规格说明书 (PRD) - 最终执行版

**项目名称**：Immersive English (沉浸式英语精读平台)
**版本**：V1.0 (MVP)
**日期**：2025-12-20
**核心策略**：颜值即正义 · 素材即工具 · 脚本自动化内容生产

---

## 1. 产品愿景 (Mission)
打造一款专为小红书用户设计的**高颜值、沉浸式英语精读工具**。
摒弃传统网课的枯燥，利用 **Cloudflare 高清流媒体** 结合 **AI 辅助的精读卡片**，提供“看电影学英语”的极致体验。通过“激活码 Magic Link”实现私域流量的快速验证与变现。

## 2. 用户画像 (Persona)
*   **目标用户**：20-35岁，审美在线，碎片化学习者。
*   **核心痛点**：YouTube 搬运视频无讲解、现有 APP 界面陈旧、坚持不下来。
*   **交付价值**：极简的“素材+工具”体验，截图即海报（高成图率）。

---

## 3. 功能规格 (Functional Specs)

### 3.1 核心体验：学习大厅 & 播放页
**页面路由**：`/watch/[videoId]`

#### A. 桌面端设计：三栏布局 (The Holy Grail)
*这是产品的灵魂，追求信息的高效与沉浸。*
*   **左栏 (60%) - 视听区**：
    *   全屏宽度的 Cloudflare 播放器。
    *   极简控制条：播放/暂停、倍速 (0.8x/1.0x/1.25x)、单句循环开关。
*   **中栏 (20%) - 脚本流 (Transcript Feed)**：
    *   **双语对照**：英文（大字高亮）+ 中文（小字灰色）。
    *   **自动跟随**：当前播放句永远处于视图中间。
    *   **交互**：点击句子 -> 视频跳转至该句开始。
*   **右栏 (20%) - 知识面板 (Knowledge Panel)**：
    *   **触发机制**：
        1.  **被动**：视频播放到特定时间，自动弹出关联卡片。
        2.  **主动**：用户点击中栏里的“下划线单词”。
    *   **卡片内容**：单词/短语、音标、精简释义、例句。

#### B. 移动端设计：垂直流 (The Vertical Feed)
*   **布局**：顶部视频固定，下方为可滚动的字幕流。
*   **交互**：卡片以“半屏弹窗 (Bottom Sheet)”形式从底部滑出。

### 3.2 增长系统：门禁与激活
**页面路由**：`/login`, `/join`

*   **Magic Link 机制**：
    *   用户访问链接 `app.com/join?code=VIP888`。
    *   系统自动校验 Code 有效性。
    *   校验通过 -> 跳转注册页（自动填码）-> 注册即激活。
    *   校验失败 -> 提示“链接失效”。

### 3.3 后台管理：API 优先 (API-First Admin)
*   **策略**：MVP 阶段不开发复杂的上传前端页面，采用 **本地脚本 + API** 模式。
*   **流程**：本地 Python 脚本调用 Claude/Whisper 处理数据 -> 调用后端 API 批量入库。

---

## 4. 技术架构与 API 协议 (Technical Architecture)

### 4.1 技术栈
*   **Framework**: Next.js 14 (App Router)
*   **DB & Auth**: Supabase (PostgreSQL)
*   **Media**: Cloudflare Stream
*   **Styling**: Tailwind CSS + Shadcn/ui
*   **State**: Zustand (用于播放器 <-> 字幕流 <-> 卡片流 的毫秒级同步)

### 4.2 自动化上传接口 (Automation API)
*供本地 Python 脚本调用，实现批量上传。*
*Header*: `x-admin-secret: [ENV_SECRET]`

**接口 A: 初始化上传 (`POST /api/admin/upload/init`)**
*   **功能**：获取 Cloudflare 直传链接。
*   **Response**: `{ "uploadUrl": "https://...", "tempId": "..." }`

**接口 B: 提交完整内容 (`POST /api/admin/upload/finalize`)**
*   **功能**：视频传完后，同步元数据、双语字幕、知识卡片。
*   **Payload (核心数据结构)**:
    ```json
    {
      "cf_video_id": "sf687...", // Cloudflare ID
      "meta": {
        "title": "Vlog 01",
        "poster": "http://...",
        "tags": ["Daily"]
      },
      "subtitles": [
        { "start": 0.5, "end": 2.1, "text_en": "Hello!", "text_cn": "你好！" }
      ],
      "cards": [
        {
          "trigger_word": "Hello",
          "data": { "def": "打招呼", "ipa": "..." }
        }
      ]
    }
    ```

---

## 5. 数据库设计 (Database Schema)

### `videos` (视频主表)
| Field | Type | Note |
| :--- | :--- | :--- |
| `id` | UUID | PK |
| `cf_video_id` | Text | Cloudflare Stream ID |
| `title` | Text | 视频标题 |
| `status` | Text | 'published' / 'processing' |
| `created_at` | Timestamptz | |

### `subtitles` (字幕数据)
*设计决策：使用 JSONB 存储，减少关联查询，提升读取性能。*
| Field | Type | Note |
| :--- | :--- | :--- |
| `id` | UUID | PK |
| `video_id` | UUID | FK -> videos.id |
| `content` | **JSONB** | 结构：`[{start, end, text_en, text_cn}]` |

### `knowledge_cards` (知识卡片)
| Field | Type | Note |
| :--- | :--- | :--- |
| `id` | UUID | PK |
| `video_id` | UUID | FK -> videos.id |
| `trigger_word`| Text | 触发词 (用于前端高亮显示) |
| `data` | **JSONB** | 结构：`{ipa, def, sentence, type}` |

### `access_codes` (激活码)
| Field | Type | Note |
| :--- | :--- | :--- |
| `code` | Text | PK, e.g. "VIP-XHS-001" |
| `user_id` | UUID | FK -> auth.users.id (绑定后填充) |
| `valid_days` | Int | 有效期天数 |

---

## 6. 开发行动指南 (Action Plan)

建议按以下顺序进行开发，最快验证核心价值：

### Phase 1: 数据管道 (Data Pipeline)
1.  **Supabase**: 建表 (执行 SQL)。
2.  **Next.js API**: 开发 `init` 和 `finalize` 两个 API 接口。
3.  **Local Script**: 让 Claude Code 写一个 Python 脚本：
    *   读取本地 MP4 + SRT。
    *   调用 LLM 生成双语 JSON 和卡片 JSON。
    *   调用 API 上传。
4.  **验证**: 跑通脚本，确保 Supabase 里有了真实可用的数据。

### Phase 2: 核心播放器 (The Watch Page)
1.  **Layout**: 使用 Tailwind 实现“三栏布局”框架。
2.  **Player**: 集成 Cloudflare React SDK。
3.  **Sync Engine (难点)**:
    *   实现 `usePlayerStore` (Zustand)。
    *   编写逻辑：`onTimeUpdate` -> 查找当前字幕 Index -> 滚动高亮。
4.  **Cards**: 实现点击单词 -> 右侧显示卡片数据。

### Phase 3: 门禁与大厅 (Gate & Dashboard)
1.  **Auth**: 实现 Magic Link 逻辑。
2.  **Home**: 简单的 Grid 布局展示视频列表。 
