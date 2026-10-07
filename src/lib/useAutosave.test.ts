import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAutosave } from './useAutosave'

describe('useAutosave (brief §9.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('debounces, saves the latest value once, then clears the local copy', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave<string>({ backupKey: 'k1', save }))
    act(() => {
      result.current.queue('a')
      result.current.queue('ab')
    })
    expect(window.localStorage.getItem('solidaris:draft:k1')).toBe('"ab"')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('ab')
    expect(result.current.state.kind).toBe('saved')
    expect(window.localStorage.getItem('solidaris:draft:k1')).toBeNull()
  })

  it('keeps the typed text and retries when saving fails', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave<string>({ backupKey: 'k2', save }))
    act(() => result.current.queue('important'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(result.current.state.kind).toBe('error')
    expect(result.current.backup()).toBe('important')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.state.kind).toBe('saved')
  })
})
