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

## Task: Universal Editing Project Export

Date: 2026-06-09
Executor: Codex

- 工具降级：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index；使用 rg、仓库读取和 update_plan 替代。
- 定位成片工具栏、视频下载 Hook、video-urls 接口、面板时长和项目画幅字段。
- 采用浏览器端下载素材与 JSZip 打包，并新增纯函数生成 FCPXML、Premiere XML 和 manifest。

## Task: Editing Project Export Progress

Date: 2026-06-10
Executor: Codex

- 检查现有剪辑工程导出 Hook 和成片工具栏，确认长耗时阶段为逐片下载和浏览器端 JSZip 打包。
- 新增准备、下载、打包三阶段进度状态；下载显示当前片段数，打包使用 JSZip 实时百分比。
- 工具栏下方新增可访问进度条，并限制打包阶段仅在整数百分比变化时刷新。

## Task: Vidu Q3 Pro Panel Generation 404

Date: 2026-06-10
Executor: Codex

- 工具降级：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index、exa；使用 rg、仓库读取、内置计划、本地数据库查询和官方 Vidu 文档替代。
- 定位到 Yunwu provider 的 viduq3-pro/viduq3-turbo 保存了默认 OpenAI `/videos` multipart 模板，实际自定义端点为 `/ent/v2/img2video`。
- 通过无鉴权和空参数探测确认 `https://yunwu.ai/v1/videos` 与 `/v1/ent/v2/img2video` 为 404，根路径 `/ent/v2/img2video` 可命中 API。
- 将两个 Vidu Q3 模型模板更新为 Vidu JSON 创建协议、`task_id/state` 响应字段和 `/ent/v2/tasks/{id}/creations` 轮询协议。
- 修改错误归一化，优先识别正文中的上游状态码，避免外层 429 包装上游 404 时安排无效重试。

## Task: Per-Panel Video Download

Date: 2026-06-10
Executor: Codex

- 工具降级：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index；使用 `rg`、仓库读取、`update_plan` 和本地测试替代。
- 定位 `VideoPanelCardHeader`、卡片 runtime、`useDownloadRemoteBlob` 和现有 `video-proxy` 下载链路。
- 新增卡片级下载 Hook，下载当前可见版本的视频；口型同步开关切换后会下载对应预览版本。
- 文件名采用三位分镜编号和分镜简介，清理非法字符、限制简介长度，并保留 MP4/MOV/WebM/M4V 扩展名。
- 在视频卡片右下角增加下载按钮及下载中状态，并补充文件名和组件渲染测试。
- 下载失败回归修复：`video-proxy` 原先把 `/m/publicId` 媒体路由直接当作 storageKey 签名，导致对象地址 404；现改为先通过 `resolveStorageKeyFromMediaValue` 还原真实 key，再调用 `getSignedObjectUrl` 流式代理。

## Task: Unified Storyboard Production

Date: 2026-06-10
Executor: Codex

- 工具降级：当前会话未暴露 sequential-thinking、shrimp-task-manager、code-index；使用 `rg`、仓库读取、`update_plan` 和本地验证替代。
- 将主导航中的分镜与成片合并为“分镜制作”，并将旧 `videos`、`editor` stage 参数兼容映射到 `storyboard`。
- 新增 `StoryboardVideoRuntimeProvider`，复用现有视频投影、模型能力、首尾帧、口型同步、下载及剪辑工程导出逻辑。
- 分镜列表改为统一外层卡片：左侧图片制作，右侧视频制作；窄屏上下排列，宽屏左右排列。
- 视频生成和本地上传时记录 `sourceImageUrls`；当前图片发生变化时保留旧视频并展示“可能已过期”。
- 为满足 Next.js route export 约束，将下载代理辅助函数移动到 `src/lib/video-proxy.ts`，路由和测试统一引用该模块。
- 首次生产构建发现上述 route export 既有阻塞并已修复；再次构建因用户正在运行的 Next.js 开发服务占用同一 `.next` 目录而停止，仅终止本次构建进程，未中断开发服务。

## Task: Video Frame Capture Targets

Date: 2026-06-11
Executor: Codex

- 工具降级：当前会话未暴露 `sequential-thinking`、`shrimp-task-manager`、`code-index`；使用 `rg`、仓库读取、`update_plan` 和本地验证替代。
- 检查工作区发现已有未提交的抽帧弹窗和当前分镜上传接线，后续修改基于现有内容增量完成，不回退其他改动。
- 确认 `StoryboardVideoRuntime.allPanels` 提供跨 storyboard 的全局顺序，相邻分镜应从该数组定位；图片写回复用 `handleUploadPanelImage` 和 `panel/update-image`。
- 充分性检查：接口契约、技术方案、主要风险与验证方式均已明确。
- 实施：抽帧弹窗新增本地 JPEG 下载、上一/当前/下一分镜目标、已有图片覆盖确认和 seek 完成保护；相邻目标从全局 `allPanels` 顺序计算。
- 上传链路：继续复用 `panel/update-image`，并为抽帧调用传播 HTTP/响应错误，失败时保留弹窗。
- 验证：聚焦 3 个测试文件共 9 项通过；TypeScript、focused ESLint、`git diff --check` 通过。
- 全量单测：875/879 通过；4 个失败位于既有的 worker、提示词、全局分析和 Yunwu 轮询测试，与本功能无关。
