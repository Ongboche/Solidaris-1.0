// Invariant 1: profiles, not scores. Every export and API payload that leaves the
// app passes through assertNoComposite(), and the tests run it on sample payloads.

const FORBIDDEN_KEYS =
  /^(average|avg|mean|median|index|score|total|overall|composite|percent|percentage|rank|ranking|stars?)$|(_|^)(average|avg|mean|index|score|total|overall|composite|percent|rank)(_|$)/i

export class CompositeScoreError extends Error {
  constructor(path: string) {
    super(`Composite score field "${path}" is not allowed (invariant 1: profiles, not scores)`)
    this.name = 'CompositeScoreError'
  }
}

/** Throws if any key in the payload looks like an aggregate across domains. */
export function assertNoComposite(payload: unknown, path = ''): void {
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoComposite(item, `${path}[${i}]`))
    return
  }
  if (payload && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      const here = path ? `${path}.${key}` : key
      if (FORBIDDEN_KEYS.test(key)) throw new CompositeScoreError(here)
      assertNoComposite(value, here)
    }
  }
}

/** Descriptive counts are allowed (brief §3.1), e.g. "6 of 9 domains rated". */
export function ratedCount(ratings: Array<number | null>): { rated: number; of: number } {
  return { rated: ratings.filter((r) => r !== null).length, of: ratings.length }
}
