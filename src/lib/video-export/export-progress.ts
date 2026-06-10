export type TimelineExportProgress =
  | { phase: 'preparing'; percent: number }
  | { phase: 'downloading'; percent: number; current: number; total: number }
  | { phase: 'packing'; percent: number }

export function calculateDownloadProgress(current: number, total: number): number {
  if (total <= 0) return 5
  const ratio = Math.min(1, Math.max(0, current / total))
  return Math.round(5 + ratio * 80)
}

export function calculatePackingProgress(zipPercent: number): number {
  const ratio = Math.min(100, Math.max(0, zipPercent)) / 100
  return Math.round(85 + ratio * 15)
}
