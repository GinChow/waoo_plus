# Verification

Date: 2026-05-01
Executor: Codex

Implemented and verified the coarse storyboard image history flow.

## Commands

- `npx vitest run tests/unit/novel-promotion/coarse-group-image-state.test.ts tests/unit/worker/panel-image-task-handler.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint -- <changed related files>` passed.
- `npx vitest run tests/unit/guards/api-route-contract-guard.test.ts` passed.

## Coverage

- Unit coverage confirms generated coarse group candidates are appended into `imageHistory`.
- Unit coverage confirms only a recorded image can be selected as the current coarse group image.
- Unit coverage confirms history images can be deleted, including current-image fallback behavior.
- Worker coverage confirms storyboard group generation persists the new history data.

## Residual Notes

- Full unit invocation through `npm run test:unit:all -- ...` ran the entire unit suite because the script always includes `tests/unit`; it exposed one unrelated existing assertion mismatch in `project-global-analyze-mutation.test.ts` and sandbox-blocked Redis connection attempts.

## Yunwu Kling Omni Video

Date: 2026-05-01 16:37:50 +0800
Executor: Codex

Implemented Yunwu provider `kling-video-o1` and `kling-v3-omni` video generation through `/videos/omni-video`, including async polling via `YUNWUOMNI:VIDEO` externalId.

### Commands

- `npx vitest run tests/unit/generators/yunwu-base-url.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/task/async-poll-external-id.test.ts tests/unit/task/async-poll-yunwu-omni.test.ts` passed.
- `npm run typecheck` passed.
- `npm run check:capability-catalog` passed.
- `npm run lint -- src/lib/generators/yunwu.ts src/lib/async-poll.ts 'src/app/[locale]/profile/components/api-config/types.ts' tests/unit/generators/yunwu-base-url.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/task/async-poll-external-id.test.ts tests/unit/task/async-poll-yunwu-omni.test.ts` passed.
- `npx vitest run tests/unit/task/async-poll-external-id.test.ts tests/unit/task/async-poll-yunwu-omni.test.ts` passed after externalId help text update.
- `npm run lint -- src/lib/async-poll.ts` passed after externalId help text update.
- `npm run check:pricing-catalog` failed on unrelated existing Ark pricing/capability mismatch.
- `npm run test:unit:all` had 222 files passed and 1 unrelated existing failure in `project-global-analyze-mutation.test.ts`.

### Coverage

- Unit coverage confirms Omni create payload uses `/videos/omni-video`, Bearer auth, pure base64 first frame, duration/aspect/mode/sound mappings, and custom baseUrl externalId.
- Unit coverage confirms `YUNWUOMNI` externalId parsing and polling maps `succeed`/`failed` responses.

## Panel Video Outbound Request Logging

Date: 2026-05-07 17:34:00 +0800
Executor: Codex

Added common panel video outbound request logging and `/tmp/wao-panel-video-outbound-requests.ndjson` append-only debug records. Image data URL and base64-like values are redacted to length placeholders in logs and temp records.

### Commands

- `npx vitest run tests/unit/worker/video-generation-resume.test.ts` passed.
- `npx vitest run tests/unit/worker/video-worker.test.ts` passed.
- `npx vitest run tests/unit/generators/openai-compatible-video.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/generators/fal-video-kling-presets.test.ts` passed.
- `npx vitest run tests/unit/worker/video-generation-resume.test.ts tests/unit/worker/video-worker.test.ts tests/unit/generators/openai-compatible-video.test.ts tests/unit/generators/yunwu-omni-video.test.ts tests/unit/generators/fal-video-kling-presets.test.ts` passed.
- `npm run typecheck` passed.
- `npm run test:unit -- ...` failed because `test:unit` is not defined in `package.json`; reran with `npx vitest run ...`.

### Coverage

- Unit coverage confirms video generation receives original base64 values while logs/temp records contain only `[base64 omitted length=...]` placeholders.
- Existing worker and generator tests confirm the changed common path does not regress panel video processing or supported video generator routing.

## Coarse Group Video History

Date: 2026-05-09
Executor: Codex

Implemented and verified coarse shot video history in the video render panel, mirroring the storyboard panel coarse image history pattern.

### Commands

- `npm run typecheck` passed.
- `npx vitest run tests/unit/worker/video-worker.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/coarse-group-image-state.test.ts` passed.

### Coverage

- Unit coverage confirms generated coarse group videos append into `videoHistory`, old videos can be selected, and deleting the current video falls back to the latest remaining history video.
- Worker coverage confirms panel video generation still completes while group video state is persisted.
- Component coverage confirms the existing video card body render path remains usable without a QueryClient when no history dropdown is mounted.

### Residual Notes

- `npm run test:unit:all -- tests/unit/novel-promotion/coarse-group-image-state.test.ts` ran the whole unit suite and failed on unrelated existing assertions in prompt suffix, project global analyze mutation, and Yunwu Omni async poll tests. Related failures found during that run were fixed and verified with focused tests.

## Video Panel Preview Playback Stuck

Date: 2026-06-08
Executor: Codex

Fixed the video render panel preview player so native video play failures and media abort/error events reset the card back to the poster state instead of leaving the browser video element mounted with an indefinite loading spinner.

### Commands

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/novel-promotion/use-panel-player.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts` passed.
- `npm run typecheck` passed.
- `npx eslint src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/runtime/hooks/usePanelPlayer.ts src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardHeader.tsx tests/unit/novel-promotion/use-panel-player.test.ts tests/unit/novel-promotion/video-panel-card-body.test.ts` passed.

### Coverage

- Unit coverage confirms native play failures that should reset playback are classified correctly.
- Component-adjacent coverage confirms the existing video card body render path remains stable after adding query hook mocks.
- TypeScript and ESLint coverage confirm the new header event handlers match the runtime shape.

### Residual Notes

- No browser screenshot run was executed for this UI-only playback state; local automated verification covered unit logic, type safety, and linting.
- Direct `cross-env ... vitest` shell invocation failed because `cross-env` was not on PATH outside npm scripts; tests passed with `BILLING_TEST_BOOTSTRAP=0 npx vitest run ...`.

## Local Video Upload For Video Panel

Date: 2026-06-09
Executor: Codex

Implemented a local video upload path for ordinary single video panel cards. The API uploads MP4/MOV/WebM/M4V files to storage, sets the uploaded object as the current panel video, clears stale lip-sync output, and appends an `upload` source entry to panel video history.

### Commands

- `npm run typecheck` passed.
- `npx vitest run tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/panel-upload-video-route.test.ts tests/unit/guards/api-route-contract-guard.test.ts` passed.
- `npx eslint 'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardBody.tsx' 'src/app/api/novel-promotion/[projectId]/panel/upload-video/route.ts' src/lib/novel-promotion/panel-video-state.ts src/lib/query/mutations/useVideoMutations.ts tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/panel-upload-video-route.test.ts` passed.
- `npm run test:unit:all -- tests/unit/novel-promotion/video-panel-card-body.test.ts tests/unit/novel-promotion/panel-upload-video-route.test.ts` ran the whole unit suite and failed only on unrelated existing tests: `prompt-suffix-regression.test.ts`, `project-global-analyze-mutation.test.ts`, and `async-poll-yunwu-omni.test.ts`.

### Coverage

- Component coverage confirms ordinary single panel cards render the local video upload file input and upload button.
- API coverage confirms uploaded videos are persisted to storage, set as current panel video, and appended into video history.
- Route contract coverage confirms the new route follows protected API conventions.
