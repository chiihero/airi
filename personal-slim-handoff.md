# AIRI 个人精简版 — 工作交接文档

> 生成时间：2026-07-03。记录 AIRI monorepo 精简为个人单用户三端版本的进度、已核实的计划偏差、用户决策，以及阶段 2-6 的可执行方案。

## 0. 怎么继续（先看这里）

1. **当前状态**：分支 `chiihero/feat/personal-slim`（基于 `main`），阶段 1 已提交（commit `38dd993`），工作区干净。
2. **第一步**：从阶段 2 开始执行（见下方第 5 节）。建议**后端先行、可独立验证**，前端认证改造（2g）放最后。
3. **未提交的会话前改动**：`.mcp.json`、`.gitignore`、`AGENTS.md` 在会话开始前就是 M 状态，**不要动它们**，保持原样（属于用户的工作区改动，不属于本次重构）。
4. **承重墙**：阶段 2-5 任何时刻都要保证 `pnpm -F @proj-airi/stage-tamagotchi typecheck` 通过。
5. **图谱**：阶段 1 删了 ~650 文件，codebase-memory 图谱已过期；需要时用 `index_repository(mode='fast')` 重新索引。

## 1. 总体目标与硬性约束

把 `moeru-ai/airi` 精简为「桌面 + 手机 + Web 三端、本机自托管、本地 TTS/STT、单一 LLM、静态令牌认证」的私人版本，并接入 memU 记忆。执行分 6 个阶段，每阶段一个 commit。

**绝对保留（承重墙）**：`apps/stage-{tamagotchi,web,pocket}`、`services/computer-use-mcp`、`engines/stage-tamagotchi-godot`、`packages/stage-ui`、`stage-shared`、`ui`、`i18n`、`server-{runtime,sdk,...}`、`core-{agent,character}`、`audio`、`docs/`。

## 2. 已完成：阶段 1（commit `38dd993`）

删除零耦合模块，465 文件，−72306 行，**已验证 `stage-tamagotchi typecheck` 通过**。

| 操作 | 内容 |
|------|------|
| 删 services | `discord-bot`、`telegram-bot`、`twitter-services`、`satori-bot`、`minecraft` |
| 删 plugins | 全部 5 个（bilibili-laplace、claude-code、game-chess、homeassistant、web-extension） |
| 删 apps | `component-calling`、`ui-server-auth` |
| 删 integrations | `integrations/vscode` |
| 删 CI | `deploy-cloudflare-auth-ui.yml`、`deploy-cloudflare-workers-dev-server.yml`、`release-vsix.yaml` |
| 清配置 | 根 `package.json` 删 `dev:server-auth`；`pnpm-workspace.yaml` 删 `mineflayer-pathfinder` patch 注册；删 `patches/mineflayer-pathfinder.patch` + 未注册的 `patches/mineflayer@4.37.0.patch` |

## 3. 已核实的 9 处计划偏差（原始计划 vs 实际）

| # | 偏差 | 处理 |
|---|------|------|
| 1 | `crates/` 目录不存在（计划说"遗留 Tauri"） | 忽略，以实际为准 |
| 2 | `replicate` 不在 `apps/server/package.json` | 无需卸载，计划多列 |
| 3 | `@xsai-transformers/pipelines-audio` 不是 stage-ui 依赖（实际是 `embed`+`shared`+`transcription`） | 计划多列 |
| 4 | 路径 `src/domain/` 实为 `src/services/domain/` | 笔误，内容清单正确 |
| 5 | `routes/` 下**无 db.ts**；"保留 DB"指 drizzle schema/迁移 | DB 边界 = 保留 `libs/db`、`schemas`、迁移 |
| 6 | `routes/auth/` 存在但计划未提，依赖 better-auth | **用户已决策：删** |
| 7 | 阶段 4"保留"清单（kokoro-local 等）与实际不符——它们只是字面量 id，非 `stores/providers/` 模块目录 | **用户已决策：按实际结构精简** |
| 8 | godot sidecar spawn 在 `airi/godot-stage/index.ts` ~L756（非 L261） | 不影响，Godot 保留 |
| 9 | `mineflayer@4.37.0.patch` 在磁盘但**未注册**于 patchedDependencies | 阶段 1 已顺手删除 |

## 4. 用户已做的 3 个决策

