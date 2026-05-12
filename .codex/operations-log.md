# Operations Log

Date: 2026-05-01
Executor: Codex

## Task

为分镜面板粗镜头卡片增加每次生成图片的历史记录，下拉预览历史图片，并支持选择历史图片作为当前粗镜头分镜图。

## Notes

- 使用 `rg` 定位粗镜头 UI、生成 worker、API 与 `coarseGroupsJson` 数据流。
- 采用扩展 `coarseGroupsJson` 的方式保存 `imageHistory`，避免新增数据库迁移。
- 新增 `storyboard-group/select-image` API 负责验证并切换当前粗镜头图片。
- 更新媒体附加逻辑，确保历史图片中的存储 key 会转换为可预览 URL。
- 追加历史图片删除能力：从 `imageHistory` 和候选列表移除目标图；删除当前图时回退到剩余历史最后一张。

## Task: Yunwu Kling Omni Video

Date: 2026-05-01 16:37:50 +0800
Executor: Codex

- 工具降级：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index、exa；使用 `rg`、`sed`、本地测试和结构化记录替代。
- 使用 `rg` 定位视频生成入口、Yunwu/Vidu generator、async-poll、preset model 和 capabilities catalog。
- 在 `YunwuVideoGenerator` 中仅对 `kling-video-o1`、`kling-v3-omni` 增加 `/videos/omni-video` 分支，保留其他 Yunwu Vidu 模型原路径。
- 新增 `YUNWUOMNI:VIDEO` externalId 格式，支持 `ep_` token 保存自定义 baseUrl，并在 async-poll 中查询 `/videos/omni-video/{taskId}`。
- 新增 Yunwu preset 模型与 capabilities 声明，补充 focused unit tests。

## Task: Panel Video Outbound Request Logging

Date: 2026-05-07 17:34:00 +0800
Executor: Codex

- 工具降级：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index、exa；使用 `rg`、`sed`、本地测试和结构化记录替代。
- 定位成片阶段视频任务入口为 `src/lib/workers/video.worker.ts` 调用 `resolveVideoSourceFromGeneration`，最终进入统一 `generateVideo`。
- 在 `src/lib/workers/utils.ts` 为通用视频生成调用增加 audit 日志，并追加写入 `/tmp/wao-panel-video-outbound-requests.ndjson`。
- 日志与临时文件中的图片 data URL / base64-like 字符串仅保留长度占位，实际传给 `generateVideo` 的参数保持原值。
- 调整 `src/lib/generators/vidu.ts` 的完整请求体日志，避免 `images` 中的 base64 原文刷满日志。

## Task: Coarse Group Video History

Date: 2026-05-09
Executor: Codex

- 工具降级：当前会话没有可调用的 `sequential-thinking`、`shrimp-task-manager`、`code-index` MCP 工具入口，因此使用 `rg`、`sed` 和本地测试替代上下文收集与任务拆分。
- 复用 `NovelPromotionStoryboard.coarseGroupsJson` 作为粗镜头级状态源，在同一 group 内增加 `videoUrl`、`videoHistory`、`videoModel`、`videoGenerationMode`，避免新增表或并行状态。
- 生成完成时记录粗镜头视频历史；项目数据签名/媒体附加处理视频历史；成片面板展示历史视频并支持选择/删除；新增 `storyboard-group/select-video` API；补充中英文文案和单元测试。
