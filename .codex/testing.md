# Testing

Date: 2026-04-26
Executor: Codex

## Previous Commands

- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts tests/unit/worker/script-to-storyboard-atomic-retry.test.ts`
  - Result: passed, 2 files, 15 tests.
- `npm run typecheck`
  - Result: passed.
- `npm run test:unit:all`
  - Result: failed with 1 unrelated assertion in `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts`.
  - Failure: test expected body `{"async":true}` but implementation sent `{"async":true,"mode":"all"}`.
  - Note: user later clarified full unit suite is not needed; no further full-suite runs were made.

## Previous Focused Coverage

- Final phase3 panels now preserve acting guidance in both `actingNotes` and `acting_notes`.
- Atomic retry normalizes old nested acting guidance artifacts before final merge.

## Current Commands

- `npm run typecheck`
  - Result: passed.

- `npm run lint:all`
  - Result: passed with existing warnings.
  - Notes: 0 errors, 44 warnings. Warnings are unrelated existing unused variable / hook dependency warnings.

- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts tests/unit/worker/script-to-storyboard.test.ts`
  - Result: passed.
  - Coverage: 2 files, 17 tests.

- `npm run test:unit:all -- tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts tests/unit/worker/script-to-storyboard.test.ts`
  - Result: failed because the npm script always includes `tests/unit` and ran the whole unit suite.
  - Unrelated failure: `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts` expected request body `{"async":true}`, actual body included `{"async":true,"mode":"all"}`.

## Current Risk

The changed path now shares the same orchestrator and persistence helper as the full script-to-storyboard generation path, so regenerated panels should retain `parent_group_number` and render multiple coarse groups when the model outputs multiple coarse groups.

## 2026-04-27 Commands

- `npm run typecheck`
  - Result: passed.

- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts tests/unit/worker/script-to-storyboard-atomic-retry.test.ts tests/unit/worker/script-to-storyboard.test.ts`
  - Result: passed.
  - Coverage: 3 files, 20 tests.

## 2026-04-27 Risk

Existing generated records with only old `acting` text can now be merged without empty `posture/facing`; best output quality still depends on regenerating acting direction with the updated prompt so the model supplies explicit `screen_position/posture/facing`.

## 2026-04-27 Phase Start Commands

- `npm run typecheck`
  - Result: passed.
- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts`
  - Result: passed, 13 tests.
- `npm run lint:all`
  - Result: passed with existing warnings.
  - Notes: 0 errors, 44 warnings.

## 2026-04-27 Phase Start Risk

phase4 续跑沿用现有 reconcile 规则，保留当前分镜的 `description/source_text`，主要刷新视频提示词、首帧提示、时长、镜头/运镜等 detail 字段。

## 2026-04-27 Phase4 Acting Seed Fix

- `npm run typecheck`
  - Result: passed.
- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts`
  - Result: passed, 16 tests.

## 2026-04-27 Regenerate Text Concurrency

- `npm run typecheck`
  - Result: passed.
- `npx vitest run tests/unit/worker/script-to-storyboard.test.ts tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts`
  - Result: passed, 21 tests.

## 2026-04-27 Phase4 Duration Final

- `npm run typecheck`
  - Result: passed.
- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts`
  - Result: passed, 17 tests.

## 2026-04-27 Progress Text Guard

- `npm run typecheck`
  - Result: passed.

## 2026-04-28 Coarse Grid Storyboard Images

- `npx prisma generate`
  - Result: passed.

## 2026-04-29 Yunwu GPT Image 2

- `npm run test:unit:all -- --run tests/unit/generators/yunwu-image.test.ts tests/unit/generator-api.test.ts tests/unit/generators/openai-compatible-image.test.ts`
  - Result: failed as a command choice because the npm script still ran the whole `tests/unit` suite.
  - Relevant changed tests passed inside the run.
  - Unrelated failure: `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts` expected request body `{"async":true}`, actual body included `{"async":true,"mode":"all"}`.
  - Sandbox noise: Redis connection attempts to `127.0.0.1:16379` emitted `EPERM`.

- `npx vitest run tests/unit/generators/yunwu-image.test.ts tests/unit/generator-api.test.ts tests/unit/generators/openai-compatible-image.test.ts`
  - Result: passed.
  - Coverage: 3 files, 17 tests.
  - Focus: yunwu image endpoint normalization, multipart payload, choices/data response extraction, generator-api routing.

- `npm run typecheck`
  - Result: passed.

