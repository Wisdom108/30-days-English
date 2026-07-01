import type { DayLesson } from '../types'
import lessons from './lessons.json'

// The full 30-day curriculum, generated content bundled at build time.
export const CURRICULUM = lessons as unknown as DayLesson[]

export function getLesson(day: number): DayLesson | undefined {
  return CURRICULUM.find((l) => l.day === day)
}

export const TOTAL_DAYS = 30
