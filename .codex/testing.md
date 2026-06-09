# Testing

Date: 2026-05-01
Executor: Codex

## Passed

- `npx vitest run tests/unit/novel-promotion/coarse-group-image-state.test.ts tests/unit/worker/panel-image-task-handler.test.ts`
  - 2 files passed, 18 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- `npm run lint -- <changed related files>`
  - ESLint passed for the touched implementation files.
- `npx vitest run tests/unit/guards/api-route-contract-guard.test.ts`
  - API route contract guard passed.

## Noted

- `npm run test:unit:all -- tests/unit/novel-promotion/coarse-group-image-state.test.ts tests/unit/worker/panel-image-task-handler.test.ts` invokes the package script with the fixed `tests/unit` argument first, so it ran the whole unit suite. It reported unrelated failures:
  - `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts` expected `{"async":true}` but received existing behavior `{"async":true,"mode":"all"}`.
  - Redis connection attempts to `127.0.0.1:16379` were blocked by the sandbox in helper route tests.
  - The new coarse group state test initially failed due history ordering and was fixed; the focused rerun passed.

## Yunwu Kling Omni Video

Date: 2026-05-01 16:37:50 +0800
Executor: Codex

### Passed

- `npx vitest run tests/unit/generators/yunwu-base-url.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/task/async-poll-external-id.test.ts tests/unit/task/async-poll-yunwu-omni.test.ts`
  - 4 files passed, 19 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- `npm run check:capability-catalog`
  - Capability catalog check passed.
- `npm run lint -- src/lib/generators/yunwu.ts src/lib/async-poll.ts 'src/app/[locale]/profile/components/api-config/types.ts' tests/unit/generators/yunwu-base-url.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/task/async-poll-external-id.test.ts tests/unit/task/async-poll-yunwu-omni.test.ts`
  - ESLint passed for touched implementation and test files.
- `npx vitest run tests/unit/task/async-poll-external-id.test.ts tests/unit/task/async-poll-yunwu-omni.test.ts`
  - Rerun after externalId help text update passed, 10 tests passed.
- `npm run lint -- src/lib/async-poll.ts`
  - ESLint passed after externalId help text update.

### Noted

- `npm run check:pricing-catalog` failed on pre-existing Ark Seedance 2.0 `containsVideoInput` pricing fields not declared in capabilities, unrelated to Yunwu Omni changes.
- `npm run test:unit:all` ran 223 files: 222 passed, 1 failed. The failure is an existing assertion mismatch in `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts`, expecting `{"async":true}` while current code sends `{"async":true,"mode":"all"}`.

## Panel Video Outbound Request Logging

Date: 2026-05-07 17:34:00 +0800
Executor: Codex

### Passed

- `npx vitest run tests/unit/worker/video-generation-resume.test.ts`
  - 1 file passed, 3 tests passed.
- `npx vitest run tests/unit/worker/video-worker.test.ts`
  - 1 file passed, 7 tests passed.
- `npx vitest run tests/unit/generators/openai-compatible-video.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/generators/fal-video-kling-presets.test.ts`
  - 3 files passed, 10 tests passed.
- `npx vitest run tests/unit/worker/video-generation-resume.test.ts tests/unit/worker/video-worker.test.ts tests/unit/generators/openai-compatible-video.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/generators/fal-video-kling-presets.test.ts`
  - 5 files passed, 20 tests passed.
- `npm run typecheck`
  - TypeScript check passed.

### Noted

- `npm run test:unit -- ...` failed because the package has no `test:unit` script. Retried with `npx vitest run ...`.
- The new focused test verifies `/tmp/wao-panel-video-outbound-requests.ndjson` receives sanitized data URL placeholders and does not contain long base64 runs.

## Coarse Group Video History

Date: 2026-05-09
Executor: Codex

### Passed

- `npm run typecheck`
  - TypeScript check passed.
- `npx vitest run tests/unit/worker/video-worker.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/coarse-group-image-state.test.ts`
  - 3 files passed, 16 tests passed.

### Noted

- `npm run test:unit:all -- tests/unit/novel-promotion/coarse-group-image-state.test.ts` runs the whole `tests/unit` suite because the script includes a fixed `tests/unit` argument. The run had unrelated existing failures in prompt suffix, project global analyze mutation, and Yunwu Omni async poll tests; the initially exposed related worker/card issues were fixed and passed in the focused rerun.

## Video Panel Preview Playback Stuck

Date: 2026-06-08
Executor: Codex

### Passed

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/novel-promotion/use-panel-player.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts`
  - 2 files passed, 3 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- `npx eslint src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/hooks/usePanelPlayer.ts src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardHeader.tsx tests/unit/novel-promotion/use-panel-player.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts`
  - ESLint passed for touched implementation and test files.

### Noted

- `cross-env BILLING_TEST_BOOTSTRAP=0 vitest run tests/unit/novel-promotion/use-panel-player.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts` failed because direct shell invocation could not find `cross-env`; the same focused tests passed through `npx vitest` with the environment variable set directly.

## Local Video Upload For Video Panel

Date: 2026-06-09
Executor: Codex

### Passed

- `npm run typecheck`
  - TypeScript check passed.
- `npx vitest run tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/panel-upload-video-route.test.ts tests/unit/guards/api-route-contract-guard.test.ts`
  - 3 files passed, 8 tests passed.
- `npx eslint 'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody.tsx' 'src/app/api/novel-promotion/[projectId]/panel/upload-video/route.ts' src/lib/novel-promotion/panel-video-state.ts src/lib/query/mutations/useVideoMutations.ts tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/panel-upload-video-route.test.ts`
  - ESLint passed for touched implementation and test files.

### Noted

- `npm run test:unit:all -- tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/panel-upload-video-route.test.ts` ran the full `tests/unit` suite because the script always includes `tests/unit`; new upload-related tests passed, while three unrelated existing failures remained in `prompt-suffix-regression.test.ts`, `project-global-analyze-mutation.test.ts`, and `async-poll-yunwu-omni.test.ts`.
