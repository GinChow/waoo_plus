import { describe, expect, it } from 'vitest'
import {
  addCharacterPromptSuffix,
  addLocationPromptSuffix,
  addPropPromptSuffix,
  CHARACTER_PROMPT_SUFFIX,
  LOCATION_PROMPT_SUFFIX,
  LOCATION_IMAGE_BANANA_RATIO,
  LOCATION_IMAGE_RATIO,
  PROP_PROMPT_SUFFIX,
  removeCharacterPromptSuffix,
  removeLocationPromptSuffix,
  removePropPromptSuffix,
} from '@/lib/constants'

function countOccurrences(input: string, target: string) {
  if (!target) return 0
  return input.split(target).length - 1
}

describe('character prompt suffix regression', () => {
  it('appends suffix when generating prompt', () => {
    const basePrompt = 'A brave knight in silver armor'
    const generated = addCharacterPromptSuffix(basePrompt)

    expect(generated).toContain(CHARACTER_PROMPT_SUFFIX)
    expect(countOccurrences(generated, CHARACTER_PROMPT_SUFFIX)).toBe(1)
  })

  it('removes suffix text from prompt', () => {
    const basePrompt = 'A calm detective with short black hair'
    const withSuffix = addCharacterPromptSuffix(basePrompt)
    const removed = removeCharacterPromptSuffix(withSuffix)

    expect(removed).not.toContain(CHARACTER_PROMPT_SUFFIX)
    expect(removed).toContain(basePrompt)
  })

  it('uses suffix as full prompt when base prompt is empty', () => {
    expect(addCharacterPromptSuffix('')).toBe(CHARACTER_PROMPT_SUFFIX)
    expect(removeCharacterPromptSuffix('')).toBe('')
  })

  it('appends the prop suffix exactly once', () => {
    const basePrompt = '银质餐具套装，包含刀叉与汤匙，金属光泽冷白'
    const generated = addPropPromptSuffix(basePrompt)

    expect(generated).toContain(PROP_PROMPT_SUFFIX)
    expect(countOccurrences(generated, PROP_PROMPT_SUFFIX)).toBe(1)
  })

  it('removes the prop suffix from prompts', () => {
    const basePrompt = '黑铁长棍，两端包裹金色金属箍'
    const withSuffix = addPropPromptSuffix(basePrompt)
    const removed = removePropPromptSuffix(withSuffix)

    expect(removed).not.toContain(PROP_PROMPT_SUFFIX)
    expect(removed).toContain(basePrompt)
  })

  it('appends the location three-view suffix exactly once', () => {
    const basePrompt = '雨夜街道，湿润石板路，两侧旧式店铺，霓虹反光'
    const generated = addLocationPromptSuffix(basePrompt)

    expect(generated).toContain(LOCATION_PROMPT_SUFFIX)
    expect(generated).toContain('三视图横向排列')
    expect(countOccurrences(generated, LOCATION_PROMPT_SUFFIX)).toBe(1)
  })

  it('removes the location suffix from prompts', () => {
    const basePrompt = '古代书房，木质书架，窗边摆放长案'
    const withSuffix = addLocationPromptSuffix(basePrompt)
    const removed = removeLocationPromptSuffix(withSuffix)

    expect(removed).not.toContain(LOCATION_PROMPT_SUFFIX)
    expect(removed).toContain(basePrompt)
  })

  it('keeps location asset ratios compatible with Yunwu Gemini Image', () => {
    const yunwuGeminiRatios = new Set(['1:1', '3:4', '4:3', '16:9', '9:16'])

    expect(yunwuGeminiRatios.has(LOCATION_IMAGE_RATIO)).toBe(true)
    expect(yunwuGeminiRatios.has(LOCATION_IMAGE_BANANA_RATIO)).toBe(true)
  })
})
