// Divergence (brief §6.4): max − min of the submitted independent ratings for ONE domain,
// ignoring NULLs. It is per-domain only and never combined across domains (invariant 1).
import { DEFAULTS } from './config'
import type { Rating } from './types'

/** null when fewer than two assessors rated the domain: there is nothing to compare. */
export function divergence(ratings: Rating[]): number | null {
  const rated = ratings.filter((r): r is Exclude<Rating, null> => r !== null)
  if (rated.length < 2) return null
  return Math.max(...rated) - Math.min(...rated)
}

export function needsDiscussion(ratings: Rating[], threshold: number = DEFAULTS.agreementThreshold): boolean {
  const d = divergence(ratings)
  return d !== null && d > threshold
}
