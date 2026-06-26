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

## Universal Editing Project Export

Date: 2026-06-09
Executor: Codex

### Passed

- `npx vitest run tests/unit/video-export/timeline-export.test.ts tests/unit/novel-promotion/video-urls-route.test.ts`
  - 2 files passed, 5 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- Focused ESLint for the export generator, hook, API route, toolbar, runtime, and tests passed.
- `git diff --check` passed.

### Noted

- `npm run test:unit:all` completed with 858 passing tests and 3 unrelated existing failures in `prompt-suffix-regression.test.ts`, `project-global-analyze-mutation.test.ts`, and `async-poll-yunwu-omni.test.ts`.
- `npm run check:file-line-count` failed on pre-existing oversized files; neither new implementation file exceeds its category budget.
- No real Final Cut Pro, Premiere Pro, or DaVinci Resolve import smoke test was available in the local environment.

## Editing Project Export Progress

Date: 2026-06-10
Executor: Codex

### Passed

- `npx vitest run tests/unit/video-export/export-progress.test.ts tests/unit/video-export/timeline-export.test.ts tests/unit/novel-promotion/video-urls-route.test.ts tests/unit/novel-promotion/video-toolbar-export-progress.test.ts`
  - 4 files passed, 8 tests passed.
- `npm run typecheck` passed.
- Focused ESLint and `git diff --check` passed.

## Vidu Q3 Pro Panel Generation 404

Date: 2026-06-10
Executor: Codex

### Passed

- `npx vitest run tests/unit/task/normalize-error.test.ts`
  - 1 file passed, 12 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- Authenticated empty-body route probe
  - Rendered URL: `https://yunwu.ai/ent/v2/img2video`.
  - Response reached Yunwu business routing with HTTP 503 instead of route 404; no generation task was created.

### Not Run

- A real video generation was not submitted because it would consume provider credits.

## Per-Panel Video Download

Date: 2026-06-10
Executor: Codex

### Passed

- `npx vitest run tests/unit/novel-promotion/panel-video-download.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts`
  - 2 files passed, 6 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- Focused ESLint for the touched card runtime, header, download Hook, and tests passed.
- `git diff --check` passed.

### Noted

- `npm run test:unit:all` completed with 863 passing tests and 3 unrelated existing failures in `prompt-suffix-regression.test.ts`, `project-global-analyze-mutation.test.ts`, and `async-poll-yunwu-omni.test.ts`.
- 下载代理回归修复后执行 `npx vitest run tests/unit/novel-promotion/video-proxy-route.test.ts tests/unit/novel-promotion/panel-video-download.test.ts`：2 files passed, 4 tests passed。
- 下载代理回归修复后 `npm run typecheck`、focused ESLint 与 `git diff --check` 均通过。

## Unified Storyboard Production

Date: 2026-06-10
Executor: Codex

### Passed

- `npx vitest run tests/unit/novel-promotion/video-proxy-route.test.ts tests/unit/worker/video-worker.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/video-panels-projection-error-code.test.ts tests/unit/novel-promotion/panel-video-state.test.ts`
  - 5 files passed, 19 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- Focused ESLint for all touched TypeScript implementation and test files passed.
- `npm run lint:all`
  - 0 errors; 47 existing warnings.
- `git diff --check`
  - Passed.

### Full Unit Suite

- `npm run test:unit:all`
  - 236 files passed, 3 files failed; 872 of 875 tests passed.
  - Existing unrelated failures: `prompt-suffix-regression.test.ts`, `project-global-analyze-mutation.test.ts`, `async-poll-yunwu-omni.test.ts`.

### Build

- Initial `npm run build` exposed an existing invalid helper export from the `video-proxy` route; the helper was moved to `src/lib/video-proxy.ts` and type checking passed afterward.
- The follow-up build was stopped because an active user-owned `next dev --turbopack` process was using the same `.next` directory. The development server was not terminated.

## Video Frame Capture Targets

Date: 2026-06-11 17:30:06 +0800
Executor: Codex

### Passed

- `npx vitest run tests/unit/novel-promotion/video-frame-capture-modal.test.ts tests/unit/novel-promotion/video-frame-capture-targets.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts`
  - 3 files passed, 9 tests passed.
  - Covers local-save UI, previous/current/next target rendering, global target ordering, boundary filtering, overwrite-confirmation rule, and card entry rendering.
- `npm run typecheck`
  - TypeScript check passed.
- Focused ESLint for all touched implementation and test files passed.
- `git diff --check`
  - Passed.

### Full Unit Suite

- `npm run test:unit:all`
  - 236 files passed, 4 files failed; 875 of 879 tests passed.
  - New and related frame-capture tests passed.
  - Unrelated existing failures remain in `video-worker.test.ts`, `prompt-suffix-regression.test.ts`, `project-global-analyze-mutation.test.ts`, and `async-poll-yunwu-omni.test.ts`.

### Guards

- `node scripts/guards/file-line-count-guard.mjs` reported existing oversized files across the repository.
- The new `VideoFrameCaptureModal.tsx` is 381 lines and remains below the component budget of 500 lines.

## Storyboard Group Insert/Delete Responsiveness

Date: 2026-06-16
Executor: Codex

### Passed

- `npm run typecheck`
  - TypeScript check passed.
- `npm run lint:all`
  - 0 errors, 46 existing warnings.

### Full Unit Suite

- `npm run test:unit:all`
  - 241 files passed, 4 files failed; 885 of 889 tests passed.
  - Failures are outside this change surface:
    - `tests/unit/helpers/prompt-suffix-regression.test.ts`
    - `tests/unit/novel-promotion/project-global-analyze-mutation.test.ts`
    - `tests/unit/task/async-poll-yunwu-omni.test.ts`
    - `tests/unit/worker/video-worker.test.ts`

### Residual Risk

- No browser click-through/profiling was run in this turn; verification is static plus local suite execution.
- The remaining full-suite failures predate or sit outside the touched storyboard group UI/cache files.

## Single Storyboard Image First Frame Prompt

Date: 2026-06-26
Executor: Codex

### Passed

- `npx vitest run tests/unit/worker/panel-image-task-handler.test.ts tests/unit/generator-api.test.ts`
  - 2 files passed, 29 tests passed.
- `npm run typecheck`
  - TypeScript check passed.
- `git diff --check`
  - Passed.

### Residual Risk

- Full repository test suite was not run for this narrow worker/generator parameter change.
