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

## Universal Editing Project Export

Date: 2026-06-09
Executor: Codex

Implemented an editing-project ZIP export from the active video stage. The package contains all currently selected generated videos under `media/`, plus `timeline.fcpxml`, Premiere-compatible `timeline.xml`, and `manifest.json`.

### Commands

- `npx vitest run tests/unit/video-export/timeline-export.test.ts tests/unit/novel-promotion/video-urls-route.test.ts` passed: 2 files, 5 tests.
- `npm run typecheck` passed.
- Focused ESLint passed for all touched implementation and test files.
- `git diff --check` passed.
- `npm run test:unit:all` had 858 passing tests and 3 unrelated existing failures.

### Coverage

- Generator tests cover XML escaping, relative media URLs, sequential frame timing, source-audio linkage, manifest metadata, and aspect-ratio dimensions.
- API tests cover clip ordering, lip-sync preference, default duration, safe filenames, source type, and project ratio.
- No installed-editor import smoke test was available; this remains the principal compatibility risk.

## Editing Project Export Progress

Date: 2026-06-10
Executor: Codex

Added visible progress feedback for editing-project exports: preparation status, downloaded clip count, archive percentage, and an accessible progress bar below the video toolbar.

### Commands

- Focused Vitest run passed: 4 files, 8 tests.
- `npm run typecheck` passed.
- Focused ESLint passed.
- `git diff --check` passed.

## Vidu Q3 Pro Panel Generation 404

Date: 2026-06-10
Executor: Codex

Corrected the local Yunwu `viduq3-pro` and `viduq3-turbo` media templates to use Vidu's JSON image-to-video endpoint and task polling response fields. Also corrected error normalization so a gateway wrapper status 429 cannot hide a non-retryable upstream 404.

### Commands

- `npx vitest run tests/unit/task/normalize-error.test.ts` passed: 1 file, 12 tests.
- `npm run typecheck` passed.
- Authenticated empty-body probe reached `https://yunwu.ai/ent/v2/img2video` and returned a business-layer 503 rather than route 404; no task was created.

### Remaining Validation

- No paid video generation was submitted. The next user-triggered panel generation will exercise live task creation and polling.

## Per-Panel Video Download

Date: 2026-06-10
Executor: Codex

Added a download action to every video card that currently exposes a playable video. The action downloads through the existing project video proxy and names the file with the displayed panel number plus the panel description.

### Commands

- Focused Vitest passed: 2 files, 6 tests.
- `npm run typecheck` passed.
- Focused ESLint passed.
- `git diff --check` passed.
- Full unit suite: 863 passed, 3 unrelated existing failures.

### Coverage

- Filename tests cover panel numbering, invalid filename characters, URL extension detection, and MIME fallback.
- Component coverage confirms a visible video renders the download action.
- Runtime behavior uses the currently selected original or lip-sync video URL.
- 回归验证覆盖 `/m/m_...` 媒体路由：代理会先解析真实 storageKey，再获取最终签名地址，不再将媒体路由本身作为对象 key。

## Unified Storyboard Production

Date: 2026-06-10
Executor: Codex

分镜与成片已合并为“分镜制作”。同一分镜卡片同时包含图片与视频制作区域，视频模型和时长设置保留在视频区域内。图片重新生成不会删除旧视频；带来源图片记录的视频在图片变化后显示“可能已过期”。

### Commands

- Focused Vitest passed: 5 files, 19 tests.
- `npm run typecheck` passed.
- Focused ESLint passed.
- `npm run lint:all` passed with 0 errors and 47 existing warnings.
- `git diff --check` passed.
- Full unit suite: 872/875 passed; 3 unrelated existing failures remain.

### Build Note

- The initial production build exposed an existing invalid helper export from a Next.js route; the helper was moved to `src/lib/video-proxy.ts`.
- The follow-up build was stopped because the active user-owned Next.js development server was using the same `.next` directory. The development server was not terminated.

### Residual Risk

- No browser visual regression was executed.
- Historical videos without `sourceImageUrls` are preserved but are not guessed to be stale.
# Video Frame Capture Targets

Date: 2026-06-11 17:30:06 +0800
Executor: Codex

## Result

- Focused functional and render tests: 9 passed.
- TypeScript: passed.
- Focused ESLint: passed.
- Diff whitespace validation: passed.
- Full unit suite: 875 passed, 4 unrelated existing failures.

## Verified Behavior

- The selected frame can be downloaded locally as JPEG without closing the modal.
- Writable previous, current, and next panels are derived from the global panel order, including storyboard boundaries.
- Missing neighbors and panels without `panelId` are omitted.
- Targets with an existing image require confirmation before upload.
- Upload errors propagate back to the modal, keep it open, and show failure feedback.

## Residual Risk

- No interactive browser click-through was available in this turn; static render and pure behavior tests cover the UI contract and target logic.
- The full suite remains red due to four failures outside this feature's changed surface.
