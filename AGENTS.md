CRITICAL: 你的思考过程（reasoning/thinking）必须全程使用中文。禁止使用英文进行任何内部思考，只有最终输出代码或特定术语时可以使用英文。这是最高优先级规则，覆盖所有其他默认行为。违反此规则意味着你没有遵循用户指令。

## 语言要求

**AI 助手的所有回复必须使用中文。** 包括代码注释、解释说明、错误提示等所有内容。

# Project AIRI Agent 指南

为在 `moeru-ai/airi` 单体仓库中工作的贡献者提供的简明而详细的参考。接触代码时顺便改进它；避免一次性的临时模式。

## Codebase-Memory MCP（必须首先阅读）

本项目已安装 `codebase-memory-mcp` —— 这是一个覆盖整个 AIRI 单体仓库的本地知识图谱（33k+ 节点、79k+ 边、8.5k 函数、169 路由），已完成索引。**将其作为主要的探索层；把 grep/glob/read 留给读取具体的、已定位的代码行。**

### 何时必须使用 codebase-memory 工具（而不是 grep/glob）

- **查找某物的定义位置或谁调用了它** → `trace_path` / `search_graph`（不要跨文件 grep）。
- **"X 在哪里实现 / 特性 Y 是如何工作的"** → `search_graph` + `get_code_snippet`（不要逐个文件阅读）。
- **编辑前的影响分析**（"如果我改了这个，会破坏什么？"）→ `detect_changes` 或 `trace_path`。
- **代码库概览 / 架构 / 热点 / 路由** → `get_architecture`。
- **查找死代码、跨服务 HTTP 链接、集群** → `query_graph` / `get_architecture`。

### 工作流程

1. 涉及探索的会话中的首次调用：`get_graph_schema`（了解节点/边标签），然后 `list_projects` 确认 AIRI 已被索引。
2. 先查询图谱定位/理解，然后仅对图谱指向的具体文件/行使用 `Read`。
3. 改变结构的编辑完成后，图谱会在下一次 MCP 会话时自动同步（`auto_index=true`）；如需立即生效，再次调用 `index_repository`。

### 禁止事项

- 不要为了找一个符号而 grep/glob 整个单体仓库，`search_graph` 一次亚毫秒查询就能返回。
- 不要为了理解一个调用链而连续阅读 5 个以上文件 —— 使用 `trace_path`。
- 不要未经在本会话中尝试就假设该工具不可用。

## 技术栈（按界面划分）

- **桌面端（stage-tamagotchi）**：Electron、Vue、Vite、TypeScript、Pinia、VueUse、Eventa（IPC/RPC）、UnoCSS、Vitest、ESLint。
- **Web 端（stage-web）**：Vue 3 + Vue Router、Vite、TypeScript、Pinia、VueUse、UnoCSS、Vitest、ESLint。后端：开发中。
- **移动端（stage-pocket）**：Vue 3 + Vue Router、Vite、TypeScript、Pinia、VueUse、UnoCSS、Vitest、ESLint、Kotlin、Swift、Capacitor。
- **UI/共享包**：
  - `packages/stage-ui`：被 stage-web 与 stage-tamagotchi 共享的核心业务组件、composables、stores（stage 工作的核心）。
  - `packages/stage-ui-three`：Three.js 绑定 + Vue 组件。
  - `packages/stage-ui-pixi`：计划中的 Pixi 绑定。
  - `packages/stage-shared`：stage-ui、stage-ui-three、stage-web、stage-tamagotchi 之间的共享逻辑。
  - `packages/ui`：基于 reka-ui 构建的标准化原语（输入框、文本域、按钮、布局）；业务逻辑极简。
  - `packages/i18n`：集中式翻译。
  - 服务端通道：`packages/server-runtime`、`packages/server-sdk`、`packages/server-shared`（支撑 `services/` 与 `plugins/`）。
  - 遗留：`crates/`（旧版 Tauri 桌面端；当前桌面端为 Electron）。

## 结构与职责

