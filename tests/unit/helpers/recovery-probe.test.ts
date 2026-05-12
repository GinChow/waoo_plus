import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  recoveryProbeTestUtils,
  startRecoveryProbe,
} from '@/lib/query/hooks/run-stream/recovery-probe'

describe('recovery probe', () => {
  afterEach(() => {
    vi.useRealTimers()
    recoveryProbeTestUtils.clearSuccessfulProbeScopes()
  })

  it('retries active run recovery with empty-cooldown when the first probe returns no active run', async () => {
    vi.useFakeTimers()

    const resolveActiveRunId = vi
      .fn<({ projectId, storageScopeKey }: { projectId: string; storageScopeKey?: string }) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('run-2')
    const onRecovered = vi.fn()

    const cleanup = startRecoveryProbe({
      projectId: 'project-1',
      storageKey: 'scope:story-to-script:episode-1',
      storageScopeKey: 'episode-1',
      hasRunState: () => false,
      resolveActiveRunId,
      onRecovered,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(resolveActiveRunId).toHaveBeenCalledTimes(1)
    expect(resolveActiveRunId).toHaveBeenLastCalledWith({
      projectId: 'project-1',
      storageScopeKey: 'episode-1',
    })
    expect(onRecovered).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(
      recoveryProbeTestUtils.PROBE_ERROR_RETRY_MS,
    )
    expect(resolveActiveRunId).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(
      recoveryProbeTestUtils.PROBE_EMPTY_RETRY_MS -
        recoveryProbeTestUtils.PROBE_ERROR_RETRY_MS,
    )

    expect(resolveActiveRunId).toHaveBeenCalledTimes(2)
    expect(onRecovered).toHaveBeenCalledTimes(1)
    expect(onRecovered).toHaveBeenCalledWith('run-2')

    cleanup()
  })

  it('uses the short error-retry interval when the probe throws', async () => {
    vi.useFakeTimers()

    const resolveActiveRunId = vi
      .fn<({ projectId, storageScopeKey }: { projectId: string; storageScopeKey?: string }) => Promise<string | null>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce('run-3')
    const onRecovered = vi.fn()

    const cleanup = startRecoveryProbe({
      projectId: 'project-1',
      storageKey: 'scope:story-to-script:episode-2',
      storageScopeKey: 'episode-2',
      hasRunState: () => false,
      resolveActiveRunId,
      onRecovered,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(resolveActiveRunId).toHaveBeenCalledTimes(1)
    expect(onRecovered).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(
      recoveryProbeTestUtils.PROBE_ERROR_RETRY_MS,
    )

    expect(resolveActiveRunId).toHaveBeenCalledTimes(2)
    expect(onRecovered).toHaveBeenCalledTimes(1)
    expect(onRecovered).toHaveBeenCalledWith('run-3')

    cleanup()
  })
})