1. **执行节奏**：连续执行阶段 1-5（每阶段独立 commit）。
2. **认证模块**：删 `routes/auth/` + `@better-auth/*`，后端 + 前端全改静态令牌。
3. **TTS/STT 精简**：按实际结构精简（删 `stores/providers/{aliyun,elevenlabs,openrouter}` + `google-gemini-speech.ts`，保留本地 id）。

## 5. 阶段 2：apps/server 瘦身 + 认证改造（最高风险，从这里开始）

### 5.1 认证耦合的关键发现（已彻底调研）

**后端（好消息）**：
- `resolveRequestAuth`（`apps/server/src/libs/request-auth.ts`）里的 `resolveTestAuthToken`（L46-80）**已经是纯静态令牌分支**：读 `env.TEST_AUTH_TOKEN`，`timingSafeEqual` 比对，合成 user/session，**不经过 better-auth、不经过 jose/JWKS**。
- 四个保留路由（chats/characters/providers/chat-ws）**全部只用 `c.get('user')`**，对 better-auth/jose/OIDC 零运行时依赖。
- 所有 service 的 otel/metrics/productEventService 参数都用 `?.` 短路，传 `null` 安全（已逐一核实调用点）。
- chat-ws 的 `redis` 是硬依赖（`broadcast.ts` pub/sub），**必须保留**。

**后端唯一断裂点（类型层，非运行时）**：
- `HonoEnv.Variables.user`（`apps/server/src/types/hono.ts`）推断自 `typeof auth.$Infer.Session.user`（better-auth 类型）。删 better-auth 后需重写为结构等价接口 `{ id: string, email: string, name: string, ... }`。
- `request-auth.ts` L1 的 `import type auth from '../scripts/auth'` 同理，需替换为本地接口。

**前端（代价中等，~12 文件）**：
- 认证逻辑集中在 `packages/stage-ui/src`，三端各自只有 1-3 个回调/按钮文件。
- token 存储用 `useLocalStorage`，key 是 `auth/v1/token`；HTTP 注入在 `libs/auth-fetch.ts` 的 `authedFetch`，天然兼容静态 Bearer。
- `better-auth` 是 `packages/stage-ui`（L115）和 `apps/stage-web`（L63）的直接依赖。

### 5.2 后端改造步骤（分 6 个子步骤，每步可单独 typecheck）

**2a. 移除 otel**（app.ts + otel/ 目录）
- `app.ts`：删 L36 `@hono/otel` 导入、L150-167 otel 中间件块、L51-56 gauge 导入（注意 L51 是 emitOtelLog/initOtel）、L521-524 `libs:otel` provide、L800 otel resolve 引用、L816-822 gauge 注册、L176/242-243/260-262/353 等所有 `deps.otel?.` 引用。
- 删目录：`apps/server/src/otel/`。
- 各 service provider 的 `otel` dependsOn 移除，otel 参数传 `null`（`?.` 短路安全）。
- 注意 `setGlobalHookPostLog`（L512-514）转发到 OTel log exporter，需一并清理或改为空操作。

**2b. 移除计费/网关 domain service + 路由**
- **先删 `app.ts` L651-652**（stripe/flux user-deletion deleter，**否则 DI 断裂**）。
- 删路由：`routes/{stripe,flux,admin-ui.ts,admin/,openai/,audio-speech-ws/,audio-transcription-stream/,voice-packs/}`。
- 删 domain：`services/domain/{billing/,flux*.ts,stripe*.ts,llm-router/,llm-tracing/,openai-speech/,admin/,provider-catalog/,voice-packs/,product-events.ts,request-log.ts}`。
- 删 `app.ts` 里对应 route 挂载（L376/389-400/407-457 等）和 service provider（L616-635/678-732 等）。
- `services:email`（L587-594）依赖 resend + otel，一并删；`createEmailService` 导入（L77）删。
- **保留**：`routes/{chats,characters,providers,chat-ws}/`、`services/domain/{chats,characters,providers}.ts`、`libs/{db,redis,env,ws-auth}`、`middlewares/auth.ts`、`utils/`、`services/domain/user-deletion/`（保留：characterService/chatService/providerService 还用它）。

