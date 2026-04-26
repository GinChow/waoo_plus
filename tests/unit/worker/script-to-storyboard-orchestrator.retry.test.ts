import { describe, expect, it, vi } from 'vitest'
import { runScriptToStoryboardOrchestrator } from '@/lib/novel-promotion/script-to-storyboard/orchestrator'

describe('script-to-storyboard orchestrator retry', () => {
  it('retries retryable step failures up to 3 attempts', async () => {
    const attemptsByAction = new Map<string, number>()
    const phase1Metas: Array<{ stepId: string; stepAttempt?: number }> = []
    const runStep = vi.fn(async (meta, _prompt, action: string) => {
      attemptsByAction.set(action, (attemptsByAction.get(action) || 0) + 1)

      if (action === 'storyboard_phase1_plan') {
        phase1Metas.push({ stepId: meta.stepId, stepAttempt: meta.stepAttempt })
        const attempt = attemptsByAction.get(action) || 0
        if (attempt < 3) {
          throw new TypeError('terminated')
        }
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_cinematography') {
        return { text: JSON.stringify([{ panel_number: 1, composition: '居中' }]), reasoning: '' }
      }
      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }
      return {
        text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
        reasoning: '',
      }
    })

    const result = await runScriptToStoryboardOrchestrator({
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(1)
    expect(runStep).toHaveBeenCalled()
    expect(attemptsByAction.get('storyboard_phase1_plan')).toBe(3)
    expect(phase1Metas).toEqual([
      { stepId: 'clip_clip-1_phase1', stepAttempt: undefined },
      { stepId: 'clip_clip-1_phase1', stepAttempt: 2 },
      { stepId: 'clip_clip-1_phase1', stepAttempt: 3 },
    ])
  })

  it('does not retry non-retryable step failure', async () => {
    let callCount = 0
    const runStep = vi.fn(async () => {
      callCount += 1
      throw new Error('SENSITIVE_CONTENT: blocked')
    })

    await expect(
      runScriptToStoryboardOrchestrator({
        clips: [
          {
            id: 'clip-1',
            content: '文本',
            characters: JSON.stringify([{ name: '角色A' }]),
            location: '场景A',
            screenplay: null,
          },
        ],
        novelPromotionData: {
          characters: [{ name: '角色A', appearances: [] }],
          locations: [{ name: '场景A', images: [] }],
        },
        promptTemplates: {
          phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
          phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
          phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
          phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
        },
        runStep,
      }),
    ).rejects.toThrow('SENSITIVE_CONTENT')

    expect(callCount).toBe(1)
  })

  it('does not retry terminated step error', async () => {
    let callCount = 0
    const runStep = vi.fn(async () => {
      callCount += 1
      throw new Error('Run terminated during script_to_storyboard_step:clip-1: lease lost')
    })

    await expect(
      runScriptToStoryboardOrchestrator({
        clips: [
          {
            id: 'clip-1',
            content: '文本',
            characters: JSON.stringify([{ name: '角色A' }]),
            location: '场景A',
            screenplay: null,
          },
        ],
        novelPromotionData: {
          characters: [{ name: '角色A', appearances: [] }],
          locations: [{ name: '场景A', images: [] }],
        },
        promptTemplates: {
          phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
          phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
          phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
          phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
        },
        runStep,
      }),
    ).rejects.toThrow('lease lost')

    expect(callCount).toBe(1)
  })

  it('respects maxStepAttempts=1 for retryable errors', async () => {
    let callCount = 0
    const runStep = vi.fn(async () => {
      callCount += 1
      throw new TypeError('fetch failed')
    })

    await expect(
      runScriptToStoryboardOrchestrator({
        maxStepAttempts: 1,
        clips: [
          {
            id: 'clip-1',
            content: '文本',
            characters: JSON.stringify([{ name: '角色A' }]),
            location: '场景A',
            screenplay: null,
          },
        ],
        novelPromotionData: {
          characters: [{ name: '角色A', appearances: [] }],
          locations: [{ name: '场景A', images: [] }],
        },
        promptTemplates: {
          phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
          phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
          phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
          phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
        },
        runStep,
      }),
    ).rejects.toThrow('fetch failed')

    expect(callCount).toBe(1)
  })

  it('does not retry Ark invalid parameter error even when message contains json', async () => {
    let callCount = 0
    const runStep = vi.fn(async () => {
      callCount += 1
      throw new Error(
        'Ark Responses 调用失败: 400 - {"error":{"code":"InvalidParameter","message":"json: unknown field \\"reasoning_effort\\""}}',
      )
    })

    await expect(
      runScriptToStoryboardOrchestrator({
        clips: [
          {
            id: 'clip-1',
            content: '文本',
            characters: JSON.stringify([{ name: '角色A' }]),
            location: '场景A',
            screenplay: null,
          },
        ],
        novelPromotionData: {
          characters: [{ name: '角色A', appearances: [] }],
          locations: [{ name: '场景A', images: [] }],
        },
        promptTemplates: {
          phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
          phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
          phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
          phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
        },
        runStep,
      }),
    ).rejects.toThrow('unknown field')

    expect(callCount).toBe(1)
  })

  it('enforces topology: phase3 runs after both phase2 steps complete', async () => {
    const actionOrder: string[] = []
    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      actionOrder.push(action)
      if (action === 'storyboard_phase1_plan') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_cinematography') {
        return { text: JSON.stringify([{ panel_number: 1, composition: '居中' }]), reasoning: '' }
      }
      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }
      if (action === 'storyboard_phase3_detail') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      throw new Error(`unexpected action: ${action}`)
    })

    const result = await runScriptToStoryboardOrchestrator({
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(1)
    const phase3Index = actionOrder.indexOf('storyboard_phase3_detail')
    const phase2CineIndex = actionOrder.indexOf('storyboard_phase2_cinematography')
    const phase2ActingIndex = actionOrder.indexOf('storyboard_phase2_acting')
    expect(phase3Index).toBeGreaterThan(phase2CineIndex)
    expect(phase3Index).toBeGreaterThan(phase2ActingIndex)
  })

  it('limits clip fan-out by configured concurrency', async () => {
    let activePhase1 = 0
    let maxActivePhase1 = 0

    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      if (action === 'storyboard_phase1_plan') {
        activePhase1 += 1
        maxActivePhase1 = Math.max(maxActivePhase1, activePhase1)
        await new Promise((resolve) => setTimeout(resolve, 5))
        activePhase1 -= 1
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_cinematography') {
        return {
          text: JSON.stringify([{
            panel_number: 1,
            composition: '居中',
            lighting: '顶光',
            color_palette: '冷色',
            atmosphere: '紧张',
            technical_notes: 'note',
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }
      if (action === 'storyboard_phase3_detail') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }
      throw new Error(`unexpected action: ${action}`)
    })

    const result = await runScriptToStoryboardOrchestrator({
      concurrency: 1,
      clips: [
        {
          id: 'clip-1',
          content: '文本1',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
        {
          id: 'clip-2',
          content: '文本2',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
        {
          id: 'clip-3',
          content: '文本3',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(3)
    expect(maxActivePhase1).toBe(1)
  })

  it('runs coarse group phases with bounded concurrency while preserving group order', async () => {
    let activeSplit = 0
    let activeCinematography = 0
    let activeActing = 0
    let activeDetail = 0
    let maxActiveSplit = 0
    let maxActiveCinematography = 0
    let maxActiveActing = 0
    let maxActiveDetail = 0

    const waitBriefly = () => new Promise((resolve) => setTimeout(resolve, 10))
    const readGroupNumber = (prompt: string) => {
      const match = prompt.match(/"(?:group_number|parent_group_number)":\s*(\d+)/)
      return match ? Number(match[1]) : 1
    }

    const runStep = vi.fn(async (_meta, prompt, action: string) => {
      const promptText = String(prompt)
      if (action === 'storyboard_phase1_plan') {
        return {
          text: JSON.stringify([
            { group_number: 1, description_group: '粗组1', source_text_group: '原文1' },
            { group_number: 2, description_group: '粗组2', source_text_group: '原文2' },
            { group_number: 3, description_group: '粗组3', source_text_group: '原文3' },
          ]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_cinematography' && promptText.startsWith('SPLIT::')) {
        activeSplit += 1
        maxActiveSplit = Math.max(maxActiveSplit, activeSplit)
        await waitBriefly()
        activeSplit -= 1
        const groupNumber = readGroupNumber(promptText)
        return {
          text: JSON.stringify([{
            panel_number: 1,
            description: `细镜头-${groupNumber}`,
            source_text: `细原文-${groupNumber}`,
            location: '场景A',
            scene_type: 'dialogue',
            characters: [{ name: '角色A' }],
          }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_cinematography' && promptText.startsWith('CINE::')) {
        activeCinematography += 1
        maxActiveCinematography = Math.max(maxActiveCinematography, activeCinematography)
        await waitBriefly()
        activeCinematography -= 1
        const groupNumber = readGroupNumber(promptText)
        return {
          text: JSON.stringify([{
            panel_number: 1,
            lighting: `光线-${groupNumber}`,
            camera_angle: `机位-${groupNumber}`,
            depth_of_field: `景深-${groupNumber}`,
            focus_priority: `主体-${groupNumber}`,
            composition_note: `构图-${groupNumber}`,
            viewpoint_constraint: `视角-${groupNumber}`,
            characters: [{ name: '角色A', screen_position: '左侧' }],
          }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_acting') {
        activeActing += 1
        maxActiveActing = Math.max(maxActiveActing, activeActing)
        await waitBriefly()
        activeActing -= 1
        const groupNumber = readGroupNumber(promptText)
        return {
          text: JSON.stringify([{ panel_number: 1, characters: [{ name: '角色A', acting: `表演-${groupNumber}` }] }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase3_detail') {
        activeDetail += 1
        maxActiveDetail = Math.max(maxActiveDetail, activeDetail)
        await waitBriefly()
        activeDetail -= 1
        const groupNumber = readGroupNumber(promptText)
        return {
          text: JSON.stringify([{
            shot_type: `景别-${groupNumber}`,
            camera_move: `运镜-${groupNumber}`,
            video_prompt: `视频-${groupNumber}`,
            first_frame_image_prompt: `首帧-${groupNumber}`,
            duration: 2 + groupNumber / 10,
          }]),
          reasoning: '',
        }
      }

      throw new Error(`unexpected action: ${action}`)
    })

    const result = await runScriptToStoryboardOrchestrator({
      concurrency: 2,
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content}',
        phase2GroupSplitTemplate: 'SPLIT::{coarse_storyboard_group}',
        phase2CinematographyTemplate: 'CINE::{panels_json}',
        phase2ActingTemplate: 'ACT::{panels_json}',
        phase3DetailTemplate: 'DETAIL::{panels_json}',
      },
      runStep,
    })

    expect(maxActiveSplit).toBe(2)
    expect(maxActiveCinematography).toBe(2)
    expect(maxActiveActing).toBe(2)
    expect(maxActiveDetail).toBe(2)
    expect(result.clipPanels[0]?.finalPanels.map((panel) => panel.video_prompt)).toEqual([
      '视频-1',
      '视频-2',
      '视频-3',
    ])
  })

  it('pipelines clips so one clip can enter phase2 before another clip finishes phase1', async () => {
    let releaseClip1Phase1: (() => void) | null = null
    const clip1Phase1Gate = new Promise<void>((resolve) => {
      releaseClip1Phase1 = resolve
    })
    let clip2Phase2Started = false
    let clip1Phase1ResolvedAfterClip2Phase2 = false

    const runStep = vi.fn(async (meta, _prompt, action: string) => {
      const stepId = String(meta.stepId)

      if (action === 'storyboard_phase1_plan' && stepId === 'clip_clip-1_phase1') {
        await clip1Phase1Gate
        clip1Phase1ResolvedAfterClip2Phase2 = clip2Phase2Started
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头1', location: '场景A', source_text: '原文1', characters: [] }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase1_plan' && stepId === 'clip_clip-2_phase1') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头2', location: '场景A', source_text: '原文2', characters: [] }]),
          reasoning: '',
        }
      }

      if (
        action === 'storyboard_phase2_cinematography'
        && (
          stepId === 'clip_clip-2_phase2_cinematography'
          || stepId === 'clip_clip-2_phase3_cinematography'
          || stepId === 'clip_clip-2_phase2_acting'
        )
      ) {
        clip2Phase2Started = true
        releaseClip1Phase1?.()
        return {
          text: JSON.stringify([{ panel_number: 1, composition: '居中', lighting: '顶光', color_palette: '冷色', atmosphere: '紧张', technical_notes: 'note' }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }

      if (action === 'storyboard_phase2_cinematography') {
        return {
          text: JSON.stringify([{ panel_number: 1, composition: '居中', lighting: '顶光', color_palette: '冷色', atmosphere: '紧张', technical_notes: 'note' }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase3_detail') {
        return {
          text: JSON.stringify([{ panel_number: 1, description: '细化镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }

      throw new Error(`unexpected action: ${action}:${stepId}`)
    })

    const result = await runScriptToStoryboardOrchestrator({
      concurrency: 2,
      clips: [
        {
          id: 'clip-1',
          content: '文本1',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
        {
          id: 'clip-2',
          content: '文本2',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(2)
    expect(clip2Phase2Started).toBe(true)
    expect(clip1Phase1ResolvedAfterClip2Phase2).toBe(true)
  })

  it('builds phase3 input without duplicating cinematography fields at top level', async () => {
    let capturedPhase3Prompt = ''
    const runStep = vi.fn(async (_meta, prompt, action: string) => {
      if (action === 'storyboard_phase1_plan') {
        return {
          text: JSON.stringify([{
            panel_number: 2,
            shot_purpose: 'action_progress',
            scene_type: 'action',
            description: '樵夫失足坠落',
            source_text: '樵夫脚下一空跌落',
            location: '山林竹箐边_清晨浓雾',
            characters: [{ name: '樵夫', appearance: '初始形象' }],
            duration_base: 2,
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_cinematography') {
        return {
          text: JSON.stringify([{
            panel_number: 2,
            lighting: {
              quality: '柔和漫射光',
              direction: '前侧散射光',
            },
            color_tone: '冷色调',
            camera_angle: '轻微高机位',
            depth_of_field: '中等景深',
            focus_priority: '樵夫失足下坠',
            composition_note: '强调坠落方向',
            viewpoint_constraint: '客观观察',
            characters: [{
              name: '樵夫',
              facing: '朝前下方',
              posture: '身体失衡下坠',
              screen_position: '画面中部',
            }],
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_acting') {
        return {
          text: JSON.stringify([{
            panel_number: 2,
            characters: [{
              name: '樵夫',
              acting: '瞳孔收紧，四肢乱抓',
            }],
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase3_detail') {
        capturedPhase3Prompt = prompt
        return {
          text: JSON.stringify([{
            panel_number: 2,
            shot_purpose: 'action_progress',
            scene_type: 'action',
            description: '樵夫失足坠落',
            source_text: '樵夫脚下一空跌落',
            location: '山林竹箐边_清晨浓雾',
            characters: [{ name: '樵夫', appearance: '初始形象' }],
            duration_base: 2,
          }]),
          reasoning: '',
        }
      }
      throw new Error(`unexpected action: ${action}`)
    })

    await runScriptToStoryboardOrchestrator({
      clips: [
        {
          id: 'clip-1',
          content: '走到竹箐边，脚下一空，整个人摔了下去。',
          characters: JSON.stringify([{ name: '樵夫' }]),
          location: '山林竹箐边_清晨浓雾',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '樵夫', appearances: [] }],
        locations: [{ name: '山林竹箐边_清晨浓雾', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content}',
        phase2CinematographyTemplate: '{panels_json}',
        phase2ActingTemplate: '{panels_json}',
        phase3DetailTemplate: '{panels_json}',
      },
      runStep,
    })

    expect(capturedPhase3Prompt).toBeTruthy()
    const phase3Panels = JSON.parse(capturedPhase3Prompt) as Array<Record<string, unknown>>
    expect(Array.isArray(phase3Panels)).toBe(true)
    expect(phase3Panels).toHaveLength(1)
    const panel = phase3Panels[0]
    expect(panel.photography_rules).toBeUndefined()
    expect(panel.acting_notes).toBeTruthy()
    expect(panel.lighting).toBeTruthy()
    expect(panel.color_tone).toBeTruthy()
    expect(panel.camera_angle).toBeTruthy()
    expect(panel.depth_of_field).toBeTruthy()
    expect(panel.focus_priority).toBeTruthy()
    expect(panel.composition_note).toBeTruthy()
    expect(panel.viewpoint_constraint).toBeTruthy()
  })

  it('merges phase3 minimal fields into phase1 and phase2 panels', async () => {
    const runStep = vi.fn(async (_meta, _prompt, action: string) => {
      if (action === 'storyboard_phase1_plan') {
        return {
          text: JSON.stringify([{
            panel_number: 1,
            description: 'phase1描述',
            source_text: 'phase1原文',
            location: '场景A',
            scene_type: 'dialogue',
            characters: [{ name: '角色A', slot: '左侧' }],
            duration_base: 3,
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_cinematography') {
        return {
          text: JSON.stringify([{
            panel_number: 1,
            composition: '居中构图',
            lighting: '顶光',
            characters: [{ name: '角色A', screen_position: '左侧' }],
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase2_acting') {
        return {
          text: JSON.stringify([{
            panel_number: 1,
            characters: [{ name: '角色A', acting: '平静说话' }],
          }]),
          reasoning: '',
        }
      }
      if (action === 'storyboard_phase3_detail') {
        return {
          text: JSON.stringify([{
            shot_type: '平视中景',
            camera_move: '固定',
            video_prompt: '角色A在场景A平静交谈',
            first_frame_image_prompt: '室内，角色A位于画面左侧，平视中景',
            duration: 2.5,
          }]),
          reasoning: '',
        }
      }
      throw new Error(`unexpected action: ${action}`)
    })

    const result = await runScriptToStoryboardOrchestrator({
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content}',
        phase2CinematographyTemplate: '{panels_json}',
        phase2ActingTemplate: '{panels_json}',
        phase3DetailTemplate: '{panels_json}',
      },
      runStep,
    })

    const panel = result.clipPanels[0]?.finalPanels[0]
    expect(panel).toBeTruthy()
    expect(panel.description).toBe('phase1描述')
    expect(panel.source_text).toBe('phase1原文')
    expect(panel.location).toBe('场景A')
    expect(panel.shot_type).toBe('平视中景')
    expect(panel.camera_move).toBe('固定')
    expect(panel.video_prompt).toBe('角色A在场景A平静交谈')
    expect(panel.first_frame_image_prompt).toBe('室内，角色A位于画面左侧，平视中景')
    expect(panel.duration).toBe(2.5)
    expect(panel.photographyPlan).toBeTruthy()
    expect(panel.acting_notes).toEqual([{ name: '角色A', acting: '平静说话' }])
    expect(panel.actingNotes).toEqual([{ name: '角色A', acting: '平静说话' }])
  })

  it('fuses phase3 guidance by fine groups without cross-group mixing', async () => {
    const artifacts: Array<{
      stepKey: string
      artifactType: string
      payload: Record<string, unknown>
    }> = []

    const runStep = vi.fn(async (_meta, prompt, action: string) => {
      if (action === 'storyboard_phase1_plan') {
        return {
          text: JSON.stringify([
            {
              group_number: 1,
              description_group: '粗组1',
              source_text_group: '原文组1',
            },
            {
              group_number: 2,
              description_group: '粗组2',
              source_text_group: '原文组2',
            },
          ]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_cinematography' && prompt.startsWith('SPLIT::')) {
        if (prompt.includes('"group_number": 1')) {
          return {
            text: JSON.stringify([
              {
                panel_number: 1,
                description: '细镜头-组1',
                source_text: '细原文-组1',
                location: '场景A',
                scene_type: 'dialogue',
                characters: [{ name: '角色A' }],
              },
            ]),
            reasoning: '',
          }
        }
        return {
          text: JSON.stringify([
            {
              panel_number: 1,
              description: '细镜头-组2',
              source_text: '细原文-组2',
              location: '场景A',
              scene_type: 'dialogue',
              characters: [{ name: '角色A' }],
            },
          ]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_cinematography' && prompt.startsWith('CINE::')) {
        if (prompt.includes('"parent_group_number": 1')) {
          return {
            text: JSON.stringify([{
              panel_number: 1,
              lighting: '组1光',
              camera_angle: '组1机位',
              depth_of_field: '组1景深',
              focus_priority: '组1主体',
              composition_note: '组1构图',
              viewpoint_constraint: '组1视角',
              characters: [{ name: '角色A', screen_position: '左侧' }],
            }]),
            reasoning: '',
          }
        }
        return {
          text: JSON.stringify([{
            panel_number: 1,
            lighting: '组2光',
            camera_angle: '组2机位',
            depth_of_field: '组2景深',
            focus_priority: '组2主体',
            composition_note: '组2构图',
            viewpoint_constraint: '组2视角',
            characters: [{ name: '角色A', screen_position: '右侧' }],
          }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_acting' && prompt.startsWith('ACT::')) {
        if (prompt.includes('"parent_group_number": 1')) {
          return {
            text: JSON.stringify([{
              panel_number: 1,
              characters: [{ name: '角色A', acting: '组1演技' }],
            }]),
            reasoning: '',
          }
        }
        return {
          text: JSON.stringify([{
            panel_number: 1,
            characters: [{ name: '角色A', acting: '组2演技' }],
          }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase3_detail' && prompt.startsWith('DETAIL::')) {
        if (prompt.includes('"composition_note": "组1构图"')) {
          return {
            text: JSON.stringify([{
              shot_type: '组1景别',
              camera_move: '组1运镜',
              video_prompt: '组1视频',
              first_frame_image_prompt: '组1首帧',
              duration: 2.1,
            }]),
            reasoning: '',
          }
        }
        return {
          text: JSON.stringify([{
            shot_type: '组2景别',
            camera_move: '组2运镜',
            video_prompt: '组2视频',
            first_frame_image_prompt: '组2首帧',
            duration: 2.2,
          }]),
          reasoning: '',
        }
      }

      throw new Error(`unexpected action: ${action}`)
    })

    const result = await runScriptToStoryboardOrchestrator({
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content}',
        phase2GroupSplitTemplate: 'SPLIT::{coarse_storyboard_group}',
        phase2CinematographyTemplate: 'CINE::{panels_json}',
        phase2ActingTemplate: 'ACT::{panels_json}',
        phase3DetailTemplate: 'DETAIL::{panels_json}',
      },
      runStep,
      onArtifact: async (artifact) => {
        artifacts.push({
          stepKey: artifact.stepKey,
          artifactType: artifact.artifactType,
          payload: artifact.payload,
        })
      },
    })

    const actingArtifact = artifacts.find((item) => item.artifactType === 'storyboard.clip.phase2.acting')
    expect(actingArtifact).toBeTruthy()
    const fineGroupsWithGuidance = (actingArtifact?.payload.fine_groups_with_guidance || []) as Array<Record<string, unknown>>
    expect(fineGroupsWithGuidance).toHaveLength(2)

    const group1Panels = (fineGroupsWithGuidance[0]?.panels || []) as Array<Record<string, unknown>>
    const group2Panels = (fineGroupsWithGuidance[1]?.panels || []) as Array<Record<string, unknown>>
    expect(group1Panels[0]?.composition_note).toBe('组1构图')
    expect(group2Panels[0]?.composition_note).toBe('组2构图')
    expect((group1Panels[0]?.acting_notes as { characters?: Array<{ acting?: string }> })?.characters?.[0]?.acting).toBe('组1演技')
    expect((group2Panels[0]?.acting_notes as { characters?: Array<{ acting?: string }> })?.characters?.[0]?.acting).toBe('组2演技')

    const finalPanels = result.clipPanels[0]?.finalPanels || []
    expect(finalPanels).toHaveLength(2)
    expect(finalPanels[0]?.video_prompt).toBe('组1视频')
    expect(finalPanels[1]?.video_prompt).toBe('组2视频')
    expect(finalPanels[0]?.photographyPlan?.composition_note).toBe('组1构图')
    expect(finalPanels[1]?.photographyPlan?.composition_note).toBe('组2构图')
    expect((finalPanels[0]?.acting_notes as Array<{ acting?: string }>)?.[0]?.acting).toBe('组1演技')
    expect((finalPanels[1]?.acting_notes as Array<{ acting?: string }>)?.[0]?.acting).toBe('组2演技')
    expect((finalPanels[0]?.actingNotes as Array<{ acting?: string }>)?.[0]?.acting).toBe('组1演技')
    expect((finalPanels[1]?.actingNotes as Array<{ acting?: string }>)?.[0]?.acting).toBe('组2演技')
  })
})
