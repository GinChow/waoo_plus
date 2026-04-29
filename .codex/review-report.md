# Review Report - Coarse Grid Storyboard Images

- Date: 2026-04-28
- Reviewer: Codex
- Recommendation: pass
- Technical score: 92/100
- Strategic score: 91/100
- Overall score: 92/100

## Findings

- No blocking issues found in the changed image generation path.
- Residual risk: `coarseGroupsJson` is JSON text rather than a normalized table because the existing data model has no persisted coarse group entity. This keeps the change small but requires future code to parse the JSON for per-group metadata.
- Residual risk: the fine-panel image buttons now redirect to the parent coarse group generation when group metadata exists; the old single-panel path remains only as a fallback for malformed group data.

## Evidence

- `npm run typecheck` passed.
- `npx vitest run tests/unit/worker/panel-image-task-handler.test.ts tests/unit/worker/image-worker.test.ts` passed.
- `npm run lint:all` passed with existing warnings only.
- Full unit run has one unrelated existing assertion failure documented in `.codex/testing.md`.

---

# Review Report

Date: 2026-04-26
Reviewer: Codex

## Previous Scope

修复 phase3 最终合并 JSON 中演技指导丢失或结构错误的问题。

## Previous Findings

- 技术评分: 92/100
- 战略评分: 90/100
- 综合评分: 91/100
- 建议: 通过

## Previous Evidence

- `mergePanelsWithRules` 现在在主编排器和 atomic retry 中同时输出 `actingNotes` 与 `acting_notes`，值均为角色演技数组。
- `normalizeActingNotesPayload` 兼容旧 artifact 中嵌套的 `{ panel_number, characters }` 结构，避免重试链路把对象继续传到最终 JSON。
- 单测覆盖了主链路和 atomic retry 的最终输出契约。

## Previous Risks

- `npm run test:unit:all` 存在一个无关失败：`project-global-analyze-mutation.test.ts` 的请求 body 断言落后于当前实现。

## Current Scope

Fix `regenerate_storyboard_text` so storyboard text regeneration preserves the same coarse-to-fine grouping semantics as initial generation.

## Current Scores

- Technical: 92/100
- Strategic: 94/100
- Overall: 93/100

## Current Recommendation

Pass.

## Current Findings

- Root cause is addressed by replacing the stale local regenerate flow with the canonical `runScriptToStoryboardOrchestrator`.
- Persistence now uses `persistStoryboardsAndPanels`, which writes `storyboardTextJson` from `parent_group_number` and matches the initial generation path.
- Removed duplicated old phase merge code from `text.worker.ts`, reducing drift from the canonical pipeline.

## Current Verification

- `npm run typecheck`: passed.
- `npm run lint:all`: passed with unrelated existing warnings.
- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts tests/unit/worker/script-to-storyboard.test.ts`: passed.

## Current Residual Risk

- A whole-suite unit run currently has an unrelated failing expectation in `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts`.

## 2026-04-27 Scope

Fix missing `screen_position/posture/facing` in final `photography_rules.characters` when acting guidance has those fields or only old `acting` text.

## 2026-04-27 Findings

- Main orchestrator and atomic retry now merge acting-character constraints into `photographyPlan.characters`.
- Empty fields are filled from acting notes first, then storyboard slot, composition, viewpoint, panel description, or acting text.
- Acting prompt now asks for `screen_position/posture/facing/acting` explicitly.

## 2026-04-27 Verification

- `npm run typecheck`: passed.
- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts tests/unit/worker/script-to-storyboard-atomic-retry.test.ts tests/unit/worker/script-to-storyboard.test.ts`: passed.

## 2026-04-27 Phase Start Scope

分镜面板重新生成文字支持选择从 phase1/phase2/phase3/phase4 开始，基于当前结果继续生成，减少不必要的全量耗时。

## 2026-04-27 Phase Start Scores

- Technical: 92/100
- Strategic: 92/100
- Overall: 92/100

## 2026-04-27 Phase Start Recommendation

Pass.

## 2026-04-27 Phase Start Findings

- API 接收并校验 `startPhase`，默认 `phase1` 保持旧行为。
- worker 在非 phase1 时读取当前 panels 并转换为 orchestrator seed。
- orchestrator 支持从 phase2/phase3/phase4 跳过前置步骤继续执行。
- UI 在重新生成文字旁新增起始阶段选择器。

## 2026-04-27 Phase Start Verification

- `npm run typecheck`: passed.
- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts`: passed.
- `npm run lint:all`: passed with existing warnings.

## 2026-04-27 Phase Start Residual Risk

- phase4 续跑沿用既有 reconcile 规则，不覆盖 `description/source_text`，主要刷新视频提示词、首帧提示、时长、镜头/运镜等 detail 字段。
# 2026-04-29 Yunwu GPT Image 2 Review

- Executor: Codex
- Scope: `yunwu::gpt-image-2` image edit provider path.
- Technical score: 92/100.
- Strategic score: 91/100.
- Overall score: 92/100.
- Recommendation: pass.

## Findings

- No blocking findings in the scoped changes.
- Residual risk: live yunwu behavior was inferred from the provided unit script and covered with mocked local tests; no real API call was executed because credentials/network access are not part of this validation turn.

## Evidence

- Added provider-specific implementation instead of changing shared OpenAI compatible behavior.
- Local validation passed: typecheck, focused vitest, lint.
- Full unit suite was accidentally invoked through the project script and surfaced one unrelated existing assertion failure in `project-global-analyze-mutation`.

## Follow-up Fix 2026-04-29 14:40 CST

- Finding: runtime log showed the actual configured model was still using `openai-compatible` template routing, causing `template-image.ts` to send JSON `image` and fail with `Unknown parameter: 'image'`.
- Resolution: `generator-api` now detects `providerKey=openai-compatible`, `modelId=gpt-image-2`, and `baseUrl` host `yunwu.ai`, then forces official yunwu image generator routing.
- Verification: typecheck, focused vitest, and lint passed.