**2c. 认证改静态令牌**
- `libs/request-auth.ts`：删 L82-145（jose JWKS / `resolveJWTAccessToken`）、L164（better-auth `getSession`）；`resolveSessionIgnoringBan` 只保留 `resolveTestAuthToken` 分支。删 `import { createRemoteJWKSet, jwtVerify } from 'jose'`（L8）。
- `request-auth.ts` L1 `import type auth from '../scripts/auth'` → 替换为本地定义的 `User`/`Session` 接口。
- `types/hono.ts`：`HonoEnv.Variables.user` 重写为结构等价接口（不再依赖 better-auth `$Infer`）。
- `sessionMiddleware`（`middlewares/auth.ts`）**保留**，它只调 `resolveRequestAuth`，签名不变。

**2d. 删 routes/auth/ + createAuth**
- 删 `routes/auth/` 整个目录、`app.ts` L348-354 的 `createAuthRoutes` 挂载。
- 删 `libs/auth.ts`（741 行 OIDC provider）、`libs/auth-plugins/`、`scripts/auth`（如存在）。
- `app.ts` L660-676 `services:auth` provider 删除，L43 `createAuth/seedTrustedClients/getTrustedClientSeedSummaries` 导入删除。
- `AppDeps` interface（L100-125）删除 auth/flux/stripe/billing/... 等字段，只留 db/characterService/chatService/providerService/redis/env。
- `schemas/accounts`（若仅 auth 用）评估是否删；保留 chats/characters/providers 表的 schema。

**2e. 卸载依赖**（`apps/server/package.json`）
- 删：`stripe`、`resend`、`@langfuse/*`（2 个）、`unspeech`、`@better-auth/*`（3 个）、`jose`、`@opentelemetry/*`（14 个）、`@hono/otel`。
- **保留**：`ws`、`@hono/node-ws`、`hono`、`@hono/node-server`、`drizzle-orm`、`ioredis`、`postgres`/`pg`、`valibot`、`injeca`。

**2f. 验证（后端）**
- `pnpm -F @proj-airi/server typecheck`
- `pnpm -F @proj-airi/server exec vitest run`（chats/characters 测试）
- 手动 curl：`curl -H "Authorization: Bearer <TEST_AUTH_TOKEN>" http://localhost:PORT/api/v1/chats`

### 5.3 前端认证改造步骤（后端 2a-2f 跑通后做）

**共享层 `packages/stage-ui/src`（改动最重）**：
- `stores/auth.ts`：删 OIDC 刷新调度（`refreshTokenNow`/`scheduleTokenRefresh`/`restoreRefreshSchedule`/`inflightRefresh`/L116-212）；`isAuthenticated` 改为 `!!token.value`（L33）；删 `refreshToken`/`idToken`/`oidcClientId`/`tokenExpiry` 状态；删 L1 `import type { Session, User } from 'better-auth'`，改为本地接口。`updateCredits`（L236-244）依赖 `client.api.v1.flux.$get`——flux 路由已删，一并删除。
- `libs/auth.ts`：删 `authClient`（better-auth/vue，L3/21-34）、`signInOIDC`、`triggerSignIn`、`fetchSession`（改为本地 token 校验）、`signOut`（改为 `clearAllAuthState`）、`applyOIDCTokens`。保留 `getAuthToken`（L17-19）。新增：静态令牌的设置/写入函数。
- `libs/auth-oidc.ts`：**整个删除**（PKCE/exchange/refresh）。
- `libs/auth-config.ts`：删 OIDC client_id/redirect，改为静态令牌配置。
- `libs/auth-fetch.ts`：删 401 刷新逻辑（L32-52），保留 Bearer 注入（L26-28）。
- `composables/use-linked-accounts.ts`：**整个删除**（better-auth 专用）。
- `composables/use-auth-provider-sync.ts`：调整 `isAuthenticated` 判定逻辑（不再依赖 session）。
- `components/auth/SignInPanel.vue`：替换为静态令牌输入框。
- `packages/stage-ui/package.json`：删 `better-auth` 依赖（L115）。

**stage-web**：
- 删 `apps/stage-web/src/pages/auth/callback.vue`（OAuth 回调）、`pages/auth/index.vue`。
- `apps/stage-web/package.json`：删 `better-auth`（L63）。
- `pages/settings/account/`：signOut 改为本地清除。

**stage-tamagotchi（改动最复杂，主进程有自建 OIDC）**：
- 删 `apps/stage-tamagotchi/src/main/services/airi/auth.ts`（主进程 OIDC 全流程）、`main/services/airi/http-server/http/auth/`（loopback server）。
- `renderer/bridges/electron-auth-callback.ts`、`renderer/components/stage-islands/controls-island/controls-island-auth-button.vue`：改为静态令牌输入。
- `renderer/pages/onboarding.vue`：调整登录引导。