- **应用**
  - `apps/stage-web`：Web 应用；composables/stores 在 `src/composables`、`src/stores`；页面在 `src/pages`；开发者工具在 `src/pages/devtools`；路由配置通过 `vite.config.ts`。
  - `apps/stage-tamagotchi`：Electron 应用；渲染进程页面在 `src/renderer/pages`；开发者工具在 `src/renderer/pages/devtools`；设置布局在 `src/renderer/layouts/settings.vue`；路由配置通过 `electron.vite.config.ts`。
  - 设置/开发者工具路由依赖 `<route lang="yaml"> meta: layout: settings </route>`；请确保相应地注册路由/图标（`apps/stage-tamagotchi/src/renderer/layouts/settings.vue`、`apps/stage-web/src/layouts/settings.vue`）。
  - 共享页面基类：`packages/stage-pages`。
  - Stage 页面：`apps/stage-web/src/pages`、`apps/stage-tamagotchi/src/renderer/pages`（加上 devtools 文件夹）。
- **Stage UI 内部**（`packages/stage-ui/src`）
  - Providers：`stores/providers.ts` 和 `stores/providers/`（标准化的 provider 定义）。
  - 模块：`stores/modules/`（AIRI 编排构建块）。
  - Composables：`composables/`（面向业务的 Vue 辅助函数）。
  - 组件：`components/`；`components/scenarios/` 中存放页面/用例特定的部件。
  - Stories：`packages/stage-ui/stories`、`packages/stage-ui/histoire.config.ts`（例如 `components/misc/Button.story.vue`）。
- **IPC/Eventa**：始终使用 `@moeru/eventa` 实现类型安全、与框架/运行时无关的 IPC/RPC。集中定义契约（例如 `apps/stage-tamagotchi/src/shared`），并遵循 `apps/stage-tamagotchi/src/main/services/electron` 中的用法模式来做主进程/渲染进程集成。
- **依赖注入**：在 services/electron 模块/plugins 前端使用 `injeca`；参见 `apps/stage-tamagotchi/src/main/index.ts` 中的组合模式。
- **构建/CI/Lint**：`.github/workflows` 用于流水线；`eslint.config.js` 用于 lint 规则。
- **样式**：UnoCSS 配置在 `uno.config.ts`；查看 `apps/stage-web/src/styles` 获取已有动画；优先使用 UnoCSS 而非 Tailwind。

## 关键路径索引（内容分别在哪里）

- `packages/stage-ui`：核心 stage 业务组件/composables/stores。
  - `src/stores/providers.ts` 和 `src/stores/providers/`：provider 定义（标准化）。
  - `src/stores/modules/`：AIRI 编排模块。
  - `src/composables/`：可复用的 Vue composables（面向业务）。
  - `src/components/`：业务组件；`src/components/scenarios/` 存放页面/用例特定的部件。
  - Stories：`packages/stage-ui/stories`、`packages/stage-ui/histoire.config.ts`（例如 `components/misc/Button.story.vue`）。
- `packages/stage-ui-three`：Three.js 绑定 + Vue 组件。
- `packages/stage-ui-pixi`：计划中的 Pixi 绑定。
- `packages/stage-shared`：stage-ui、stage-ui-three、stage-web、stage-tamagotchi 之间的共享逻辑。
- `packages/ui`：基于 reka-ui 构建的标准化原语（输入框/文本域/按钮/布局）。
- `packages/i18n`：所有翻译。
- 服务端通道：`packages/server-runtime`、`packages/server-sdk`、`packages/server-shared`（支撑 `services/` 与 `plugins/`）。
- 遗留桌面端：`crates/`（旧版 Tauri；Electron 为当前版本）。
- 页面：`packages/stage-pages`（共享基类）；`apps/stage-web/src/pages` 和 `apps/stage-tamagotchi/src/renderer/pages` 为各应用专属页面；devtools 位于各应用的 `.../pages/devtools`。
- 路由配置：`apps/stage-web/vite.config.ts`、`apps/stage-tamagotchi/electron.vite.config.ts`。
- Devtools/布局：`apps/stage-tamagotchi/src/renderer/layouts/settings.vue`、`apps/stage-web/src/layouts/settings.vue`。
- IPC/Eventa 契约/示例：`apps/stage-tamagotchi/src/shared`、`apps/stage-tamagotchi/src/main/services/electron`。
- 依赖注入示例：`apps/stage-tamagotchi/src/main/index.ts`（injeca）。
- 样式：`uno.config.ts`（UnoCSS）、`apps/stage-web/src/styles`（动画/参考）。
- 构建流水线参考：`.github/workflows`；lint 规则在 `eslint.config.js`。
- 已记录的解决方案：`docs/solutions/` 记录过往修复与工作流经验，按类别组织并带有 YAML frontmatter（`module`、`tags`、`problem_type`）；在已记录的领域内实现、调试或验证时相关。
- Tailwind/UnoCSS：优先使用 UnoCSS；如需标准化样式，在 `uno.config.ts` 中添加 shortcuts/rules/plugins。

