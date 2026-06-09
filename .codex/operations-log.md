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

## Task: Video Panel Preview Playback Stuck

Date: 2026-06-08
Executor: Codex

- 工具降级：当前会话没有可调用的 `sequential-thinking`、`shrimp-task-manager`、`code-index`、`exa` MCP 工具入口，因此使用 `rg`、`sed`、`git diff`、本地测试和类型检查替代。
- 使用 `rg` 定位成片面板播放器状态，确认主路径为 `usePanelPlayer` 控制 `isPlaying`，`VideoPanelCardHeader` 根据该状态在封面和原生 `<video>` 之间切换。
- 根因判断：播放失败、媒体 error/abort 或 ref 不存在时没有复位 `isPlaying`，导致原生视频元素保持挂载并持续显示浏览器加载转圈。
- 实施：在 `usePanelPlayer` 中增加播放失败复位逻辑、统一退出处理和媒体错误处理；在 `VideoPanelCardHeader` 绑定 `onEnded`、`onError`、`onAbort`。
- 测试：新增 `tests/unit/novel-promotion/use-panel-player.test.ts`，并补齐相邻 `video-panel-card-body` 测试的 query hook mock。

## Task: Local Video Upload For Video Panel

Date: 2026-06-09
Executor: Codex

- 工具降级：当前会话没有可调用的 `sequential-thinking`、`shrimp-task-manager`、`code-index`、`exa` MCP 工具入口，因此使用 `rg`、`sed`、`git diff`、本地测试和类型检查替代。
- 使用 `rg` 定位成片面板、单分镜视频历史、panel 图片上传 API 和 React Query mutation，确认可复用 `videoUrl`/`videoHistory` 字段，无需数据库迁移。
- 新增 `panel/upload-video` API：接收 FormData 本地视频，上传到 storage，设置为当前视频，并追加 source 为 `upload` 的 panel 视频历史。
- 新增 `useUploadProjectPanelVideo` mutation：上传成功后 patch episode cache 的 `videoUrl`、`videoStorageKey` 和 `videoHistory`，并刷新项目资产、项目数据与剧集数据。
- 在普通单分镜 `VideoPanelCardBody` 生成按钮旁增加上传本地视频入口；首尾帧链接卡片不显示上传入口，避免普通视频写入后因展示条件不可见。
- 补充中英文文案、route catalog、组件单测和上传 API 单测。
