import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type GlossaryKey =
  | 'conditionalGo'
  | 'hold'
  | 'stopRedirect'
  | 'gate'
  | 'hrScreen'
  | 'coi'
  | 'actorMap'
  | 'communityVoice'
  | 'singleAssessor'
  | 'autoCheck'

/** Glossary term with a plain-language explanation on click or keyboard (brief §9.6). */
export function Term({ term, children }: { term: GlossaryKey; children: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="underline decoration-dotted underline-offset-4"
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-full z-20 mt-1 block w-72 max-w-[80vw] rounded border border-line bg-panel p-3 text-sm font-normal text-ink shadow-lg"
        >
          {t(`glossary.${term}`)}
        </span>
      )}
    </span>
  )
}
