// UI feature flags (brief §16.4). T7, T9, T10 are proposals pending the team's review.
// Gate enforcement is a server setting (settings.gate_enforcement), not a UI flag.
const on = (value: unknown) => String(value ?? '').toLowerCase() === 'true'

export const flags = {
  signals: on(import.meta.env.VITE_FLAG_SIGNALS),
  uptake: on(import.meta.env.VITE_FLAG_UPTAKE),
  learning: on(import.meta.env.VITE_FLAG_LEARNING),
  googleSignIn: on(import.meta.env.VITE_FLAG_GOOGLE_SIGN_IN),
  legacyExport: on(import.meta.env.VITE_FLAG_LEGACY_EXPORT),
} as const

/** Signed-in users are signed out after this long without activity (brief §12). */
export const IDLE_TIMEOUT_MINUTES = 30

/** Version of the privacy notice users accept; bump when the text changes. */
export const NOTICE_VERSION = '2026-10-draft-1'
