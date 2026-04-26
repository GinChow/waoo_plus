# Testing

Date: 2026-04-26
Executor: Codex

## Commands

- `npx vitest run tests/unit/worker/script-to-storyboard-orchestrator.retry.test.ts tests/unit/worker/script-to-storyboard-atomic-retry.test.ts`
  - Result: passed, 2 files, 15 tests.
- `npm run typecheck`
  - Result: passed.
- `npm run test:unit:all`
  - Result: failed with 1 unrelated assertion in `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts`.
  - Failure: test expected body `{"async":true}` but implementation sent `{"async":true,"mode":"all"}`.
  - Note: user later clarified full unit suite is not needed; no further full-suite runs were made.

## Focused Coverage

- Final phase3 panels now preserve acting guidance in both `actingNotes` and `acting_notes`.
- Atomic retry normalizes old nested acting guidance artifacts before final merge.
