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