## 命令（带 filter 的 pnpm）

> 使用 pnpm workspace filter 来限定任务范围。下面的示例是通用的；将 filter 替换为目标 workspace 名称（例如 `@proj-airi/stage-tamagotchi`、`@proj-airi/stage-web`、`@proj-airi/stage-ui` 等）。

- **类型检查**
  - `pnpm -F <package.json name> typecheck`
  - 示例：`pnpm -F @proj-airi/stage-tamagotchi typecheck`（运行 `tsc` + `vue-tsc`）。
- **单元测试（Vitest）**
  - 定向：`pnpm exec vitest run <path/to/file>`
    例如 `pnpm exec vitest run apps/stage-tamagotchi/src/renderer/stores/tools/builtin/widgets.test.ts`
  - Workspace：`pnpm -F <package.json name> exec vitest run`
    例如 `pnpm -F @proj-airi/stage-tamagotchi exec vitest run`
  - 根目录 `pnpm test:run`：运行所有已注册项目的全部测试。如果未找到测试，请检查 `vitest.config.ts` 的 include 模式。
  - 根目录 `vitest.config.ts` 包含 `apps/stage-tamagotchi` 等项目；每个 app/package 可以有自己的 `vitest.config`。
- **Lint**
  - `pnpm lint` 和 `pnpm lint:fix`
  - 格式化通过 ESLint 处理；`pnpm lint:fix` 会应用格式化。
- **构建**
  - `pnpm -F <package.json name> build`
  - 示例：`pnpm -F @proj-airi/stage-tamagotchi build`（typecheck + electron-vite build）。

## 开发实践

- 倾向于清晰的模块边界；共享逻辑放进 `packages/`。
- 保持运行时入口精简；把重逻辑移入 services/modules。
- 优先使用函数式模式 + DI（`injeca`）以提升可测试性。
- 使用 Valibot 做 schema 校验；让 schema 靠近其消费者。
- 在需要结构化 IPC/RPC 契约的地方使用 Eventa（`@moeru/eventa`）。
- 使用 `@moeru/std` 中的 `errorMessageFrom(error)` 提取错误信息，而不是 `error instanceof Error ? error.message : String(error)` 这样的手写模式。需要默认值时配合 `?? 'fallback'`。
- 不要添加向后兼容的保护代码。如果需要扩展支持，请编写重构文档，并通过 shell 命令启动另一个 Codex 或 Claude Code 实例来完成实现，并附上清晰的说明和预期的重构后形态。
- 如果重构范围较小，请逐步进行渐进式重构。
- 修改代码时，总是留意借机做小型、最小化的渐进式重构的机会。

## 样式与组件

- 在使用 UnoCSS 与 tailwindcss 时，为了可读性，优先使用 Vue v-bind 的 class 数组：写成 `:class="['px-2 py-1','flex items-center','bg-white/50 dark:bg-black/50']"`，不要写成 `class="px-2 py-1 flex items-center bg-white/50 dark:bg-black/50"`，也不要写成 `px="2" py="1" flex="~ items-center" bg="white/50 dark:black/50"`；避免过长的内联 `class=""`。接触遗留代码时顺手重构。
- 在 `uno.config.ts` 中使用/扩展 UnoCSS 的 shortcuts/rules；标准化样式时在该文件中新增 shortcuts/rules/plugins。优先使用 UnoCSS 而非 Tailwind。
- 查看 `apps/stage-web/src/styles` 获取已有动画；在新增之前先复用或扩展。如需配置参考，参见 `apps/stage-web/tsconfig.json` 和 `uno.config.ts`。
- 在 `@proj-airi/ui`（reka-ui）之上构建原语，而不是裸 DOM；完整组件 API 参考见 [`docs/ai/context/ui-components.md`](docs/ai/context/ui-components.md)，实现模式见 `packages/ui/src/components/Form`。
- **在 `packages/ui` 中新增或更新组件时**，请更新 [`docs/ai/context/ui-components.md`](docs/ai/context/ui-components.md) 以反映变化（props、slots、emits、描述）。
- 使用 Iconify 图标集；避免自制 SVG。
- 动画：保持直观、生动、易读。
- `useDark`（VueUse）：设置 `disableTransition: false` 或使用 `packages/ui` 中的现有 composables。

## 测试实践

