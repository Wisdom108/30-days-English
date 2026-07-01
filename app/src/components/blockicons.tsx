import { Headphones, Layers, Mic, BookOpen, PenLine } from 'lucide-react'
import type { BlockKey } from '../types'

// Monochrome line icons per study block (replaces decorative emoji, Notion-clean).
const MAP: Record<BlockKey, typeof Headphones> = {
  listening: Headphones,
  vocab: Layers,
  speaking: Mic,
  reading: BookOpen,
  writing: PenLine,
}

export function BlockIcon({
  k,
  size = 16,
  className = 'text-fg-secondary',
}: {
  k: BlockKey
  size?: number
  className?: string
}) {
  const Icon = MAP[k]
  return <Icon size={size} className={className} strokeWidth={1.9} />
}
