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
