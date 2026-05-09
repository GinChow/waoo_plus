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
