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
