import { logError as _ulogError } from '@/lib/logging/core'
import type Redis from 'ioredis'
import { createSubscriber } from '@/lib/redis'

type MessageHandler = (message: string) => void

class SharedSubscriber {
  private subscriber: Redis
  private readonly listeners = new Map<string, Map<number, MessageHandler>>()
  private listenerSeq = 1
  private recovering: Promise<void> | null = null

  constructor() {
    this.subscriber = createSubscriber()
    this.bindSubscriberEvents(this.subscriber)
  }

  private bindSubscriberEvents(client: Redis) {
    client.on('message', (channel, message) => {
      const channelListeners = this.listeners.get(channel)
      if (!channelListeners || channelListeners.size === 0) return

      for (const handler of channelListeners.values()) {
        try {
          handler(message)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          _ulogError(`[SSE:shared] listener error channel=${channel} error=${message}`)
        }
      }
    })

    client.on('error', (error) => {
      _ulogError(`[SSE:shared] redis error: ${error?.message || 'unknown'}`)
    })
  }

  private shouldRecover(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()
    return lower.includes('subscriber mode') || lower.includes('only subscriber commands may be used')
  }

  private async recoverSubscriberConnection() {
    if (this.recovering) {
      await this.recovering
      return
    }

    this.recovering = (async () => {
      const previous = this.subscriber
      const replacement = createSubscriber()
      this.bindSubscriberEvents(replacement)
      this.subscriber = replacement

      const channels = Array.from(this.listeners.entries())
        .filter(([, handlers]) => handlers.size > 0)
        .map(([channel]) => channel)
      if (channels.length > 0) {
        await replacement.subscribe(...channels)
      }

      try {
        await previous.quit()
      } catch {
        previous.disconnect(false)
      }
    })()

    try {
      await this.recovering
    } finally {
      this.recovering = null
    }
  }

  async addChannelListener(channel: string, handler: MessageHandler): Promise<() => Promise<void>> {
    let channelListeners = this.listeners.get(channel)
    if (!channelListeners) {
      channelListeners = new Map<number, MessageHandler>()
      this.listeners.set(channel, channelListeners)
    }

    const listenerId = this.listenerSeq++
    channelListeners.set(listenerId, handler)
    const rollbackListener = () => {
      const latestListeners = this.listeners.get(channel)
      if (!latestListeners) return
      latestListeners.delete(listenerId)
      if (latestListeners.size === 0) {
        this.listeners.delete(channel)
      }
    }

    if (channelListeners.size === 1) {
      try {
        await this.subscriber.subscribe(channel)
      } catch (error) {
        if (this.shouldRecover(error)) {
          try {
            await this.recoverSubscriberConnection()
          } catch (recoverError) {
            rollbackListener()
            throw recoverError
          }
        } else {
          rollbackListener()
          throw error
        }
      }
    }

    return async () => {
      const listeners = this.listeners.get(channel)
      if (!listeners) return

      listeners.delete(listenerId)
      if (listeners.size > 0) return

      this.listeners.delete(channel)
      try {
        await this.subscriber.unsubscribe(channel)
      } catch {}
    }
  }
}

type GlobalSharedSubscriber = typeof globalThis & {
  __waoowaooSharedSubscriber?: SharedSubscriber
}

const globalForSharedSubscriber = globalThis as GlobalSharedSubscriber

export function getSharedSubscriber() {
  if (!globalForSharedSubscriber.__waoowaooSharedSubscriber) {
    globalForSharedSubscriber.__waoowaooSharedSubscriber = new SharedSubscriber()
  }
  return globalForSharedSubscriber.__waoowaooSharedSubscriber
}