- 每个项目使用 Vitest；保持运行定向以提升速度。
- 对于任何被调查的 bug 或 issue，先尝试用仅测试的复现方式复现，再修改生产代码。优先用单元测试；若不可行，则使用能复现问题的最小更高层自动化测试。
- 当可以编写 issue 复现测试时，在测试用例名称中包含追踪器标识符：
  - GitHub issue：包含 `Issue #<number>`
  - 在 Linear 中追踪的内部 bug：包含 Linear issue key
- 在回归测试正上方添加实际的报告链接作为注释：
  - GitHub 报告用 GitHub issue URL
  - IM 报告用 Discord 消息或话题 URL
  - 内部 bug 用 Linear issue URL
- 用 `vi.fn`/`vi.mock` 模拟 IPC/services；不要依赖真实 Electron 运行时。
- 对于外部 providers/services，在可行时同时添加基于 mock 的测试和集成式测试（带环境变量守护）。可以用 Vitest mock 导入。
- 逐步增长组件/e2e 覆盖率（尽可能用 Vitest browser 环境）。使用 `expect` 并断言 mock 调用/参数。
- 编写测试时，优先逐行 `expect` 或断言语句。
- 避免为不可能的运行时状态编写测试，例如对永不改变的常量做 `expect`，或断言只能在同一 Vitest 用例 setup 内发生的对象变更。
- 避免直接用 `Object.defineProperty(...)` mock `globalThis` 或内置模块。如确需如此，使用 `node:worker_threads` 加载另一个 worker 来模拟该场景，或构建一个迷你 CLI 来复现并验证行为。对于 DOM 和 Web Platform API，优先使用 Vitest browser 模式而非硬 mock 平台内部。如果现有测试已采用这些模式，请渐进式重构。
- 不要利用 Vitest mock、hoisting、动态导入、`as unknown as` 或仅测试用的备用导入路径来恶意绕过真实的导入问题。如果测试无法导入某个模块，请调查真实的编译/运行时边界：包导出、副作用、Node/浏览器混合的类型依赖、循环导入，以及公共模块形态是否错误。修复该边界，而不是在测试中掩盖失败。

## TypeScript / IPC / 工具

- 保持 JSON Schemas 符合 provider 要求（显式 `type: object`、必填字段；避免无界 record）。
- 倾向于函数式模式 + DI（`injeca`）；除非扩展浏览器 API，否则避免新建类层级（类更难 mock/测试）。
- 集中 Eventa 契约；所有事件使用 `@moeru/eventa`。
- 从拥有契约的模块或包导入类型。不要为了使用更窄的子集而在本地重新声明外部/公共契约，也不要在原始无副作用的类型源可用时，通过本地运行时装配模块来路由类型导入。
- 不要使用内联类型导入，例如 `typeof import('...').x` 或 `import('...').Type`，以避免正常的模块边界。从所属模块导出显式共享类型，从所属包导入外部契约类型，或在运行时导入会引入错误环境时拆分一个专门的无副作用类型模块。
- 不要为了消除某个导入/类型错误而直接修改或覆盖 `tsconfig.json`。先调查编译行为、`package.json` 的 `exports` 声明、类型声明，以及依赖是否暴露了预期的浏览器/Node 入口。
- 当 Node 专属与浏览器专属类型通过同一条导入链混用时，将类型声明拆分到中性类型文件，并让运行时模块保持环境特定。避免为了获得类型而从带副作用的模块导入值。
- 如果错误的导出或缺失的导出导致错误，请在改动叶子导入之前追踪完整的导入链和副作用链。优先修复包/模块导出和所属边界，而非添加本地变通导入。
- 把循环导入当作设计问题。如果出现循环，首先重新审视归属、模块边界，以及共享类型或纯辅助函数是否需要移动。如果无法自信地解决该循环，在继续之前向用户寻求方向。
- 当用户要求使用某个特定工具或依赖时，先用搜索工具查阅 Context7 文档，然后检查本仓库中该依赖的实际用法。
- 如果 Context7 返回多个名称且没有明确区分，请让用户选择或确认所需的那个。
- 如果文档与 typecheck 结果冲突，请检查 `node_modules` 下的依赖源码以诊断根因，并修复类型/bug。

## i18n

- 在 `packages/i18n` 中添加/修改翻译；避免在各 app/package 中散落 i18n。

## CSS/UNO

- 在 `uno.config.ts` 中使用/扩展 UnoCSS shortcuts。
- 为了可读性优先使用分组的 class 数组；在可能时重构遗留的内联字符串。

