'use client'

import { ReactNode } from 'react'

interface StoryboardStageShellProps {
  children: ReactNode
}

export default function StoryboardStageShell({
  children,
}: StoryboardStageShellProps) {
  return (
    <div className="space-y-6 pb-20">
      {children}
    </div>
  )
}