**stage-pocket**：
- `apps/stage-pocket/src/modules/deep-links.ts`：删 OAuth deep-link 回调（L9-35）。

**验证（前端）**：`pnpm -F @proj-airi/stage-ui typecheck` + `pnpm -F @proj-airi/stage-web typecheck` + `pnpm -F @proj-airi/stage-tamagotchi typecheck` + 设置页输入令牌 → 访问受保护 API。

## 6. 阶段 3：LLM provider 精简（stage-ui）

- 编辑 `packages/stage-ui/src/libs/providers/providers/index.ts`：删 ~30 个 side-effect import（保留 `openai`/`openai-compatible`/`deepseek`/`ollama`/`lm-studio`）。
- 删对应目录（`302-ai`/`anthropic`/`azure-*`/`google-generative-ai`/`openrouter-ai`/`xai`/...，共约 30 个）+ `official/`。
- 同步 `libs/providers/source-metadata.ts` L35 的 `providerSourceMetadataById`（删对应 id）。
- **保留**：`@xsai-ext/providers`、`unspeech`（DeepSeek/openai-compatible/本地 provider 依赖）。
- 验证：`pnpm -F @proj-airi/stage-ui typecheck` + histoire 看下拉。

## 7. 阶段 4：TTS/STT provider 精简（按实际结构）

**实际结构**：`stores/providers/` 只有 4 子目录（`aliyun`/`elevenlabs`/`openrouter`/`web-speech-api`）+ `google-gemini-speech.ts` 文件。kokoro-local 等只是 `providers.ts`/`source-metadata.ts` 里的字面量 id（无独立目录，靠字面量 + 运行时加载）。

- 删 `stores/providers/{aliyun,elevenlabs,openrouter}/` + `google-gemini-speech.ts`（云端模块）。
- 保留 `web-speech-api/`（浏览器兜底）。
- `stores/providers.ts` L352 `providerMetadata` 字面量：删云端条目，保留 `kokoro-local`/`browser-local-audio-speech`/`browser-web-speech-api` 等本地 id。
- 同步 `source-metadata.ts`。
- `validateProvider`（L2414）+ L2457 特判 `['browser-web-speech-api','player2']`：清理（注意实际 id 是 `player2-speech`，特判本就不会命中）。
- `stores/modules/hearing.ts`（L231/374/380/877）、`speech.ts`（L45/94/97/260）：删硬编码的云厂商 provider id（`aliyun-nls-transcription`/`alibaba-cloud-model-studio`/`elevenlabs`/`microsoft-speech`/`azure-speech`）。
- 验证：`pnpm -F @proj-airi/stage-ui typecheck` + `pnpm run test-ui:run` + 设置页下拉。

## 8. 阶段 5：收尾

`pnpm typecheck` && `pnpm lint:fix` && `pnpm build` && `pnpm build:tamagotchi`（验证 Godot 打包）→ 运行时冒烟（server + 桌面 + 手机同步 + 本地 TTS/STT + computer-use-mcp）→ `pnpm knip` 扫死代码 → 更新 `AGENTS.md` 的 Key Path Index。

## 9. 阶段 6：memU 记忆集成（精简完成后单独做）

- 现状：`notebook.ts` 纯内存 `ref`（无向量检索）；`orchestrator/store.ts` 仅通过 `getDueTasks`/`markTaskNotified` 读 notebook；`packages/memory-pgvector` 是骨架空壳（可删）。
- 方案：新建 `services/memu-memory/`（Python FastAPI，POST /memorize、/retrieve）+ `packages/stage-ui/src/libs/memory/memu.ts`（TS client）+ 改 `character/orchestrator/store.ts`（回复前 retrieve、回复后 memorize）+ 设置页加 memU 配置区。

## 10. 关键命令速查

```bash
# 重新索引图谱（阶段1后必做，通过 codebase-memory MCP）
# index_repository(repo_path='D:/Projects/MultiProjects/AIRI', mode='fast')

# 类型检查（承重墙验证）
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm -F @proj-airi/server typecheck
pnpm -F @proj-airi/stage-ui typecheck

# 单元测试
pnpm -F @proj-airi/server exec vitest run
pnpm run test-ui:run

# 构建（验证 Godot 打包）
pnpm -F @proj-airi/stage-tamagotchi build
```
