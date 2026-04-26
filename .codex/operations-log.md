# Operations Log

- 2026-04-24 Codex: Received request to parallelize storyboard phase2/phase3/phase4 per coarse shot.
- 2026-04-24 Codex: sequential-thinking, shrimp-task-manager, code-index MCP tools unavailable; used local rg/sed and built-in planning fallback.
- 2026-04-24 Codex: Identified serial group loops in src/lib/novel-promotion/script-to-storyboard/orchestrator.ts.
- 2026-04-24 Codex: Replaced serial coarse group split, guidance, and detail loops with bounded mapWithConcurrency while preserving result order.
- 2026-04-24 Codex: Added unit coverage for bounded group concurrency and ordered final panels.
- 2026-04-26 Codex: Received report that phase3 acting guidance is lost during merged JSON output.
- 2026-04-26 Codex: sequential-thinking, shrimp-task-manager, code-index MCP tools unavailable; used rg/sed and local test commands as fallback.
- 2026-04-26 Codex: Updated main storyboard orchestrator and atomic retry merge paths to emit final acting guidance as both actingNotes and acting_notes arrays.
- 2026-04-26 Codex: Added normalization for old nested acting guidance artifact shape in atomic retry.
- 2026-04-26 Codex: Verified focused worker tests and typecheck pass; full unit suite has one unrelated project-global-analyze-mutation assertion failure and is not used as this task's acceptance gate.