## 可读性、命名与注释

- 文件名：camelCase。
- 优先依赖模块边界提供上下文的命名，而不是在每个符号里重复包、产品、协议或传输层前缀。命名良好的模块应让导出函数使用简短的动作前置名；仅当符号跨越边界、该更大上下文不再明显时，才重复更大的上下文。
- 函数按其执行的领域操作命名，而不是按恰好包含它的实现层命名。这样能让调用点在重构后依然可读，并避免代码在文件间移动时名称变得过时。
- 避免把多层归属编码进一个符号的名称。如果一个名称需要多个限定词才能被理解，请重新考虑模块边界或引入更清晰的本地概念。
- 对已解析的领域概念使用名词，对转换或副作用使用动词。当函数从事件或请求派生出策略/配置时，请显式命名该领域结果，以便调用者理解正在做的是什么决策。
- 对于运行时/浏览器 API 以及当类拥有状态、生命周期或稳定领域边界的实质业务模块，优先使用类。对于纯转换和本地辅助函数，优先用 FP。
- 仅在真实的外部边界使用依赖注入：数据库、模型运行时、队列、Redis/缓存、文件系统、网络、时钟、环境以及功能开关。不要为仅调用兄弟辅助函数或转发参数的内部函数引入 `Dependencies`/`Deps` 对象。
- 注释应降低读者的不确定性，而不是增加文档体积。
- 在读者本会发问"为什么会出现这种情况、为什么忽略这个分支、为什么存在这个 fallback、为什么这个顺序重要、这里状态发生了什么变化、刚刚发生了什么外部副作用、或者这一行在保持什么协议/不变量"的地方写注释。
- 好的注释解释隐藏意图、约束、归属、不变量、顺序、副作用、协议形态或不明显的 fallback 行为。
- 坏的注释把代码翻译成英文、复述名称/类型，或仅为满足 hover 文档而存在。
- 重要的实现注释应靠近令人困惑的行或分支，而不仅位于导出声明上。
- 对于计算密集的代码，优先在需要解释的中间值和分支旁加内联注释。当难点在于坐标系、单位换算、clamp、舍入规则、聚合、fallback 或优先级决策时，不要只依赖函数级 JSDoc。
- 这一点尤其适用于几何、图形与着色器数学、计费或计量、分析或统计、UI 布局与定位、排名或评分，以及归一化代码。
- 把较长的注释格式化为用空注释行分隔的短段落。不要把背景、症状、被否决的备选方案、最终理由和参考压缩进一个密集的块。
- 对于调查密集型注释，在有用时优先采用这个顺序：来源/上下文、观察到的失败、为什么显而易见的修复不够、所选的修复、参考/移除条件。
- 除非要解释某个不明显的边界或过渡，否则不要添加 `// Config`、`// Host`、`// Update state` 这类宽泛注释。
- 为 utils、数学、OS 交互、算法、共享和架构函数添加清晰简洁的注释，解释不明显的意图、不变量、约束，或为何需要这段代码。
- 使用 workaround 时，添加 `// NOTICE:` 注释说明原因、根因及任何来源/上下文。如果通过检查 `node_modules` 或外部来源（如 GitHub）验证过，请在代码格式的文本中包含相关行引用和链接。
- 移动/重构/修复/更新代码时，把仍然准确的注释与代码一起保留。移除过时注释而不是在源码中保留其历史；必要时在评审说明中解释重要的移除。
- 避免简陋/取巧的脚手架；优先做让代码更干净的小型重构。
- 使用标记：
  - `// TODO:` 后续跟进
  - `// REVIEW:` 疑虑/需要他人复查
  - `// NOTICE:` 魔法数字、hack、重要上下文、外部引用/链接

### JSDoc

- 对公共 API、共享边界、导出类型以及非平凡的导出函数/类使用 JSDoc。
- 不要把 JSDoc 当作解释复杂实现分支的替代品。
- 不要把 `Use when / Expects / Returns` 块强加于内部辅助函数、对象字面量方法、简单透传方法，或仅在复述名称与签名的 interface/type 顶层注释上。
- 对于 interface 和 type alias，保持顶层 JSDoc 简短。当字段有不明显的单位、默认值、归属、生命周期、新鲜度或兼容性行为时，把字段特定的语义放在字段上。
- 对于构成真实 API 边界的导出函数/类，JSDoc 应解释该边界保证什么、何时使用它，以及调用者必须尊重哪些假设。
- 对于内部实现细节，优先使用精确的命名和分支局部注释，而非大型 JSDoc 块。

