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

---

## 7. 当前系统功能概览（MVP 实装）

### 7.1 首页 / 学习大厅 (`/`)
- **整体定位**：已实现一个面向已登录用户的「学习大厅」，承载素材发现、学习进度反馈和进入精读页的主入口。
- **桌面端布局**：
  - 顶部使用 `Header` 组件展示品牌 / 搜索框（实时过滤标题、作者、标签）。
  - Hero 区域：自动选取 `videos` 表中点击量最高的视频作为推荐，左侧为学习进度卡（StudyCalendar + StatsCard），右侧为「继续精读」大卡片，展示封面、时长、标签、难度、作者和累计学习次数。
  - 下方为「分类 Tabs + 筛选条」：支持按主题标签、难度（入门/进阶/大师）、学习状态（全部/未学/已学）、排序（最热/最新）组合筛选。
  - 视频宫格：使用 `GET /api/home/videos` 加载 `status = 'published'` 的视频，渲染响应式卡片（封面、标题、作者、难度 Badge、时长、已学完角标、播放热度等），点击进入 `/watch/[cf_video_id]`。
- **移动端布局**：
  - 顶部粘性导航：左侧 Logo，中间搜索输入，右侧通知图标；下方为可横向滚动的分类 Tabs（全部 + 前若干真实标签），右侧独立筛选入口。
  - Hero 卡片：沉浸式 16:9 大封面 + 「今日精选」标记 + 标题、时长、热度信息，点击跳转精读页。
  - 视频列表：两列瀑布流式卡片布局，支持懒加载（IntersectionObserver 逐批增加 `visibleCount`），底部 sentinel 触发「正在为你预加载更多精读视频...」。
  - 学习统计：在移动端通过 Bottom Sheet 展示月度学习日历和 StatsCard 概览。
- **数据与行为**：
  - 首页视频数据：由 `app/api/home/videos/route.ts` 从 `videos` 表读取（仅发布态），并通过短缓存（s-maxage / stale-while-revalidate）对外提供。
  - 用户学习统计：登录后在空闲时间调用 Supabase 的 `user_video_progress`、`user_study_days`，计算「已学视频数」、「本月打卡日期集合」，用于首页进度条和 StudyCalendar。
  - 「已学完」标记：根据 `user_video_progress.status = 'completed'` 生成 `completedVideoIds`，决定卡片右上角是否展示「已学完」标签，并支撑「仅看未学 / 仅看已学完」筛选。

### 7.2 精读页 / 播放页 (`/watch/[videoId]`)
- **数据加载**：
  - 客户端通过 Supabase RPC `get_video_with_content(video_cf_id)` 一次性获取：`video` 主信息、JSON 字幕列表、`knowledge_cards`。
  - 若查无数据 / 视频下线，则在非试看模式下标记 `notFound` 并自动重定向回首页。
- **布局与核心体验（桌面端）**：
  - 左侧「全能学习台 THE STATION」：包含 Cloudflare Stream 播放器、底部控制面板（播放/暂停、重听、单句循环模式、倍速、语种切换、影子跟读）、当前句放大面板（中英双行展示，知识点高亮）。
  - 右侧「交互式课本 THE LIST」：固定宽度侧栏，上方为 Tab（字幕 / 生词）与脚本视图模式（中/双语/英），主体区域在字幕流和生词流之间切换。
- **脚本流（Transcript Feed）**：
  - 使用二分查找 `findSubtitleIndex` + `handleTimeUpdate` 实时定位当前字幕索引；通过 `subtitlesContainerRef` + `subtitleItemRefs` 自动滚动，使当前句居于可视区域中部。
  - 支持「中 / 双语 / 英」三种脚本模式；英文行中根据 `knowledge_cards` 生成不重叠的高亮片段（按单词 / 短语 / 表达三类使用不同荧光笔样式）。
  - 点击整句：跳转 Cloudflare 播放进度到该句起始时间，并更新全局 `usePlayerStore` 中的当前句索引；在「次数循环」模式下会同步重置循环焦点。
  - 点击高亮单词：暂停视频，在桌面端弹出位置自适应的知识卡片浮层，在移动端切换为 Bottom Sheet 显示。
- **知识卡片 & 生词本（Knowledge Panel / Vocab）**：
  - 通过 `normalizeKnowledgeForDisplay` 将后端 `knowledge_cards` 规范化为前端结构，抽取 headword、音标、词性、释义、搭配/同反义、结构、语域、场景、例句、用法说明等字段。
  - 使用 `usedVocabKeys` 集合，只保留在当前字幕中实际高亮过的词汇；根据 `user_vocab_status` 和本地缓存区分「认识 / 不认识」，生词模式仅展示标记为「不认识」的词。
  - 提供类型筛选 Tabs（全部 / 单词 / 短语 / 表达）和「全部标记为认识」批量操作，后者通过 `/api/vocab/status/batch-known` 同步至 Supabase。
  - 每个生词卡片支持点击回放原句片段：优先调用 `playCardSnippet` 使用视频原声，缺失时间戳时自动回退到浏览器 TTS 或在字幕中定位该词所在句。