- `npm run lint:all`
  - Result: passed with existing warnings.
  - Notes: 0 errors, 43 warnings. Warnings are unrelated existing unused variable / hook dependency warnings.

## 2026-04-29 Yunwu Custom Endpoint

- `npm run typecheck`
  - Result: passed.

- `npx vitest run tests/unit/generators/yunwu-image.test.ts tests/unit/generator-api.test.ts`
  - Result: passed.
  - Coverage: 2 files, 15 tests.
  - Focus: yunwu image generator accepts model-level `customEndpoint` and normalizes duplicate `/v1` image edit paths.

## 2026-04-29 Storyboard Group Image Size

- `npm run typecheck`
  - Result: passed.

- `npx vitest run tests/unit/worker/panel-image-task-handler.test.ts tests/unit/generators/yunwu-image.test.ts`
  - Result: passed.
  - Coverage: 2 files, 15 tests.
  - Focus: final storyboard sheet size respects gpt-image-2 size constraints and accounts for panel layout, aspect ratio, and black separator width.

- `npm run lint:all`
  - Result: passed with existing warnings.
  - Notes: 0 errors, 43 warnings. Warnings are unrelated existing unused variable / hook dependency warnings.

## 2026-04-29 Storyboard Coarse Group Concurrent Persist

- `npx vitest run tests/unit/worker/panel-image-task-handler.test.ts`
  - Result: passed.
  - Coverage: 1 file, 13 tests.
  - Focus: coarse group image persistence merges against latest `coarseGroupsJson` so concurrent storyboard group tasks do not overwrite each other's generated images with stale snapshots.

- `npm run typecheck`
  - Result: passed.

- `npm run test:unit:all -- tests/unit/worker/panel-image-task-handler.test.ts`
  - Result: failed because the npm script also ran the whole `tests/unit` suite.
  - Relevant changed test file passed in that run.
  - Unrelated failure: `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts` expected request body `{"async":true}`, actual body included `{"async":true,"mode":"all"}`.

## 2026-04-29 Yunwu GPT Image 2 Compat Route

- `npm run typecheck`
  - Result: passed.

- `npx vitest run tests/unit/generator-api.test.ts tests/unit/generators/yunwu-image.test.ts tests/unit/generators/openai-compatible-image.test.ts`
  - Result: passed.
  - Coverage: 3 files, 18 tests.
  - Focus: openai-compatible provider with `https://yunwu.ai/v1` baseUrl and `gpt-image-2` bypasses compat template and routes to yunwu official generator.

- `npm run lint:all`
  - Result: passed with existing warnings.
  - Notes: 0 errors, 43 warnings. Warnings are unrelated existing unused variable / hook dependency warnings.

## 2026-04-28 Coarse Card Generate Button

- `npm run typecheck`
  - Result: passed.

- `npm run lint:all`
  - Result: passed with existing warnings.
  - Notes: 0 errors, 44 warnings. Warnings are unrelated existing unused variable / hook dependency warnings.
  - Purpose: refresh Prisma Client after adding `NovelPromotionStoryboard.coarseGroupsJson`.

- `npm run typecheck`
  - Result: passed.

- `npx vitest run tests/unit/worker/panel-image-task-handler.test.ts tests/unit/worker/image-worker.test.ts`
  - Result: passed.
  - Coverage: 2 files, 7 tests.
  - Focus: storyboard group image worker routing, multi-grid prompt aggregation, coarse group prompt persistence.

- `npm run lint:all`
  - Result: passed with existing warnings.
  - Notes: 0 errors, 44 warnings. Warnings are unrelated existing unused variable / hook dependency warnings.

- `npm run test:unit:all -- panel-image-task-handler image-worker`
  - Result: failed because the npm script still ran the whole `tests/unit` suite.
  - Relevant changed tests passed inside the run.
  - Unrelated failure: `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts` expected request body `{"async":true}`, actual body included `{"async":true,"mode":"all"}`.

## 2026-04-28 Local Database Repair

- `npx prisma db execute --file prisma/migrations/20260428120000_add_storyboard_coarse_groups/migration.sql --schema prisma/schema.prisma`
  - Result: passed.
  - Purpose: directly apply the new column to the existing non-empty local MySQL database.

- `SHOW COLUMNS FROM novel_promotion_storyboards LIKE 'coarseGroupsJson'`
  - Result: returned `coarseGroupsJson` as nullable `text`.

- `npx prisma generate`
  - Result: passed.
