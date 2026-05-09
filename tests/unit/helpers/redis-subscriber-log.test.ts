import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const redisClients = vi.hoisted(() => [] as Array<{ emit: (event: string, ...args: unknown[]) => void }>)
const RedisMock = vi.hoisted(() =>
  class RedisMock {
    private readonly listeners = new Map<string, Listener[]>()

    constructor() {
      redisClients.push(this)
    }

    on(event: string, listener: Listener) {
      const listeners = this.listeners.get(event) || []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    emit(event: string, ...args: unknown[]) {
      const listeners = this.listeners.get(event) || []
      for (const listener of listeners) {
        listener(...args)
      }
      return listeners.length > 0
    }
  }
)

const logDebugMock = vi.hoisted(() => vi.fn())
const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('ioredis', () => ({
  default: RedisMock,
}))

vi.mock('@/lib/logging/core', () => ({
  logDebug: logDebugMock,
  logError: logErrorMock,
}))

describe('redis subscriber logging', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    redisClients.length = 0
  })

  it('does not log recoverable subscriber-mode errors from subscriber clients as errors', async () => {
    const { createSubscriber } = await import('@/lib/redis')
    const subscriber = createSubscriber()

    subscriber.emit('error', new Error('Connection in subscriber mode, only subscriber commands may be used'))

    expect(logErrorMock).not.toHaveBeenCalled()
  })

  it('still logs non-recoverable subscriber client errors', async () => {
    const { createSubscriber } = await import('@/lib/redis')
    const subscriber = createSubscriber()

    subscriber.emit('error', new Error('ECONNREFUSED'))

    expect(logErrorMock).toHaveBeenCalledWith('[Redis:sub] error:', 'ECONNREFUSED')
  })
})
