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

      if (action === 'storyboard_phase2_cinematography' && stepId === 'clip_clip-2_phase2_cinematography') {
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
    expect(panel.photography_rules).toBeTruthy()
    expect(panel.acting_notes).toBeTruthy()
    expect(panel.lighting).toBeUndefined()
    expect(panel.color_tone).toBeUndefined()
    expect(panel.camera_angle).toBeUndefined()
    expect(panel.depth_of_field).toBeUndefined()
    expect(panel.focus_priority).toBeUndefined()
    expect(panel.composition_note).toBeUndefined()
    expect(panel.viewpoint_constraint).toBeUndefined()
  })
})
