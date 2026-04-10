# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

waoowaoo 是一个 AI 影视 Studio，基于小说文本自动生成分镜、角色、场景并制作成完整视频。技术栈：Next.js 15 + React 19 + TypeScript，MySQL (Prisma ORM)，Redis (BullMQ)，MinIO (S3兼容存储)，Tailwind CSS v4，NextAuth.js。

## Common Commands

```bash
# 开发（需先启动基础设施）
docker compose up mysql redis minio -d
npx prisma db push          # 首次或schema变更后必须执行
npm run dev                  # 启动所有服务（Next.js + Worker + Watchdog + Bull Board）

# 单独启动某个服务
npm run dev:next             # Next.js (Turbopack, port 3000)
npm run dev:worker           # BullMQ workers
npm run dev:watchdog         # 任务状态监控（30s轮询）
npm run dev:board            # Bull Board UI (port 3010)

# 构建与检查
npm run build                # prisma generate + next build
npm run typecheck            # tsc --noEmit
npm run lint:all             # eslint 全量检查

# 测试
npm run test:unit:all        # 所有单元测试
npm run test:all             # 全量测试（guards + unit + integration + system + regression）
npm run test:billing         # 计费相关测试（含覆盖率）
npm run test:guards          # 架构守卫检查
npm run test:pr              # PR 提交前完整回归

# 运行单个测试文件
cross-env BILLING_TEST_BOOTSTRAP=0 vitest run path/to/test.ts

# 守卫检查（架构约束）
npm run check:api-handler                # API路由契约
npm run check:config-center-guards       # 模型配置中心
npm run check:test-coverage-guards       # 测试覆盖率
```

## Architecture

### 运行时服务组成
`npm run dev` 同时启动 4 个进程：
1. **Next.js** — 前端页面 + API 路由 (port 3000)
2. **Workers** — 4 个 BullMQ worker (text/image/video/voice)
3. **Watchdog** — 任务状态协调器，处理心跳超时和状态不一致
4. **Bull Board** — 队列管理 UI (port 3010)

### 目录结构
- `src/app/[locale]/` — 前端页面，基于 next-intl 的多语言路由
- `src/app/api/` — API 路由，统一使用 `apiHandler` 包装器（见 `src/lib/api-errors.ts`）
- `src/lib/workers/` — BullMQ worker 定义和 handler
- `src/lib/workflow-engine/` — 多步骤工作流引擎（GraphRun/GraphStep）
- `src/lib/llm/` — 多 LLM 提供商抽象（OpenAI、Gemini、火山引擎 Ark、OpenAI-compatible）
- `src/lib/model-gateway/` — 模型路由与能力查询
- `src/lib/generators/` — 图片/视频/音频生成器（FAL.ai、官方 API 等）
- `src/lib/billing/` — 计费系统（余额冻结 → 任务执行 → 结算）
- `src/lib/media/` — 媒体对象管理与出站图片统一化
- `src/lib/storage/` — 存储抽象（MinIO/S3/COS）
- `src/lib/prompt-i18n/` — Prompt 国际化
- `src/components/` — React 组件
- `tests/` — 测试（unit/integration/system/regression/concurrency/contracts）
- `scripts/guards/` — 架构守卫脚本

### 异步任务系统
- 任务通过 API 提交 → BullMQ 队列 → Worker 处理
- 状态流转：queued → processing → completed/failed/canceled
- 计费流程：提交前冻结余额 → 完成后结算/退还
- 前端通过 SSE (`/api/sse`) 实时获取任务状态更新

### 关键模式
- **API 路由**：必须使用 `apiHandler` 包装器，包含请求 ID、错误处理、审计日志
- **状态管理**：服务端用 Prisma + Redis，客户端用 React Query
- **认证**：NextAuth.js + Prisma adapter，Session 模式
- **路径别名**：`@/*` → `./src/*`

### 基础设施端口映射（docker-compose）
- MySQL: 13306
- Redis: 16379
- MinIO: 19000 (API) / 19001 (Console)

### 环境变量
- `BILLING_TEST_BOOTSTRAP=0` — 单元测试不需要数据库
- `BILLING_TEST_BOOTSTRAP=1` — 集成测试需要数据库
- `SYSTEM_TEST_BOOTSTRAP=1` — 系统测试