### Fallback 与优先级

- 任何包含两个以上来源的 fallback 链都必须明确优先级。
- 如果 fallback 来源代表不同的 schema 版本、兼容性行为、特化层级或用户/系统覆盖，那么每个非主分支都必须解释为何存在该情况以及为何具有该优先级。
- 当 fallback 链中存在任何不明显的分支时，避免使用嵌套三元表达式。使用命名的中间变量或 `if` / `else if` 块，以便注释能贴近相关分支。
- 不要默默保留向后兼容的 fallback。如果某 fallback 是临时的，请用 `// NOTICE:` 标记并附上移除条件。如果是永久的，请将其作为受支持策略记录，而不是称之为遗留。
- 如果 fallback 在非平凡的领域/协议代码中返回空字符串、过期值、缓存值、默认值或被忽略的结果，请在返回点或分支处解释为何该 fallback 是安全的。

### 有状态与协议代码

- 对于实现协议、状态机、生命周期、缓存、请求/响应流、事件路由、watcher、会话、cookie 或清理序列的代码，请在实现附近记录其状态模型。
- 在命名或邻近注释中区分持久化配置、发现的文件系统状态、运行时加载的状态、缓存状态、会话/cookie 状态、watcher 状态以及外部副作用。
- 看起来像状态转换的方法，如 `setEnabled`、`load`、`unload`、`dispose`、`start`、`stop` 或 `refresh`，当所属类型/模块不能明显看出时，应清楚说明它们改变的是哪个状态。
- 在匹配事件或响应时，显式记录关联键和隔离规则，例如 `requestId`、`sessionId`、`ownerExtensionId`、`bindingId`、路由命名空间或来源窗口。
- 事件处理器必须让被忽略的事件可被理解。如果事件因路由不匹配、归属不匹配、过期的 request id、已销毁的生命周期或错误来源而被忽略，原因应在代码中可见，或被捕获进一个命名的谓词。
- 对于请求/响应流，请在贴近生产者和消费者的地方定义或命名信封（envelope）形态。
- 记录在超时、关闭、卸载、销毁和发布失败时，待处理请求会发生什么。
- 当清理跨越多个归属方时，保持顺序可见并解释为何顺序重要。
- 当返回快照、fallback 值、过期值或缓存值时，请在返回点记录新鲜度语义。

### 辅助函数抽取

- 在抽取私有辅助函数之前，先问它隐藏了什么决策。
- 当辅助函数仅为单个执行步骤命名且只使用一次时，保持逻辑内联。
- 当辅助函数拥有可复用的策略、解析、归一化、生命周期、清理、错误处理、协议校验或跨调用不变量时，才抽取它。
- 不要把特殊情况隐藏在通用辅助函数里，如果这样做会把解释搬离读者需要它的分支。
- 如果辅助函数操作编码键、缓存归属、会话归属、文件系统路径、路由名称或协议形态数据，请在辅助函数附近记录该编码/不变量，或用更清晰的结构替代该编码。

### 可读性重构

- 如果需要注释来解释隐藏状态、编码数据、协议信封或生命周期转换，首先考虑命名类型、结构化状态或一个小策略函数是否能让概念更显式。
- 仅为了可读性的改动应保持运行时行为不变。如果行为改变，请添加聚焦的测试并显式记录契约变化。
- 对于 watcher、事件监听器和异步后台工作，让归属和关闭行为显式：谁启动它、谁停止它、是否允许重复启动、在卸载或销毁期间正在进行的任务会发生什么。

## 模块设计

- 优先选择深模块而非浅模块。一个模块应隐藏一个有意义的决策：策略、持久化边界、协议/schema 契约、调度语义、模型提示词契约、领域不变量或生命周期关注点。
- 不要仅按执行顺序拆分代码。模块边界应代表一个无需阅读所有兄弟文件即可理解的稳定职责。
- 把内聚的领域流程保持在一起，直到有被证实的拆分压力。一个 200-400 行的内聚模块，胜过若干把相同上下文/选项相互传递的浅模块。
- 在创建新的 `createXService` 或 `XDependencies` 之前，验证 `X` 是否真的添加了策略、校验、状态、重试/错误处理、IO 边界或可复用抽象。如果没有，请将其保留为私有辅助函数或内联。
- 避免透传式 service，例如 `createXService({ yService })`，当 `X` 不添加有意义的策略、校验、状态或抽象时。
- 不要仅为命名一个实现步骤、减少行数或让测试更易写而抽取微小的单次调用辅助函数。当辅助函数不隐藏真实决策、策略、IO 边界、归一化规则、重试/错误处理、生命周期关注点或可复用领域概念时，请保持简短逻辑内联。
- 仅当辅助函数被多个生产调用点复用、隐藏非平凡的分支/IO/解析/归一化/错误策略、命名一个稳定的领域概念，或构成公共/包 API 的一部分时，才抽取它。
- 通过稳定的公共行为进行测试。不要仅为让私有实现细节可 mock 而创建新的导出、依赖袋或包装 service。
- 把可复用的领域契约和渲染/构建逻辑保留在拥有该领域的包中。运行时入口应装配依赖并调用这些边界，而不是内联大型可复用契约。

