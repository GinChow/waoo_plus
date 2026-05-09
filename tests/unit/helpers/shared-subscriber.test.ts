import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class RedisMock extends EventEmitter {
  readonly subscribed: string[] = []
  readonly unsubscribed: string[] = []
  quit = vi.fn(async () => undefined)
  disconnect = vi.fn()

  async subscribe(...channels: string[]) {
    this.subscribed.push(...channels)
  }

  async unsubscribe(...channels: string[]) {
    this.unsubscribed.push(...channels)
  }
}

const clients = vi.hoisted(() => [] as RedisMock[])
const createSubscriberMock = vi.hoisted(() => vi.fn(() => {
  const client = new RedisMock()
  clients.push(client)
  return client
}))

vi.mock('@/lib/redis', () => ({
  createSubscriber: createSubscriberMock,
}))

vi.mock('@/lib/logging/core', () => ({
  logDebug: vi.fn(),
  logError: vi.fn(),
}))

describe('shared redis subscriber', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    clients.length = 0
  })

  it('recovers when current subscriber emits subscriber-mode redis error', async () => {
    const logging = await import('@/lib/logging/core')
    const { getSharedSubscriber } = await import('@/lib/sse/shared-subscriber')
    const sharedSubscriber = getSharedSubscriber()
    const unsubscribe = await sharedSubscriber.addChannelListener('project:1', vi.fn())
    expect(clients).toHaveLength(1)
    expect(clients[0].subscribed).toEqual(['project:1'])

    clients[0].emit('error', new Error('Connection in subscriber mode, only subscriber commands may be used'))
    await vi.waitFor(() => {
      expect(clients).toHaveLength(2)
      expect(clients[1].subscribed).toEqual(['project:1'])
    })
    expect(clients[0].quit).toHaveBeenCalledTimes(1)
    expect(logging.logError).not.toHaveBeenCalled()

    await unsubscribe()
    expect(clients[1].unsubscribed).toEqual(['project:1'])
  })
})
