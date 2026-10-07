// Defaults for the open decisions in brief §16. The server reads the same values
// from the settings table; these are used for instant client-side feedback.
export const DEFAULTS = {
  /** §16.3 */
  minNarrativeLength: 50,
  /** §16.1: ±1-point agreement; divergence above this needs discussion */
  agreementThreshold: 1,
  /** §16.2: single-assessor profiles allowed, labelled Exploratory */
  allowSingleAssessor: true,
} as const
