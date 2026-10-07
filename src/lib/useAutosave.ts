import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }

interface Options<T> {
  /** Stable key for the local backup copy, e.g. `decision:<projectId>` */
  backupKey: string
  save: (value: T) => Promise<void>
  delayMs?: number
}

const RETRY_MS = [2_000, 5_000, 15_000, 30_000]

function readBackup<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(`solidaris:draft:${key}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/**
 * Autosave with a debounce, retries on failure, a local backup so typed text is never
 * lost (slow or dropped connections), and a warning before leaving with unsaved changes
 * (brief §9.5).
 */
export function useAutosave<T>({ backupKey, save, delayMs = 800 }: Options<T>) {
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const latest = useRef<T | null>(null)
  const attempt = useRef(0)
  const saveRef = useRef(save)
  saveRef.current = save
  const storageKey = `solidaris:draft:${backupKey}`

  const flush = useCallback(async () => {
    if (latest.current === null) return
    const value = latest.current
    setState({ kind: 'saving' })
    try {
      await saveRef.current(value)
      if (latest.current === value) {
        latest.current = null
        try {
          window.localStorage.removeItem(storageKey)
        } catch {
          /* storage unavailable: nothing to clean up */
        }
      }
      attempt.current = 0
      setState({ kind: 'saved', at: Date.now() })
    } catch (error) {
      setState({ kind: 'error', message: (error as Error).message })
      const wait = RETRY_MS[Math.min(attempt.current, RETRY_MS.length - 1)]
      attempt.current += 1
      timer.current = setTimeout(() => void flush(), wait)
    }
  }, [storageKey])

  const queue = useCallback(
    (value: T) => {
      latest.current = value
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(value))
      } catch {
        /* private browsing: autosave still works, only the backup is skipped */
      }
      setState({ kind: 'pending' })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delayMs)
    },
    [delayMs, flush, storageKey],
  )

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current !== null) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      clearTimeout(timer.current)
    }
  }, [])

  return { state, queue, flush, backup: () => readBackup<T>(backupKey) }
}
