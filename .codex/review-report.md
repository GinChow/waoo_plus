# Review Report

Date: 2026-05-01
Reviewer: Codex

## Result

Recommendation: Pass

Technical score: 92/100
Strategic score: 91/100
Overall score: 92/100

## Findings

- The implementation reuses `coarseGroupsJson` rather than adding a database migration, keeping the change scoped to the existing coarse group persistence model.
- New generation results append to `imageHistory`; candidate images generated in the same run are also recorded.
- The selection API validates that the requested image belongs to the target group before updating `imageUrl`.
- The deletion API validates membership before removing a history image and handles current-image fallback.
- Media attach now resolves history image keys into previewable URLs, matching existing `imageUrl` and `candidateImages` behavior.

## Verification

- Focused unit tests passed.
- TypeScript check passed.
- ESLint passed on related changed files.

## Residual Risk

- The dropdown has not been browser-screenshot verified in this turn. Risk is limited to visual spacing, not the data contract.

## Yunwu Kling Omni Video Review

Date: 2026-05-01 16:37:50 +0800
Reviewer: Codex

Recommendation: Pass

Technical score: 91/100
Strategic score: 90/100
Overall score: 91/100

### Findings

- The new Omni branch is gated by exact model ids `kling-video-o1` and `kling-v3-omni`, so existing Yunwu Vidu-compatible models continue using the previous implementation.
- Request construction follows the provided Yunwu test script: `/videos/omni-video`, Bearer auth, `model_name`, `multi_shot`, `mode`, `duration`, optional `sound`, frame images, and watermark fields.
- Async polling is separated under `YUNWUOMNI:VIDEO`, avoiding ambiguity with existing `YUNWU:VIDEO` Vidu polling.
- Focused tests cover create payload, baseUrl normalization, externalId parsing, and poll status mapping.

### Residual Risk

- No live Yunwu API call was executed; verification used local unit tests with mocked fetch responses.
- `check:pricing-catalog` remains blocked by an unrelated existing Ark pricing catalog mismatch.

## Video Panel Preview Playback Stuck Review

Date: 2026-06-08
Reviewer: Codex

Recommendation: Pass

Technical score: 91/100
Strategic score: 90/100
Overall score: 91/100

### Findings

- The fix is scoped to the existing `usePanelPlayer` playback state and `VideoPanelCardHeader` native video event bindings.
- `play()` failures now reset `isPlaying` when appropriate, so a failed native preview does not keep the card in video mode indefinitely.
- Native media `error` and `abort` events now return the card to its poster state, matching the existing ended/source-switch behavior.
- Focused unit tests, TypeScript, and ESLint passed.

### Residual Risk

- No browser-level reproduction was run in this turn, so the remaining risk is limited to browser-specific native video event timing. The implemented handlers cover the failure paths visible from the code and user screenshot.

## Local Video Upload For Video Panel Review

Date: 2026-06-09
Reviewer: Codex

Recommendation: Pass

Technical score: 92/100
Strategic score: 91/100
Overall score: 92/100

### Findings

- The implementation reuses existing `videoUrl` and `videoHistory` persistence instead of adding a new storage model or migration.
- The upload API is scoped to project-authenticated panel updates, accepts common browser video formats, uploads through the existing storage provider, and appends a normalized `upload` history entry.
- The React Query mutation patches the episode cache immediately with signed playback URL, storage key, and history, preserving the existing delete/select video flows.
- The UI exposes upload only on ordinary single panel cards; first-last-frame linked cards are excluded because their display path only shows `firstlastframe` outputs.
- Focused component/API/route tests, TypeScript, and ESLint passed.

### Residual Risk

- No browser upload smoke test was run in this turn. Remaining risk is limited to visual spacing and large-file runtime behavior in the actual browser/network environment.

## Universal Editing Project Export Review

Date: 2026-06-09
Reviewer: Codex

Recommendation: Pass

Technical score: 90/100
Strategic score: 93/100
Overall score: 91/100

### Findings

- The export is integrated into the active video stage instead of the currently disabled standalone editor.
- The existing video selection contract is extended with duration, source type, panel identity, and project ratio without breaking the existing bulk-download consumer.
- FCPXML, Premiere XML, and manifest generation are isolated as deterministic pure functions with XML escaping, frame rounding, sequential timing, and relative media paths.
- The export aborts on any media download failure, preventing delivery of a timeline with missing source files.
- Focused tests, TypeScript, ESLint, and diff validation passed.

### Residual Risk

- XML import behavior has not been exercised in installed desktop editors. FCPXML and xmeml are intentionally limited to a single video track and linked source-audio track; advanced effects and metadata are out of scope.
- Browser-side ZIP creation keeps downloaded media in memory, so very large episodes may require a future streaming or desktop-side export path.

