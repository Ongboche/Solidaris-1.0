// Invariant 3: evidence before judgement. The database trigger enforce_rating_complete()
// applies the same rule; this copy gives instant, plain-language feedback in the UI.
import { DEFAULTS } from './config'
import type { ConfidenceLevel, Rating } from './types'

export interface RatingDraft {
  rating: Rating
  narrative: string | null
  confidence: ConfidenceLevel | null
  evidenceCount: number
  gapCount: number
}

export type Missing = 'rating' | 'narrative' | 'confidence' | 'evidence_or_gap'

export function missingForCompletion(draft: RatingDraft, minNarrative: number = DEFAULTS.minNarrativeLength): Missing[] {
  const missing: Missing[] = []
  if (draft.rating === null) missing.push('rating')
  if ((draft.narrative ?? '').trim().length < minNarrative) missing.push('narrative')
  if (draft.confidence === null) missing.push('confidence')
  if (draft.evidenceCount + draft.gapCount === 0) missing.push('evidence_or_gap')
  return missing
}

export function isRatingComplete(draft: RatingDraft, minNarrative: number = DEFAULTS.minNarrativeLength): boolean {
  return missingForCompletion(draft, minNarrative).length === 0
}