- **播放控制与高级学习工具**：
  - Cloudflare 播放器：使用 `@cloudflare/stream-react` 的 `Stream` 组件，配合 `streamRef` 控制播放、暂停、跳转、倍速。
  - 单句循环：支持「无限循环」和「次数循环」模式，使用 Zustand 全局状态 + `currentRepeatCountRef` 来在句尾自动回跳并计数，循环配置持久化到 `localStorage('ie-loop-config')`。
  - 影子跟读（Shadowing）：基于 `MediaRecorder` 实现本地录音和回放，支持一键开始/停止录音、针对当前句录制，多次练习后以不同状态样式区分。
  - 试看模式：当 URL 携带 `?trial=1` 时开启 6 分钟试看限制（`TRIAL_LIMIT_SECONDS`），到达限制后禁止继续跳转/播放，并展示遮罩弹窗，引导用户登录/注册。
- **学习记录与打卡**：
  - 进入精读页即通过 Supabase RPC `increment_video_view(p_cf_video_id)` 记录一次点击量，用于首页「最热」排序和 Hero 选择。
  - 完成一次精读（进入页面）后，会向 `user_video_progress` upsert 一条记录（标记为 `completed`）并更新 `last_watched_at`。
  - 通过 `user_study_days` upsert 本地日期（按中国时区处理），支持首页 StudyCalendar 的「本月打卡」视图。
  - 本地进度：每秒将当前播放进度写入 `localStorage('immersive:video-progress:${userOrGuest}:${videoId}')`，支持重新打开精读页时的断点续播提示。
- **移动端体验**：
  - 视频固定在视口顶部，字幕/生词流占据下方可滚动区域。
  - 底部「奶油风」悬浮岛提供 5 个核心操作：上一句 / 播放暂停 / 单句循环 / 跟读 / 字幕↔生词切换，并携带生词数量小红点。

### 7.3 门禁与激活（登录 / 注册 / Magic Link）
- **登录页 `/login`**：
  - 支持邮箱 + 密码登录，优先匹配内置管理员账号，其次查询 Supabase `app_users` 表。
  - 登录成功后生成自制 `auth-token`（base64 JSON），根据「记住我」选项设置不同过期时间，通过 cookie + `useAuthStore` 维护前端会话。
  - 管理员登录后可访问 `/admin` 下的素材管理和激活码管理页面。
- **注册页 `/register`**：
  - 通过 `register(email, password, inviteCode, extra)` 函数在 Supabase 中创建 `app_users` 记录，并占用一枚 `access_codes` 激活码（状态从 `unused` → `active`，写入 `activated_at`）。
  - 表单包含邮箱、昵称、手机号、密码/确认密码、激活码等字段，注册成功后自动登录并跳转到首页。
- **Magic Link `/join?code=...`**：
  - `JoinClient` 使用 Supabase 查询 `access_codes` 表，按 `status`、`expires_at` 等字段校验激活码是否有效。
  - 有效时自动重定向到 `/register?inviteCode=xxx&redirect=/`，无效时停留在校验页面并给出对应错误提示，同时提供「回到首页」和「前往注册页手动输入激活码」按钮。
- **路由门禁（middleware）**：
  - 根级 `middleware.ts` 保护除 `/login`、`/register`、`/join` 和试看精读页（`/watch/[id]?trial=1`）以外的所有页面。
  - 未携带有效 `auth-token` 时自动重定向到登录页，并通过 `redirect` 参数保留原始目标路径；访问 `/admin` 需具备 `role = 'admin'`，否则重定向回首页。

### 7.4 后台管理与自动化数据管道
- **视频素材管理 `/admin/videos`**：
  - 管理员登录后可查看 `videos` 表中的所有视频，包含 Cloudflare ID、标题、状态、时长、作者、难度、标签、描述、封面等字段。
  - 支持在弹窗中编辑元数据（meta）、字幕 JSON、知识卡片 JSON；更换封面时调用 `POST /api/admin/images/upload` 上传至 Cloudflare Images，并写回 `poster` / `cover_image_id`。
  - 配合自动化上传接口 `POST /api/admin/upload/init`、`POST /api/admin/upload/finalize`，形成「本地脚本 → Cloudflare → Supabase → 后台审核/发布」的导入链路。
- **激活码管理 `/admin/access-codes`**：
  - 基于 `access_codes` 表提供列表视图（code、valid_days、status、activated_at、expires_at 等），支持按状态/是否有效过滤。
  - 支持批量生成激活码（指定数量与有效天数），结果写入 Supabase 并可一键下载 CSV（包含拼接好的 Magic Link `/join?code=...`），方便投放到小红书等渠道。
- **本地 Python 脚本 `scripts/python`**：
  - 包含 SRT 解析、字幕清洗、Whisper ASR、LLM 精读卡片生成等辅助脚本，并通过调用上述 Admin API 实现视频及其字幕、知识卡片的批量导入。

### 7.5 其他前端页面
- `/notebook`：生词本 / 灵感本占位页，当前仅展示说明文案，提示后续会聚合用户在精读页标记的生词和金句。
- `/admin`：索引页直接重定向到 `/admin/videos`，作为后台入口。