## Editing Project Export Progress Review

Date: 2026-06-10
Reviewer: Codex

Recommendation: Pass

Technical score: 92/100
Strategic score: 94/100
Overall score: 93/100

### Findings

- The UI now distinguishes metadata preparation, per-clip downloading, and archive generation.
- Download progress reserves 5-85% and reports current/total clips; JSZip metadata drives the final 85-100%.
- Packing updates are deduplicated by integer percentage to avoid unnecessary React rendering during large exports.
- The progress bar exposes `role=progressbar`, percentage attributes, and live status text.

### Residual Risk

- Export still retains media blobs in browser memory. The progress UI prevents apparent freezing but does not change the memory ceiling for extremely large projects.

## Vidu Q3 Pro Panel Generation 404 Review

Date: 2026-06-10
Reviewer: Codex

Recommendation: Pass

Technical score: 94/100
Strategic score: 93/100
Overall score: 94/100

### Findings

- The saved model template now matches the provider's Vidu image-to-video create and polling contract without adding provider-specific runtime branching.
- The request uses the provider's root API URL, avoiding the OpenAI-compatible `/v1` normalization that caused the 404.
- Nested upstream 404 errors are now non-retryable even when a gateway wraps them in HTTP 429.
- Focused unit tests and TypeScript checks passed; an authenticated no-task probe reached the intended provider route.

### Residual Risk

- A paid end-to-end Vidu generation was intentionally not executed, so final provider output polling remains unverified against a live successful task in this turn.

## Per-Panel Video Download Review

Date: 2026-06-10
Reviewer: Codex

Recommendation: Pass

Technical score: 93/100
Strategic score: 94/100
Overall score: 93/100

### Findings

- The implementation reuses the existing Blob mutation and authenticated video proxy instead of introducing a second download transport.
- The button downloads the runtime's current video URL, so original and lip-sync selection remains consistent with playback.
- Filename generation follows the existing batch-download convention while handling invalid characters and common video extensions.
- Focused tests, TypeScript, ESLint, and diff validation passed.

### Residual Risk

- No browser click smoke test was run; remaining risk is limited to browser-specific download behavior and visual spacing on unusually narrow cards.
- 首次浏览器点击暴露媒体路由 404 后已修复；新增回归测试确认 `/m/publicId` 不会被错误签名为 storageKey。

## Unified Storyboard Production Review

Date: 2026-06-10
Reviewer: Codex

Recommendation: Pass

Technical score: 92/100
Strategic score: 94/100
Overall score: 93/100

### Findings

- 导航和路由统一为“分镜制作”，同时保留旧 stage URL 的兼容进入路径。
- 统一卡片复用现有 `PanelCard`、`VideoPanelCard` 和视频 runtime hooks，没有复制模型能力、首尾帧或口型同步业务逻辑。
- 视频卡片继续显示模型和时长设置，并保留生成、历史、上传、下载等原有能力。
- 图片重新生成不会清除当前视频；新生成和上传的视频保存来源图片序列，签名 URL 变化不会造成误判。
- 普通单图、首尾帧和多图组合视频均记录实际来源图片，相关状态解析和投影测试已覆盖。
- 相关单测、TypeScript、ESLint 和差异检查通过。

### Residual Risk

- 本次未进行浏览器截图级视觉验收，剩余风险主要是极窄屏下的卡片密度和间距。
- 历史遗留且没有 `sourceImageUrls` 的视频无法可靠判断来源，系统保留视频但不做猜测性过期提示。
- 生产构建未完成，因为当前开发服务正在使用同一 `.next` 目录；类型检查和相关测试均已通过。

## Video Frame Capture Targets Review

Date: 2026-06-11 17:30:06 +0800
Reviewer: Codex

Recommendation: Pass

Technical score: 93/100
Strategic score: 94/100
Overall score: 93/100

### Findings

- The modal encodes the selected video frame once per action and supports local download plus previous/current/next panel image updates.
- Adjacent targets are derived from the existing global `allPanels` order, so navigation works across storyboard boundaries without a second ordering model.
- Image writes reuse the existing authenticated `panel/update-image` route, storage path, history preservation, local state patch, and query refresh flow.
- Existing target images trigger the shared warning confirmation dialog before replacement.
- Seek completion disables capture actions, preventing the optimistic slider time from being saved before the video element reaches that frame.
- Upload HTTP failures are no longer swallowed for frame capture, so the modal remains open and reports the error instead of signaling false success.

### Verification

- Focused tests passed: 3 files, 9 tests.
- TypeScript, focused ESLint, and `git diff --check` passed.
- Full unit suite completed with 875 passing tests and 4 unrelated existing failures.

### Residual Risk

- Browser-specific canvas encoding, native download behavior, and visual wrapping on very narrow viewports were not interactively exercised in this turn.