## PR / 工作流提示

- 拉取时 rebase；分支命名 `username/feat/short-name`；提交信息清晰（禁止使用 gitmoji）。
- 概述改动、如何测试（命令）以及后续跟进。
- 改进你接触到的遗留代码；避免一次性的临时模式。
- 保持改动范围聚焦；使用 workspace filter（`pnpm -F <package> <script>`）。
- 为每个 `packages/` 和 `apps/` 条目维护结构化的 `README.md` 文档，涵盖它做什么、如何使用、何时使用、何时不使用。
- 完成任务后总是运行 `pnpm type-check` 和 `pnpm lint`。
- 提交信息使用 Conventional Commits（例如 `feat(<package name>): add runner reconnect backoff`）。
- 对于涉及 `node:*` 内置模块、DOM 操作、Vue composables、React hooks、Vite 插件或 GitHub Actions 工作流的新功能需求或需求相关任务，始终先深入研究合适的现有库或开源模块。在选择任何库之前，始终请用户选择并协助判断哪个选项合适。未经用户明确确认，绝不自行选择通用工具库（例如 `es-toolkit`、来自 `github.com/unjs` 的工具，或来自 `github.com/tinylib` 的小工具）。如果你在按 spec 驱动工作，请以清晰简洁的 Markdown 对比表列出候选选项。
- 在规划或编写新的 utilities/functions 之前，始终先搜索现有的内部实现。如果该逻辑可能成为共享 utility，请主动向用户和开发者提议该共享方案。

## TypeScript 编码规范

这些准则适用于整个单体仓库中的所有 TypeScript 代码：

- 在为本规范实现时不要创建提交。
- 对于已实现的模块，尽可能使用 Vitest 验证行为并通过测试。
- 在测试实现期间，每个 workaround 都必须包含清晰易懂的 `// NOTICE:` 注释以供参考。
- 每当引入 workaround 时，使用以下 workaround 注释格式：
  ```ts
  // NOTICE:
  // 为什么需要这个 workaround。
  // 根因摘要。
  // 来源/上下文（文件、issue、URL 或 node_modules 引用）。
  // 移除条件（何时可以安全删除）。
  ```
- 尽可能优先使用类型泛型。不要使用 `any`。仅当几乎无法避免且类型无法被安全修复时，才使用 `as unknown as <目标期望类型>`。
- 对于公共 API、包级导出、共享架构边界以及非平凡的导出函数/类/类型，包含清晰的 `/** ... */` JSDoc，解释调用者真正需要的契约、假设、副作用、生命周期或返回保证。
- 避免仅为满足测试或文档规则而导出辅助函数。除非生产代码复用，否则保持实现辅助函数私有。
- 避免在平凡的单行辅助函数、本地投影和透传函数上使用 JSDoc；改用精确的命名。
- 不要为普通导出函数/类/类型使用固定的 JSDoc 小节模板。撰写自然的 API 文档，解释调用者真正需要的契约、非显而易见的约束、副作用、生命周期期望和返回保证。
- 当名称和类型已能解释行为时，保持 JSDoc 简短。仅对签名中不可见的信息添加细节。
- 对于包含 workaround 的函数，包含 `NOTICE:` 说明。
- 对于导出的测试辅助函数或不明显的可复用测试夹具，当示例能澄清预期用法时包含示例。不要为普通的 `describe`、`it` 或 `expect*` 调用添加 `@example` 注释。
- 对于所有导出的 interface，尤其是可配置选项，记录：
  - 每个 interface/type 代表什么。
  - 把详细的字段语义放在字段自身上，而不是在一个大型 interface 级注释块中重复。
  - 如果 interface 或 type 使用泛型参数，用 `@param` 记录它们。
  - 为每个有默认值的选项添加 `@default`。
