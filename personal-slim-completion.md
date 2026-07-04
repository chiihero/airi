# AIRI 个人精简版 — 完成状态报告

> 生成时间：2026-07-03。本文档记录精简为个人单用户 AI 伴侣版本的**实际完成状态**，取代 `personal-slim-handoff.md` 中阶段 2-6 的待办方案。

## 0. 一句话状态

精简重构 + 静态令牌认证 + 记忆持久化**已全部完成**，`server` / `stage-ui` / `stage-web` / `stage-tamagotchi` 四个包 **typecheck 全绿**，全仓库 `pnpm lint` **0 errors**。所有改动均通过 git 提交（本仓库已 `git init`，可随时 `git log` / `git reset` 回滚）。

## 1. 已完成的工作（按提交顺序）

| 提交 | 内容 |
|------|------|
| `225fa39` | git init + 全量基线（安全网，`.env` 已 gitignore） |
| 阶段2a | server 删 otel/stripe/flux/billing/admin/openai-speech/voice-packs/audio 路由+服务+适配器+依赖 |
| 阶段2b | server 认证改静态令牌（删 better-auth/jose，重写 env/types/request-auth/middlewares，本地 metrics stub） |
| 阶段3 | stage-ui 删 29 个云端 LLM provider 目录，精简 source-metadata |
| 阶段4 | stage-ui 删云端 TTS/STT provider（aliyun/elevenlabs/openrouter/google-gemini-speech），providers.ts 清理 |
| 阶段5 | 前端静态令牌认证（重写 auth store/libs/auth/auth-fetch，删 OIDC/better-auth，account-settings 改令牌输入） |
| `d3f8f64` | server 加 `/api/auth/get-session` 端点 + 离线友好认证（无 server 也能用） |
| `6889b28` | **记忆功能**：IndexedDB 持久化对话记忆 + 关键词检索 + onBeforeSend/onChatTurnComplete hook 接线 |
| `5fe7e87` | notebook 持久化（角色笔记/任务从死存储变活） |
| `fa3c6d1` | 清理 72 个未使用 catalog 条目 |

## 2. 当前能跑什么、不能跑什么

### ✅ 已可用（无需任何外部服务）
- **前端三端**：聊天、记忆保存、角色笔记本，全部本地优先（IndexedDB）。
- **静态令牌认证**：在前端设置页（Account）粘贴 token 即"已登录"；不连 server 也能用（合成本地身份）。
- **本地 LLM/TTS/STT**：ollama / lm-studio / openai-compatible / kokoro-local / browser-web-speech-api 等本地 provider 全部保留。

### ⚠️ 需用户自行决定（涉及系统服务安装，未自动执行）
- **后端 apps/server 启动**：需要 Postgres + Redis（硬依赖，server 用于云同步/characters/providers 元数据/chat-ws）。
  - 本机当前**无** Postgres/Redis，docker 也**不可用**。
  - 出于"别弄坏电脑"的约束，**未自动安装**这些系统服务。
  - 如需启动 server：安装 Postgres 15+ 与 Redis，在 `apps/server/.env.local` 配置 `DATABASE_URL`/`REDIS_URL`/`TEST_AUTH_TOKEN`/`LLM_ROUTER_MASTER_KEY`（见下文最小配置），然后 `pnpm -F @proj-airi/server dev`。
  - server 启动时会自动跑 drizzle 迁移建表（需 DB 账号有 DDL 权限）。
- **Live2D/VRM 模型资源**：vite dev 启动时从 `dist.ayaka.moe` 下载（hiyori Live2D + AvatarSample VRM）。当前网络环境**无法访问该 CDN**（连接超时）。这不影响聊天/记忆，只影响角色 3D 模型显示。需代理或手动放置资源。

### 📋 server 最小 env 配置（写入 `apps/server/.env.local`，会覆盖 `.env`）
```
DATABASE_URL=postgresql://postgres:<密码>@localhost:5432/postgres
REDIS_URL=redis://localhost:6379
TEST_AUTH_TOKEN=<任意字符串，前端也填这个>
LLM_ROUTER_MASTER_KEY=<openssl rand -base64 32 的输出，必须解码为恰好32字节>
```
Stripe/OTEL/Resend/AUTH_GOOGLE/AUTH_GITHUB 全部**不再需要**（已从 env 校验移除）。

## 3. 架构变更要点

### 认证（最大改动）
- **之前**：better-auth + OIDC（Google/GitHub 社交登录 + JWT + JWKS + 刷新调度）。
- **现在**：单一静态 Bearer token。server 的 `resolveRequestAuth` 用 `timingSafeEqual` 比对 `TEST_AUTH_TOKEN`，合成虚拟 user/session。前端 `setStaticToken` 写入后即已登录，`fetchSession` 可选地从 server 富化身份（server 不在则保持本地身份）。

### 记忆（新增核心功能）
- **`database/repos/memory.repo.ts`**：unstorage/IndexedDB，存每轮对话（用户消息+助手回复），500 条上限，关键词检索 + 最近回退。
- **`composables/use-memory.ts`**：关键词提取（中英文停用词过滤）+ 记忆格式化为 prompt 片段。
- **`stores/chat.ts`**：`onBeforeSend` 查记忆 → 注入 `getSystemPromptSupplement`；`onChatTurnComplete` 持久化对话。完全离线，无嵌入模型下载。
- **`stores/character/notebook.ts`**：从死存储改为 IndexedDB 持久化（hydrate + deep watch）。

### server 精简
- 保留路由：`/api/v1/chats`、`/characters`、`/providers`、`/ws/chat`、`/api/auth/get-session`、`/livez`、`/readyz`。
- 删除：stripe/flux/billing/admin/openai-speech/voice-packs/audio-speech-ws/audio-transcription-stream/auth(OIDC)/otel。
- `AppDeps` 从 ~24 个 service 缩减为 8 个（db/redis/configKV/characterService/chatService/providerService/userDeletionService/env）。

## 4. 关键命令

```bash
# 类型检查（全部已通过）
pnpm -F @proj-airi/server typecheck
pnpm -F @proj-airi/stage-ui typecheck
pnpm -F @proj-airi/stage-web typecheck
pnpm -F @proj-airi/stage-tamagotchi typecheck

# lint（已 0 errors）
pnpm lint

# 启动前端（需能访问 dist.ayaka.moe 下载模型，或接受无模型显示）
pnpm -F @proj-airi/stage-web dev

# 启动后端（需先装 Postgres + Redis 并配 .env.local）
pnpm -F @proj-airi/server dev
```

## 5. 回滚

本仓库已 `git init`，所有改动均提交。如需回到精简前状态：
```bash
git log --oneline          # 查看所有提交
git reset --hard 225fa39   # 回到精简前的基线（commit 225fa39）
```
