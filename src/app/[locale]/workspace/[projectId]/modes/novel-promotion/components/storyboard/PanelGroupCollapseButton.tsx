import React from 'react'

interface PanelGroupCollapseButtonProps {
  label: string
  title: string
  onClick: () => void
}

export default function PanelGroupCollapseButton({
  label,
  title,
  onClick,
}: PanelGroupCollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto relative z-10 ml-auto inline-flex h-5 min-w-13 touch-manipulation cursor-pointer items-center justify-center rounded-full border border-[var(--glass-accent-from)] bg-[var(--glass-bg-surface)] px-2 text-[10px] font-semibold text-[var(--glass-accent-from)] shadow-[var(--glass-shadow-sm)] hover:bg-[var(--glass-accent-from)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--glass-stroke-focus)] focus-visible:ring-offset-2"
      title={title}
    >
      {label}
    </button>
  )
}