- 对于 interface 和 type 的 JSDoc，保持顶层注释聚焦于该类型代表什么。不要在 interface 或 type alias 上使用函数式的 `Use when`、`Expects` 或 `Returns` 小节。把详细含义、默认值和行为说明放在各个字段或方法上，而不是在 interface 级块中复述每个字段。
- 对于 JSDoc 中的泛型类型参数，使用 `@param` 条目解释每个类型参数代表什么。
- 对于 runner 和 CLI 入口，必须有 `/** ... */` JSDoc，并在适用时包含清晰的 ASCII 调用栈图，使用 `{@link ...}` 引用。对于 server 编排器，仅当调用栈图能澄清一个稳定的架构边界时才添加；不要为浅层胶水代码添加图。
- 在编排器/runner/CLI 的 JSDoc 中使用这个调用栈小节格式：
  ```ts
  /**
   * ...
   *
   * Call stack:
   *
   * collectEvalEntries (../runner)
   *   -> {@link createRunnerSchedule}
   *     -> {@link createMatrixCombinations}
   *       -> {@link VievalScheduledTask}[]
   */
  ```
- 凡是涉及数学、OS、exec、进程、参数、网络、文件或目录的地方，当意图在命名和本地上下文中不明显时，添加注释解释目的以及为何需要这段代码。对于计算密集的代码，优先在计算过程旁加内联注释，而非仅有声明处的 JSDoc。
- 创建 utilities 时优先首选 `es-toolkit`。
- 对于错误处理，尽可能优先使用 `@moeru/std` 模式。
- 对于导出的归一化器、共享归一化器，或归一化输出、格式、文件名或值的非明显的本地归一化器（不包括配置默认值归一化），添加 `/** ... */` 并附前后示例。
- 使用这个归一化器文档格式：
  ```ts
  /**
   * 归一化 <target>。
   *
   * Before:
   * - "ExampleInput"
   *
   * After:
   * - "example-output"
   */
  ```
- 不要把所有东西都搬进常量。一次性或两次性使用的常量应留在使用点附近（通常在导入之后的顶部），并附上清晰的 `/** ... */` 解释原因。
- 对于带默认值的可配置选项，尽可能优先使用 `@moeru/std` 的 merge 函数，并将默认值定义为带文档的对象，而非宽泛的独立常量。
- 对于重试、退避和限制值，不要用一个独立常量覆盖一切。
- 避免硬编码的 Unix/macOS/Windows 路径字面量；优先使用路径安全的数组参数和跨平台处理。
- 对于测试用例，不要依赖仅冒烟式的测试。在打补丁前先复现 bug/失败，然后保留注释解释根因和修复理由。
- 在回归测试中相关时使用这个根因块格式：
  ```ts
  // ROOT CAUSE:
  //
  // 如果 XXXX，会发生某些 XXX 情况。
  // 这是因为 where line ...（某处代码行）
  //
  // <打补丁前的行为/代码>
  //
  // 我们通过 XXX、XXX、XXX 修复了它。
  // <打补丁后的行为/代码>
  ```
- 不要用 `========` 这样的分隔符把模块切分成小节；使用内聚的私有辅助函数组，或仅当新模块拥有不同职责时才拆分为模块。不要仅为减少嵌套、行数或创建测试缝隙而拆分文件。
- 不要过度使用表驱动风格。在许多情况下，保持表数组内联并用 `.map(...)` 直接映射。
- 优先使用提前返回并保持函数简单。当能提升可读性时限制嵌套，但不要仅为减少缩进而引入透传辅助函数或浅模块。

## 可读性评审清单

在评审复杂的 TypeScript 模块时，检查：

- 我能否在一屏之内识别出模块拥有的状态和外部副作用？
- 持久化状态、运行时状态、缓存状态、会话状态和外部副作用是否通过命名或注释区分开了？
- 协议信封、路由名、id 和关联键是否被命名或记录？
- 特殊分支和 fallback 情况是否在分支旁有解释？
- 过期/新鲜/缓存/快照语义在返回点是否可见？
- 清理和销毁语义是否显式？
- 辅助函数是否在隐藏真实策略，还是只是隐藏了需要解释的代码行？
- 注释是在解释决策为何存在，还是大多在复述代码所说？
- 读者能否在不打开三个相邻文件的情况下理解这段代码为何被塑造成这样？
