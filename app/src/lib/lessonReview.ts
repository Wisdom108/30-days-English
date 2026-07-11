// Lesson-level spaced review on a fixed interval ladder. A completed day
// re-surfaces for a short "reheat" round (re-listen + retell) at widening
// intervals, so listened-once content actually consolidates. Fixed intervals
// (not SM-2) on purpose: rounds are whole-lesson tasks, not flashcards, and a
// fixed ladder is predictable for the learner and trivially queryable for the
// worker's due-push cron.
import type { AppState, LessonReview } from '../types'

/** Hours between rounds: 6h → 1d → 2d → 4d → 7d → 14d, then graduated. */
export const REVIEW_LADDER_HOURS = [6, 24, 48, 96, 168, 336] as const

export const TOTAL_REVIEW_ROUNDS = REVIEW_LADDER_HOURS.length

const HOUR_MS = 3_600_000

/** Start the ladder for a freshly completed day. Existing entries are kept —
 *  re-completing a block later must not reset review progress. */
export function scheduleLessonReview(
  reviews: Record<number, LessonReview> | undefined,
  day: number,
  now = Date.now(),
): Record<number, LessonReview> {
  const out = { ...(reviews ?? {}) }
  if (!out[day]) {
    out[day] = { stage: 0, nextAt: now + REVIEW_LADDER_HOURS[0] * HOUR_MS, lastAt: now }
  }
  return out
}

/** Finish the current round: advance one rung, or graduate past the last one. */
export function completeLessonReview(
  reviews: Record<number, LessonReview> | undefined,
  day: number,
  now = Date.now(),
): Record<number, LessonReview> {
  const cur = reviews?.[day]
  if (!cur || cur.nextAt === null) return reviews ?? {}
  const stage = cur.stage + 1
  const hours = REVIEW_LADDER_HOURS[stage] as number | undefined
  return {
    ...reviews,
    [day]: { stage, nextAt: hours === undefined ? null : now + hours * HOUR_MS, lastAt: now },
  }
}

export interface DueLessonReview {
  day: number
  review: LessonReview
}

/** Rounds due now, earliest first. */
export function dueLessonReviews(
  reviews: Record<number, LessonReview> | undefined,
  now = Date.now(),
): DueLessonReview[] {
  if (!reviews) return []
  return Object.entries(reviews)
    .map(([day, review]) => ({ day: Number(day), review }))
    .filter(({ review }) => review.nextAt !== null && review.nextAt <= now)
    .sort((a, b) => (a.review.nextAt ?? 0) - (b.review.nextAt ?? 0) || a.day - b.day)
}

/** Earliest upcoming (or overdue) round across all lessons — reported to the
 *  worker on progress sync so the due-push cron can filter on a plain column
 *  instead of parsing blobs. Null when nothing is scheduled. */
export function earliestReviewAt(state: AppState): number | null {
  let min: number | null = null
  for (const review of Object.values(state.lessonReviews ?? {})) {
    if (review.nextAt !== null && (min === null || review.nextAt < min)) min = review.nextAt
  }
  return min
}

/** Human label for how far a round's interval reaches (回炉间隔展示用). */
export function ladderLabel(stage: number): string {
  const hours = REVIEW_LADDER_HOURS[stage] as number | undefined
  if (hours === undefined) return '已毕业'
  if (hours < 24) return `${hours} 小时后`
  return `${Math.round(hours / 24)} 天后`
}

/** Status line for a single lesson's ladder entry (DayView 收尾卡用)。 */
export function reviewStatusLabel(review: LessonReview | undefined, now = Date.now()): string {
  if (!review) return '6 小时后开始间隔回炉'
  if (review.nextAt === null) return `${TOTAL_REVIEW_ROUNDS} 轮回炉已毕业`
  if (review.nextAt <= now) return '回炉时间到了 · 复习页见'
  const hours = Math.max(1, Math.round((review.nextAt - now) / HOUR_MS))
  return hours < 24 ? `约 ${hours} 小时后回炉` : `约 ${Math.round(hours / 24)} 天后回炉`
}

/** Ladder entries for days completed BEFORE this feature shipped: they have a
 *  completedAt but no review entry (completeBlock only schedules on a fresh
 *  completion). Seed each missing one as due now — the back catalog surfaces
 *  in 课程回炉 earliest-first and the learner works through it at their pace.
 *  Idempotent: existing entries are never touched. */
export function backfillLessonReviews(state: AppState, now = Date.now()): AppState {
  let reviews: Record<number, LessonReview> | null = null
  for (const [k, d] of Object.entries(state.days)) {
    const day = Number(k)
    if (!d?.completedAt || state.lessonReviews?.[day]) continue
    reviews ??= { ...(state.lessonReviews ?? {}) }
    const completedMs = new Date(`${d.completedAt}T00:00:00`).getTime()
    reviews[day] = { stage: 0, nextAt: now, lastAt: Number.isFinite(completedMs) ? completedMs : now }
  }
  return reviews ? { ...state, lessonReviews: reviews } : state
}
