'use client'

import React, { useCallback } from 'react'
import VideoPanelCardHeader from './VideoPanelCardHeader'
import VideoPanelCardBody from './VideoPanelCardBody'
import VideoPanelCardFooter from './VideoPanelCardFooter'
import { useVideoPanelActions, type VideoPanelCardShellProps } from './hooks/useVideoPanelActions'
import { useUpdateProjectPanelDuration } from '@/lib/query/hooks'

export type { VideoPanelCardShellProps }

function VideoPanelCardLayout(props: VideoPanelCardShellProps) {
  const runtime = useVideoPanelActions(props)
  const updateDurationMutation = useUpdateProjectPanelDuration(props.projectId)

  const handleUpdateDuration = useCallback((storyboardId: string, panelIndex: number, duration: number | null) => {
    updateDurationMutation.mutate({ storyboardId, panelIndex, duration })
  }, [updateDurationMutation])

  return (
    <div className="glass-surface-elevated overflow-visible">
      <VideoPanelCardHeader runtime={runtime} />
      <VideoPanelCardBody runtime={runtime} onUpdateDuration={handleUpdateDuration} />
      <VideoPanelCardFooter runtime={runtime} />
    </div>
  )
}

export default React.memo(VideoPanelCardLayout)
